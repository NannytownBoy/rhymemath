#!/usr/bin/env node
/**
 * migrate-v6.mjs
 * RhymeMath v6 schema migration.
 *
 * Adds:
 *   analyses.scoring_version         — which scorer produced this row
 *   analyses.cid_signals             — JSONB snapshot of CID signals at score time
 *   analyses.suppression_flags       — JSONB: which suppression rules fired
 *   analyses.conceptual_score        — cross-cutting conceptual lyricism signal (not a 6th pillar)
 *   cid_cultural_records.provenance  — source, version, confidence lineage
 *   cid_cultural_records.canon_ref   — FK to cid_canon_examples if this anchors a canon example
 *   cid_canon_examples               — canon calibration anchors (NOT scoring table)
 *   cid_candidate_queue              — review-only learned candidates (miner output)
 *   cid_cultural_records: mined_only, ai_only flags to prevent auto-promotion
 */

import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ||
    "postgresql://postgres:TsKMoFmORcQVhbhlDMJVlsbTrKGmRELC@reseau.proxy.rlwy.net:12215/railway",
});

async function run() {
  console.log("RhymeMath v6 migration starting...");

  // ── 1. analyses table additions ──────────────────────────────────────────
  await pool.query(`
    ALTER TABLE analyses
      ADD COLUMN IF NOT EXISTS scoring_version    TEXT DEFAULT 'v5.0',
      ADD COLUMN IF NOT EXISTS cid_signals        JSONB DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS suppression_flags  JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS conceptual_score   REAL;
  `);
  console.log("  ✓ analyses: scoring_version, cid_signals, suppression_flags, conceptual_score");

  // ── 2. comparisons table additions ──────────────────────────────────────
  await pool.query(`
    ALTER TABLE comparisons
      ADD COLUMN IF NOT EXISTS scoring_version    TEXT DEFAULT 'v5.0',
      ADD COLUMN IF NOT EXISTS cid_signals_a      JSONB DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS cid_signals_b      JSONB DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS suppression_flags_a JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS suppression_flags_b JSONB DEFAULT '[]'::jsonb;
  `);
  console.log("  ✓ comparisons: scoring_version, cid_signals, suppression_flags");

  // ── 3. cid_cultural_records additions ────────────────────────────────────
  await pool.query(`
    ALTER TABLE cid_cultural_records
      ADD COLUMN IF NOT EXISTS provenance         TEXT,
      ADD COLUMN IF NOT EXISTS source_version     TEXT,
      ADD COLUMN IF NOT EXISTS mined_only         BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS ai_only            BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS promotion_blocked  BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS canon_category     TEXT;
  `);
  console.log("  ✓ cid_cultural_records: provenance, source_version, mined_only, ai_only, promotion_blocked, canon_category");

  // ── 3b. Add mined_only to CID child tables ────────────────────────────────
  await pool.query(`
    ALTER TABLE cid_aliases ADD COLUMN IF NOT EXISTS mined_only BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE cid_entendre_candidates ADD COLUMN IF NOT EXISTS mined_only BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE cid_punchline_patterns ADD COLUMN IF NOT EXISTS mined_only BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE cid_figures ADD COLUMN IF NOT EXISTS mined_only BOOLEAN NOT NULL DEFAULT FALSE;
  `);
  console.log("  ✓ cid child tables: mined_only columns");

  // ── 4. cid_canon_examples — calibration anchors only, never scored directly ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cid_canon_examples (
      id              SERIAL PRIMARY KEY,
      artist          TEXT NOT NULL,
      song            TEXT NOT NULL,
      category        TEXT NOT NULL,  -- flow | rhyme_craft | wordplay | storytelling | punchlines | conceptual
      section_label   TEXT,           -- verse_1 | verse_2 etc
      notes           TEXT,           -- why this is canon for this category
      created_at      BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
    );
  `);
  console.log("  ✓ cid_canon_examples table");

  // ── 5. cid_candidate_queue — miner/AI output, NEVER scores directly ──────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cid_candidate_queue (
      id              SERIAL PRIMARY KEY,
      term            TEXT NOT NULL,
      candidate_type  TEXT NOT NULL,  -- cultural_record | alias | entendre | punchline | figure
      proposed_meaning TEXT,
      source          TEXT NOT NULL,  -- miner | ai_gpt | annotation | manual
      source_version  TEXT,
      evidence_span   TEXT,           -- lyric window the candidate came from
      section_label   TEXT,
      artist_context  TEXT,
      confidence      REAL NOT NULL DEFAULT 0.5,
      provenance      TEXT,           -- JSON: {run_id, artist, song, timestamp}
      review_status   TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
      reviewed_by     TEXT,
      reviewed_at     BIGINT,
      promoted_to_id  TEXT,           -- record_id/alias_id after promotion
      created_at      BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
    );
  `);
  console.log("  ✓ cid_candidate_queue table");

  // ── 6. Indexes ────────────────────────────────────────────────────────────
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_analyses_scoring_version ON analyses(scoring_version);
    CREATE INDEX IF NOT EXISTS idx_candidate_queue_review_status ON cid_candidate_queue(review_status);
    CREATE INDEX IF NOT EXISTS idx_candidate_queue_candidate_type ON cid_candidate_queue(candidate_type);
    CREATE INDEX IF NOT EXISTS idx_canon_examples_category ON cid_canon_examples(category);
  `);
  console.log("  ✓ indexes");

  await pool.end();
  console.log("\nv6 migration complete.");
}

run().catch(e => { console.error(e); process.exit(1); });
