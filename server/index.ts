import "dotenv/config";
import express, { Response, NextFunction } from 'express';
import type { Request } from 'express';
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { startIntegrityScheduler } from "./integrity";
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

    // ── Column migrations: rename old columns to match current Drizzle schema ──
    // comparisons: artist_a → artist_a_name, song_a → song_a_name, etc.
    await pool.query(`
      DO $$ BEGIN
        -- Rename artist_a → artist_a_name
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='comparisons' AND column_name='artist_a')
          AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='comparisons' AND column_name='artist_a_name') THEN
          ALTER TABLE comparisons RENAME COLUMN artist_a TO artist_a_name;
        END IF;
        -- Rename song_a → song_a_name
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='comparisons' AND column_name='song_a')
          AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='comparisons' AND column_name='song_a_name') THEN
          ALTER TABLE comparisons RENAME COLUMN song_a TO song_a_name;
        END IF;
        -- verse_a stays as verse_a (schema expects verse_a) -- no rename needed
        -- If a previous bad migration renamed verse_a → verse_a_text, fix it back
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='comparisons' AND column_name='verse_a_text')
          AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='comparisons' AND column_name='verse_a') THEN
          ALTER TABLE comparisons RENAME COLUMN verse_a_text TO verse_a;
        END IF;
        -- Rename artist_b → artist_b_name
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='comparisons' AND column_name='artist_b')
          AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='comparisons' AND column_name='artist_b_name') THEN
          ALTER TABLE comparisons RENAME COLUMN artist_b TO artist_b_name;
        END IF;
        -- Rename song_b → song_b_name
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='comparisons' AND column_name='song_b')
          AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='comparisons' AND column_name='song_b_name') THEN
          ALTER TABLE comparisons RENAME COLUMN song_b TO song_b_name;
        END IF;
        -- verse_b stays as verse_b (schema expects verse_b) -- no rename needed
        -- If a previous bad migration renamed verse_b → verse_b_text, fix it back
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='comparisons' AND column_name='verse_b_text')
          AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='comparisons' AND column_name='verse_b') THEN
          ALTER TABLE comparisons RENAME COLUMN verse_b_text TO verse_b;
        END IF;
        -- Rename score_overall_a → score_a
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='comparisons' AND column_name='score_overall_a')
          AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='comparisons' AND column_name='score_a') THEN
          ALTER TABLE comparisons RENAME COLUMN score_overall_a TO score_a;
        END IF;
        -- Rename score_overall_b → score_b
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='comparisons' AND column_name='score_overall_b')
          AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='comparisons' AND column_name='score_b') THEN
          ALTER TABLE comparisons RENAME COLUMN score_overall_b TO score_b;
        END IF;
        -- Add result_id column if missing
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='comparisons' AND column_name='result_id') THEN
          ALTER TABLE comparisons ADD COLUMN result_id TEXT NOT NULL DEFAULT '';
          UPDATE comparisons SET result_id = 'legacy-' || id::text WHERE result_id = '';
        END IF;
        -- Add winner_name column if missing
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='comparisons' AND column_name='winner_name') THEN
          ALTER TABLE comparisons ADD COLUMN winner_name TEXT NOT NULL DEFAULT '';
        END IF;
        -- Ensure score_a / score_b exist (add with default 0 if completely missing)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='comparisons' AND column_name='score_a') THEN
          ALTER TABLE comparisons ADD COLUMN score_a REAL NOT NULL DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='comparisons' AND column_name='score_b') THEN
          ALTER TABLE comparisons ADD COLUMN score_b REAL NOT NULL DEFAULT 0;
        END IF;
        -- Fix winner column: add if missing
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='comparisons' AND column_name='winner') THEN
          ALTER TABLE comparisons ADD COLUMN winner TEXT NOT NULL DEFAULT '';
        END IF;
        -- Add verse_label columns if missing
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='comparisons' AND column_name='verse_label_a') THEN
          ALTER TABLE comparisons ADD COLUMN verse_label_a TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='comparisons' AND column_name='verse_label_b') THEN
          ALTER TABLE comparisons ADD COLUMN verse_label_b TEXT;
        END IF;
        -- Fix comparisons created_at: rename to bigint if timestamptz
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='comparisons' AND column_name='created_at' AND data_type='timestamp with time zone'
        ) THEN
          ALTER TABLE comparisons DROP COLUMN created_at;
          ALTER TABLE comparisons ADD COLUMN created_at BIGINT NOT NULL DEFAULT 0;
        END IF;
      END $$;
    `);
    console.log("[startup] Column migrations applied.");

    // ── Threads schema migrations ─────────────────────────────────────────────
    await pool.query(`
      DO $$ BEGIN
        -- threads table may have been created with old schema (author_id INTEGER).
        -- Drizzle expects author_username TEXT. Patch if needed.
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='threads' AND column_name='author_id')
          AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='threads' AND column_name='author_username') THEN
          ALTER TABLE threads ADD COLUMN author_username TEXT NOT NULL DEFAULT 'anonymous';
        END IF;
        -- threads: add category column if missing
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='threads' AND column_name='category') THEN
          ALTER TABLE threads ADD COLUMN category TEXT NOT NULL DEFAULT 'general';
        END IF;
        -- threads: add artist_tag column if missing
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='threads' AND column_name='artist_tag') THEN
          ALTER TABLE threads ADD COLUMN artist_tag TEXT;
        END IF;
        -- threads: add reply_count column if missing
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='threads' AND column_name='reply_count') THEN
          ALTER TABLE threads ADD COLUMN reply_count INTEGER NOT NULL DEFAULT 0;
        END IF;
        -- threads: fix created_at type (old schema used TIMESTAMPTZ, Drizzle expects INTEGER/BIGINT)
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='threads' AND column_name='created_at' AND data_type='timestamp with time zone'
        ) THEN
          ALTER TABLE threads DROP COLUMN created_at;
          ALTER TABLE threads ADD COLUMN created_at BIGINT NOT NULL DEFAULT 0;
        END IF;
        -- threads: add result_id for linking to analyses
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='threads' AND column_name='result_id') THEN
          ALTER TABLE threads ADD COLUMN result_id TEXT;
        END IF;
        -- threads: add result_type ("solo" | "battle")
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='threads' AND column_name='result_type') THEN
          ALTER TABLE threads ADD COLUMN result_type TEXT;
        END IF;
        -- threads: add result_label (denormalized display label)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='threads' AND column_name='result_label') THEN
          ALTER TABLE threads ADD COLUMN result_label TEXT;
        END IF;
        -- posts: patch author_id → author_username if needed
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='author_id')
          AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='author_username') THEN
          ALTER TABLE posts ADD COLUMN author_username TEXT NOT NULL DEFAULT 'anonymous';
        END IF;
        -- posts: fix created_at type
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='posts' AND column_name='created_at' AND data_type='timestamp with time zone'
        ) THEN
          ALTER TABLE posts DROP COLUMN created_at;
          ALTER TABLE posts ADD COLUMN created_at BIGINT NOT NULL DEFAULT 0;
        END IF;
      END $$;
    `);
    console.log("[startup] Threads/posts schema migrations applied.");

    // Ongoing cleanup: remove test/dummy/typo entries on every boot
    const cleaned = await pool.query(`
      WITH del_analyses AS (
        DELETE FROM analyses
        WHERE LOWER(TRIM(artist_name)) IN (
             'test', 'asdf', 'aaa', 'xxx', 'zzz', 'foo', 'bar', 'baz', 'qwerty',
             'kendrick lemar', 'kendrick lamar jr', 'kendrick lamaar', 'kendrick lamer',
             'kendrick lemar lamar', 'kdot', 'k dot',
             'drake aubrey', 'aubrey drake', 'drak',
             'jay z', 'jayz', 'jay-z.',
             'eminem slim', 'slim shady eminem',
             'biggie smalls notorious', 'notorious big', 'biggy',
             'lil wayne weezy', 'weezy f baby',
             'nas nasir', 'nasir jones nas'
           )
           OR LOWER(TRIM(song_name)) IN ('test', 'asdf', 'aaa', 'xxx', 'zzz', 'foo', 'bar', 'baz', 'qwerty', 'untitled', 'unknown',
             'new orl state of mind', 'new york state of mine', 'new york state of mind (misspelled)',
             'ny state of mind', 'new york state')
           OR TRIM(artist_name) = ''
           OR TRIM(song_name)   = ''
           OR verse LIKE '[No verse provided%'
           OR LENGTH(TRIM(verse)) < 20
        RETURNING id
      ),
      del_comparisons AS (
        DELETE FROM comparisons
        WHERE LOWER(TRIM(artist_a_name)) IN (
             'test', 'asdf', 'aaa', 'xxx', 'zzz', 'foo', 'bar', 'baz', 'qwerty',
             'kendrick lemar', 'kendrick lamar jr', 'kendrick lamaar', 'kendrick lamer',
             'kendrick lemar lamar', 'kdot', 'k dot',
             'drake aubrey', 'aubrey drake', 'drak',
             'jay z', 'jayz', 'jay-z.',
             'eminem slim', 'slim shady eminem',
             'biggie smalls notorious', 'notorious big', 'biggy',
             'lil wayne weezy', 'weezy f baby',
             'nas nasir', 'nasir jones nas'
           )
           OR LOWER(TRIM(artist_b_name)) IN (
             'test', 'asdf', 'aaa', 'xxx', 'zzz', 'foo', 'bar', 'baz', 'qwerty',
             'kendrick lemar', 'kendrick lamar jr', 'kendrick lamaar', 'kendrick lamer',
             'kendrick lemar lamar', 'kdot', 'k dot',
             'drake aubrey', 'aubrey drake', 'drak',
             'jay z', 'jayz', 'jay-z.',
             'eminem slim', 'slim shady eminem',
             'biggie smalls notorious', 'notorious big', 'biggy',
             'lil wayne weezy', 'weezy f baby',
             'nas nasir', 'nasir jones nas'
           )
           OR TRIM(artist_a_name) = ''
           OR TRIM(artist_b_name) = ''
        RETURNING id
      )
      SELECT
        (SELECT COUNT(*) FROM del_analyses)   AS analyses_removed,
        (SELECT COUNT(*) FROM del_comparisons) AS comparisons_removed;
    `);
    const { analyses_removed, comparisons_removed } = cleaned.rows[0];
    if (Number(analyses_removed) > 0 || Number(comparisons_removed) > 0) {
      console.log(`[startup] Cleaned up bad rows: ${analyses_removed} analyses, ${comparisons_removed} comparisons removed.`);
    }

    // Deduplicate: for same artist+song, keep only the highest scoring entry
    const deduped = await pool.query(`
      DELETE FROM analyses
      WHERE id IN (
        SELECT id FROM (
          SELECT id,
            ROW_NUMBER() OVER (
              PARTITION BY LOWER(TRIM(artist_name)), LOWER(TRIM(song_name))
              ORDER BY score_overall DESC, created_at DESC
            ) AS rn
          FROM analyses
        ) ranked
        WHERE rn > 1
      );
    `);
    if (deduped.rowCount && deduped.rowCount > 0) {
      console.log(`[startup] Removed ${deduped.rowCount} lower-rated duplicate song entries.`);
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
  startIntegrityScheduler();

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
