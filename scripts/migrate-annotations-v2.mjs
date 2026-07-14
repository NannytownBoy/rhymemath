#!/usr/bin/env node
/**
 * migrate-annotations-v2.mjs
 * Adds image_url, upvotes, char_start, char_end, annotation_type,
 * extracted_cid_candidates, and improvement_suggestions to annotations.
 */
import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || (() => { throw new Error("DATABASE_URL env var is required — set it before running this script"); })(),
});

async function run() {
  console.log("Running annotations v2 migration...");

  // Extend annotations table
  await pool.query(`
    ALTER TABLE annotations
      ADD COLUMN IF NOT EXISTS image_url         TEXT,
      ADD COLUMN IF NOT EXISTS upvotes           INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS char_start        INTEGER,
      ADD COLUMN IF NOT EXISTS char_end          INTEGER,
      ADD COLUMN IF NOT EXISTS annotation_type   TEXT DEFAULT 'meaning',
      ADD COLUMN IF NOT EXISTS extracted_cid     JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS upvoted_by        JSONB DEFAULT '[]'::jsonb;
  `);
  console.log("  ✓ annotations extended");

  // Improvement suggestions table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS annotation_improvements (
      id              SERIAL PRIMARY KEY,
      annotation_id   INTEGER NOT NULL REFERENCES annotations(id) ON DELETE CASCADE,
      suggested_by    INTEGER REFERENCES community_users(id),
      reason          TEXT NOT NULL,   -- restates_line | missing_something | stretch | other
      suggestion      TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'pending',  -- pending | accepted | rejected
      reviewed_at     BIGINT,
      created_at      BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
    );
  `);
  console.log("  ✓ annotation_improvements table");

  // Upvotes table (to prevent double-voting)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS annotation_upvotes (
      annotation_id   INTEGER NOT NULL REFERENCES annotations(id) ON DELETE CASCADE,
      user_id         INTEGER NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
      created_at      BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
      PRIMARY KEY (annotation_id, user_id)
    );
  `);
  console.log("  ✓ annotation_upvotes table");

  await pool.end();
  console.log("Done.");
}

run().catch(e => { console.error(e); process.exit(1); });
