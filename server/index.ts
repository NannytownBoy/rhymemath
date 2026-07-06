import "dotenv/config";
import express, { Response, NextFunction } from 'express';
import type { Request } from 'express';
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "node:http";
import { Pool } from "pg";

async function ensureTables() {
  if (!process.env.DATABASE_URL) return;
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  });
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS comparisons (
        id SERIAL PRIMARY KEY,
        result_id TEXT NOT NULL UNIQUE,
        artist_a TEXT NOT NULL,
        song_a TEXT NOT NULL,
        verse_a TEXT NOT NULL,
        artist_b TEXT NOT NULL,
        song_b TEXT NOT NULL,
        verse_b TEXT NOT NULL,
        scoring_mode TEXT NOT NULL DEFAULT 'standard',
        custom_weights TEXT,
        result_json TEXT NOT NULL,
        score_overall_a REAL,
        score_overall_b REAL,
        winner TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS analyses (
        id SERIAL PRIMARY KEY,
        result_id TEXT NOT NULL UNIQUE,
        artist_name TEXT NOT NULL,
        song_name TEXT NOT NULL,
        verse_label TEXT,
        verse TEXT NOT NULL,
        scoring_mode TEXT NOT NULL DEFAULT 'standard',
        custom_weights TEXT,
        result_json TEXT NOT NULL,
        score_overall REAL NOT NULL DEFAULT 0,
        score_flow REAL NOT NULL DEFAULT 0,
        score_wordplay REAL NOT NULL DEFAULT 0,
        score_storytelling REAL NOT NULL DEFAULT 0,
        score_rhyming REAL NOT NULL DEFAULT 0,
        score_punchlines REAL NOT NULL DEFAULT 0,
        created_at BIGINT NOT NULL DEFAULT 0
      );
      -- Fix created_at column type if it was created wrong (TIMESTAMPTZ -> BIGINT)
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'analyses'
          AND column_name = 'created_at'
          AND data_type = 'timestamp with time zone'
        ) THEN
          ALTER TABLE analyses DROP COLUMN created_at;
          ALTER TABLE analyses ADD COLUMN created_at BIGINT NOT NULL DEFAULT 0;
        END IF;
      END $$;
      CREATE TABLE IF NOT EXISTS community_users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        bio TEXT,
        avatar_url TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS threads (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        author_id INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS posts (
        id SERIAL PRIMARY KEY,
        thread_id INTEGER NOT NULL,
        body TEXT NOT NULL,
        author_id INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log("[startup] Database tables verified/created.");
    // One-time cleanup: remove test/dummy entries
    const cleaned = await pool.query(`
      WITH del_analyses AS (
        DELETE FROM analyses
        WHERE LOWER(TRIM(artist_name)) = 'test'
           OR LOWER(TRIM(song_name))   = 'test'
        RETURNING id
      ),
      del_comparisons AS (
        DELETE FROM comparisons
        WHERE LOWER(TRIM(artist_a)) = 'test'
           OR LOWER(TRIM(artist_b)) = 'test'
        RETURNING id
      )
      SELECT
        (SELECT COUNT(*) FROM del_analyses)   AS analyses_removed,
        (SELECT COUNT(*) FROM del_comparisons) AS comparisons_removed;
    `);
    const { analyses_removed, comparisons_removed } = cleaned.rows[0];
    if (Number(analyses_removed) > 0 || Number(comparisons_removed) > 0) {
      console.log(`[startup] Cleaned up test rows: ${analyses_removed} analyses, ${comparisons_removed} comparisons removed.`);
    }
  } catch (err) {
    console.error("[startup] Table creation error:", err);
  } finally {
    await pool.end();
  }
}

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await ensureTables();
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  const host = process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1";
  httpServer.listen(port, host, () => {
    log(`serving on port ${port}`);
  });
})();
