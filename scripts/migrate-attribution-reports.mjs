#!/usr/bin/env node
/**
 * migrate-attribution-reports.mjs
 * Creates attribution_reports table for wrong-artist flags.
 * Also adds section_weight_multiplier column to analyses if missing.
 */
import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || (() => { throw new Error("DATABASE_URL env var is required — set it before running this script"); })(),
});

async function run() {
  console.log("Running attribution + section_type migration...");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS attribution_reports (
      id              SERIAL PRIMARY KEY,
      analysis_id     TEXT NOT NULL,          -- result_id from analyses
      artist_name     TEXT NOT NULL,          -- what the DB thinks the artist is
      song_name       TEXT NOT NULL,
      reported_artist TEXT,                   -- what the user says it actually is
      reason          TEXT,                   -- freeform note
      reported_by     INTEGER REFERENCES community_users(id),
      status          TEXT NOT NULL DEFAULT 'open',  -- open | resolved | dismissed
      resolved_by     INTEGER REFERENCES community_users(id),
      resolution_note TEXT,
      created_at      BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
      updated_at      BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
    );
  `);
  console.log("  ✓ attribution_reports table");

  // Add section_weight_multiplier column to analyses if not present
  await pool.query(`
    ALTER TABLE analyses
      ADD COLUMN IF NOT EXISTS section_weight_multiplier REAL DEFAULT 1.0;
  `);
  console.log("  ✓ analyses.section_weight_multiplier column");

  // Back-fill weight multipliers based on existing section_label
  await pool.query(`
    UPDATE analyses SET section_weight_multiplier =
      CASE
        WHEN section_label IN ('hook','chorus','pre_hook') THEN 0.50
        WHEN section_label IN ('intro','outro')            THEN 0.30
        WHEN section_label IN ('bridge','interlude')       THEN 0.40
        WHEN section_label = 'unknown'                     THEN 0.70
        ELSE 1.0   -- verse_1, verse_2, verse_3, verse_4 = full weight
      END
    WHERE section_weight_multiplier IS NULL OR section_weight_multiplier = 1.0;
  `);
  console.log("  ✓ back-filled section_weight_multiplier on existing rows");

  await pool.end();
  console.log("Done.");
}

run().catch(e => { console.error(e); process.exit(1); });
