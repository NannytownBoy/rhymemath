/**
 * migrate-community.mjs
 * Creates users, annotations, points_ledger tables in Railway Postgres
 * and seeds the admin account.
 * 
 * Usage:
 *   DATABASE_URL="..." node scripts/migrate-community.mjs
 */

import pg from 'pg';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:TsKMoFmORcQVhbhlDMJVlsbTrKGmRELC@reseau.proxy.rlwy.net:12215/railway',
  ssl: { rejectUnauthorized: false }
});

const ADMIN_EMAIL    = 'jemar.daniel@gmail.com';
const ADMIN_USERNAME = 'petitehaché';
const ADMIN_PASSWORD = 'RhymeMath2026!';  // Change after first login

async function run() {
  console.log('Running community migration...\n');

  // ── users table ──────────────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id                  SERIAL PRIMARY KEY,
      username            TEXT NOT NULL UNIQUE,
      email               TEXT NOT NULL UNIQUE,
      password_hash       TEXT NOT NULL,
      role                TEXT NOT NULL DEFAULT 'member',
      points              INTEGER NOT NULL DEFAULT 0,
      bio                 TEXT,
      avatar_url          TEXT,
      reset_token         TEXT,
      reset_token_expiry  INTEGER,
      created_at          INTEGER NOT NULL,
      last_login_at       INTEGER
    )
  `);
  console.log('✅  users table ready');

  // ── annotations table ────────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS annotations (
      id                      SERIAL PRIMARY KEY,
      analysis_id             TEXT,
      comparison_id           TEXT,
      side                    TEXT,
      anchor_text             TEXT NOT NULL,
      start_index             INTEGER,
      end_index               INTEGER,
      meaning                 TEXT NOT NULL,
      meaning_type            TEXT NOT NULL,
      interpretation_1        TEXT,
      interpretation_2        TEXT,
      interpretation_3        TEXT,
      domain_tags             TEXT,
      status                  TEXT NOT NULL DEFAULT 'pending',
      reviewed_by             TEXT,
      review_note             TEXT,
      promote_to_cid          BOOLEAN DEFAULT FALSE,
      submitted_by            INTEGER NOT NULL,
      submitted_by_username   TEXT NOT NULL,
      points_awarded          INTEGER DEFAULT 0,
      created_at              INTEGER NOT NULL,
      reviewed_at             INTEGER
    )
  `);
  console.log('✅  annotations table ready');

  // ── points_ledger table ──────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS points_ledger (
      id            SERIAL PRIMARY KEY,
      user_id       INTEGER NOT NULL,
      delta         INTEGER NOT NULL,
      reason        TEXT NOT NULL,
      reference_id  INTEGER,
      created_at    INTEGER NOT NULL
    )
  `);
  console.log('✅  points_ledger table ready');

  // ── Seed admin account ───────────────────────────────────────────────────
  const existing = await pool.query(`SELECT id FROM users WHERE email = $1`, [ADMIN_EMAIL]);
  if (existing.rows.length === 0) {
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    const now  = Math.floor(Date.now() / 1000);
    await pool.query(`
      INSERT INTO users (username, email, password_hash, role, points, created_at)
      VALUES ($1, $2, $3, 'admin', 100, $4)
    `, [ADMIN_USERNAME, ADMIN_EMAIL, hash, now]);
    console.log(`\n✅  Admin account created`);
    console.log(`    Email:    ${ADMIN_EMAIL}`);
    console.log(`    Username: ${ADMIN_USERNAME}`);
    console.log(`    Password: ${ADMIN_PASSWORD}`);
    console.log(`    ⚠️  Change this password after first login!\n`);
  } else {
    console.log(`\n   Admin account already exists — skipping seed`);
  }

  console.log('\nMigration complete.');
  await pool.end();
}

run().catch(e => { console.error(e); process.exit(1); });
