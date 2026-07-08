/**
 * cid-migrate.mjs
 * Creates all CID v5.4 tables in Railway Postgres.
 * Safe to run multiple times (CREATE TABLE IF NOT EXISTS).
 *
 * Run: DATABASE_URL="..." node scripts/cid-migrate.mjs
 */

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

console.log('🎯  CID v5.4 — Creating tables...\n');

await pool.query(`
  -- ── cultural_records (import_order 4) ──────────────────────────────────────
  CREATE TABLE IF NOT EXISTS cid_cultural_records (
    record_id         TEXT PRIMARY KEY,
    term              TEXT NOT NULL,
    canonical_meaning TEXT,
    category_primary  TEXT,
    category_secondary TEXT,
    domains           TEXT,          -- semicolon-separated
    era               TEXT,
    region            TEXT,
    confidence        INTEGER,
    review_status     TEXT NOT NULL DEFAULT 'needs_review',
    status            TEXT NOT NULL DEFAULT 'active',
    source_id         TEXT,
    risk_flag         TEXT DEFAULT 'low',
    sensitivity_tag   TEXT,
    display_label     TEXT,
    notes             TEXT,
    owner             TEXT,
    last_reviewed_at  TEXT,
    approved_by       TEXT,
    created_at        TIMESTAMPTZ DEFAULT NOW()
  );

  -- ── aliases (import_order 5) ────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS cid_aliases (
    alias_id            TEXT PRIMARY KEY,
    alias_text          TEXT NOT NULL,
    canonical_record_id TEXT REFERENCES cid_cultural_records(record_id),
    alias_type          TEXT,
    confidence          INTEGER,
    review_status       TEXT NOT NULL DEFAULT 'needs_review',
    status              TEXT NOT NULL DEFAULT 'active',
    source_id           TEXT,
    risk_flag           TEXT DEFAULT 'low',
    sensitivity_tag     TEXT,
    display_label       TEXT,
    notes               TEXT,
    owner               TEXT,
    last_reviewed_at    TEXT,
    approved_by         TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW()
  );

  -- ── semantic_relationships (import_order 6) ─────────────────────────────────
  CREATE TABLE IF NOT EXISTS cid_semantic_relationships (
    relationship_id   TEXT PRIMARY KEY,
    from_record_id    TEXT,
    from_label        TEXT,
    relationship_type TEXT,
    to_record_id      TEXT,
    to_label          TEXT,
    confidence        INTEGER,
    review_status     TEXT NOT NULL DEFAULT 'needs_review',
    status            TEXT NOT NULL DEFAULT 'active',
    source_id         TEXT,
    risk_flag         TEXT DEFAULT 'low',
    sensitivity_tag   TEXT,
    display_label     TEXT,
    notes             TEXT,
    category_primary  TEXT,
    owner             TEXT,
    last_reviewed_at  TEXT,
    approved_by       TEXT,
    created_at        TIMESTAMPTZ DEFAULT NOW()
  );

  -- ── entendre_candidates (import_order 7) ────────────────────────────────────
  CREATE TABLE IF NOT EXISTS cid_entendre_candidates (
    entendre_id        TEXT PRIMARY KEY,
    anchor             TEXT NOT NULL,
    short_anchor       TEXT,
    term               TEXT NOT NULL,
    interpretation_1   TEXT,
    interpretation_2   TEXT,
    interpretation_3   TEXT,
    domains            TEXT,
    strength_estimate  INTEGER,
    confidence         INTEGER,
    category_primary   TEXT,
    review_status      TEXT NOT NULL DEFAULT 'needs_review',
    status             TEXT NOT NULL DEFAULT 'active',
    source_id          TEXT,
    risk_flag          TEXT DEFAULT 'low',
    sensitivity_tag    TEXT,
    display_label      TEXT,
    notes              TEXT,
    owner              TEXT,
    last_reviewed_at   TEXT,
    approved_by        TEXT,
    created_at         TIMESTAMPTZ DEFAULT NOW()
  );

  -- ── punchline_patterns (import_order 8) ─────────────────────────────────────
  CREATE TABLE IF NOT EXISTS cid_punchline_patterns (
    punchline_id      TEXT PRIMARY KEY,
    setup_anchor      TEXT NOT NULL,
    short_anchor      TEXT,
    payoff_anchor     TEXT,
    mechanism         TEXT,
    detected_domains  TEXT,
    punchline_type    TEXT,
    strength_estimate INTEGER,
    confidence        INTEGER,
    category_primary  TEXT,
    review_status     TEXT NOT NULL DEFAULT 'needs_review',
    status            TEXT NOT NULL DEFAULT 'active',
    source_id         TEXT,
    risk_flag         TEXT DEFAULT 'low',
    sensitivity_tag   TEXT,
    display_label     TEXT,
    notes             TEXT,
    owner             TEXT,
    last_reviewed_at  TEXT,
    approved_by       TEXT,
    created_at        TIMESTAMPTZ DEFAULT NOW()
  );

  -- ── candidate_queue (import_order 9 — REVIEW ONLY, never scores) ────────────
  -- CONTRACT: rows here NEVER feed scoring engine or public display.
  -- Human promotion required to move a row into any canonical table.
  CREATE TABLE IF NOT EXISTS cid_candidate_queue (
    candidate_id        TEXT PRIMARY KEY,
    candidate_text      TEXT NOT NULL,
    candidate_type      TEXT,
    likely_category     TEXT,
    short_anchor        TEXT,
    reason_for_review   TEXT,
    confidence          INTEGER,
    category_primary    TEXT,
    recommended_action  TEXT,
    review_status       TEXT NOT NULL DEFAULT 'needs_review',
    status              TEXT NOT NULL DEFAULT 'review',
    source_id           TEXT,
    risk_flag           TEXT DEFAULT 'low',
    sensitivity_tag     TEXT,
    display_label       TEXT,
    owner               TEXT,
    last_reviewed_at    TEXT,
    approved_by         TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW()
  );

  -- ── cid_sync_log — tracks every import run ──────────────────────────────────
  CREATE TABLE IF NOT EXISTS cid_sync_log (
    id              SERIAL PRIMARY KEY,
    run_at          TIMESTAMPTZ DEFAULT NOW(),
    schema_version  TEXT DEFAULT 'v5.4',
    records_upserted   INTEGER DEFAULT 0,
    aliases_upserted   INTEGER DEFAULT 0,
    relationships_upserted INTEGER DEFAULT 0,
    entendres_upserted INTEGER DEFAULT 0,
    punchlines_upserted INTEGER DEFAULT 0,
    candidates_inserted INTEGER DEFAULT 0,
    errors          TEXT,
    source          TEXT DEFAULT 'manual'
  );
`);

console.log('✅  All CID v5.4 tables created (or already exist).');
console.log('   Tables: cid_cultural_records, cid_aliases, cid_semantic_relationships,');
console.log('           cid_entendre_candidates, cid_punchline_patterns, cid_candidate_queue, cid_sync_log');
await pool.end();
