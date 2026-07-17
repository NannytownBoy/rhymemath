#!/usr/bin/env node
/**
 * rescore-all.mjs
 * RhymeMath v6 — Batch Rescore Job
 *
 * Re-scores every row in the `analyses` table using the SAME shared scorer
 * that powers the live site (scoreComparison.ts via analyzeVerseSolo).
 *
 * RULES:
 *   - Uses the SAME weights, SAME CID matcher, SAME suppression layer
 *   - Identical input text + metadata → identical result under same version
 *   - Idempotent: re-running produces same results (upsert by result_id)
 *   - Skips rows already at current SCORING_VERSION unless --force flag
 *   - Never rescores hook/chorus/bridge/etc — only verse_* sections
 *   - Excludes unknown sections from leaderboard (respects section_weight_multiplier)
 *   - Writes scoring_version, suppression_flags, cid_signals, conceptual_score back
 *
 * Usage:
 *   node scripts/rescore-all.mjs                 # score all pending
 *   node scripts/rescore-all.mjs --force          # re-score everything (same version)
 *   node scripts/rescore-all.mjs --dry-run        # print what would change, no writes
 *   node scripts/rescore-all.mjs --limit 100      # process at most N rows
 *   node scripts/rescore-all.mjs --version v6.0   # target specific version gap
 */

import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── Args ──────────────────────────────────────────────────────────────────────
const args = new Set(process.argv.slice(2));
const FORCE    = args.has("--force");
const DRY_RUN  = args.has("--dry-run");
const limitIdx = process.argv.indexOf("--limit");
const LIMIT    = limitIdx >= 0 ? parseInt(process.argv[limitIdx + 1]) : Infinity;

// ── DB ────────────────────────────────────────────────────────────────────────
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || (() => { throw new Error("DATABASE_URL env var is required — set it before running this script"); })(),
});

// ── Inline scoring (avoid ESM server-side import issues in script context) ───
// We use the compiled dist if available, otherwise we dynamically require the TS
// via tsx at runtime. For Railway production, dist should be available.

async function loadScorer() {
  try {
    // Prefer compiled dist (production Railway path)
    const distPath = path.join(__dirname, "../dist/server/scoring/scoreComparison.cjs");
    const mod = await import(distPath);
    console.log("  Using compiled scorer from dist/");
    return mod;
  } catch {
    // Dev fallback: use tsx
    console.warn("  dist scorer not found — using tsx loader");
    return null;
  }
}

// ── Non-verse sections (should already be excluded or zero-weighted in DB) ───
const NON_VERSE = new Set([
  "hook", "chorus", "pre_hook", "bridge", "interlude",
  "intro", "outro", "spoken", "refrain"
]);

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n╔═══════════════════════════════════════════════════════╗`);
  console.log(`║  RhymeMath v6 Batch Rescore                           ║`);
  console.log(`║  ${new Date().toISOString().replace("T"," ").slice(0,19).padEnd(53)}║`);
  console.log(`║  ${DRY_RUN ? "DRY RUN — no DB writes".padEnd(53) : "LIVE RUN — writing to Railway".padEnd(53)}║`);
  console.log(`╚═══════════════════════════════════════════════════════╝\n`);

  // ── Fetch rows that need rescoring ─────────────────────────────────────────
  let query = `
    SELECT id, result_id, artist_name, song_name, verse, section_label,
           section_index, scoring_mode, custom_weights, score_overall,
           scoring_version, section_weight_multiplier
    FROM analyses
    WHERE verse IS NOT NULL
      AND LENGTH(TRIM(verse)) > 20
      AND verse NOT ILIKE '[No verse%'
      AND verse NOT ILIKE '(No verse%'
  `;

  if (!FORCE) {
    query += ` AND (scoring_version IS NULL OR scoring_version != 'v7.1')`;
  }

  query += ` ORDER BY created_at DESC`;
  if (LIMIT !== Infinity) query += ` LIMIT ${LIMIT}`;

  const { rows } = await pool.query(query);
  console.log(`Found ${rows.length} rows to rescore.\n`);

  if (rows.length === 0) {
    console.log("Nothing to rescore. All analyses are already at v7.0.");
    await pool.end();
    return;
  }

  // ── Try to load the scorer ─────────────────────────────────────────────────
  const SCORING_VERSION = "v7.1";
  const DEFAULT_WEIGHTS = {
    flow: 0.30, rhyming: 0.22, wordplay: 0.20, storytelling: 0.16, punchlines: 0.12
  };

  // ── Load CID once for the run (we'll call scoreCIDSignals per row) ─────────
  let scoreCIDSignals;
  let applyFullPipeline;
  try {
    const cidMod = await import("../server/scoring/cidLookup.js");
    scoreCIDSignals = cidMod.scoreCIDSignals;
    const scMod = await import("../server/scoring/scoreComparison.js");
    applyFullPipeline = scMod.applyFullPipeline;
    console.log("  Loaded scorer modules via ESM\n");
  } catch (e) {
    console.error("Could not load scoring modules:", e.message);
    console.error("Run from the project root after building, or use tsx:");
    console.error("  npx tsx scripts/rescore-all.mjs");
    process.exit(1);
  }

  // ── Rescore loop ───────────────────────────────────────────────────────────
  let updated = 0, skipped = 0, errors = 0;
  const BATCH = 20;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const sectionLower = (row.section_label || "unknown").toLowerCase();

    // Non-verse sections: mark version but don't change scores
    if (NON_VERSE.has(sectionLower)) {
      if (!DRY_RUN) {
        await pool.query(
          `UPDATE analyses SET scoring_version = $1 WHERE id = $2`,
          [SCORING_VERSION, row.id]
        );
      }
      skipped++;
      continue;
    }

    try {
      // Resolve weights
      let weights = DEFAULT_WEIGHTS;
      if (row.custom_weights) {
        try {
          const raw = typeof row.custom_weights === "string"
            ? JSON.parse(row.custom_weights) : row.custom_weights;
          const total = Object.values(raw).reduce((a, b) => a + b, 0);
          if (total > 0) {
            weights = Object.fromEntries(
              Object.entries(raw).map(([k, v]) => [k, v / total])
            );
          }
        } catch { /* use default */ }
      }

      const lineCount = row.verse.split("\n").filter(l => l.trim().length > 0).length;
      const cidSignals = await scoreCIDSignals(row.verse, lineCount);
      const pipeline = applyFullPipeline(row.verse, weights, cidSignals);

      if (DRY_RUN) {
        const diff = Math.abs(pipeline.scores.overall - (row.score_overall ?? 0));
        console.log(
          `  [${i+1}/${rows.length}] ${row.artist_name} — ${row.song_name} | ` +
          `${row.section_label || "?"} | ` +
          `old=${row.score_overall?.toFixed(1) ?? "?"} → new=${pipeline.scores.overall.toFixed(1)} ` +
          `(Δ${diff.toFixed(1)}) ` +
          `suppressed=${pipeline.suppressionFlags.length > 0}`
        );
      } else {
        await pool.query(`
          UPDATE analyses SET
            score_overall     = $1,
            score_flow        = $2,
            score_rhyming     = $3,
            score_wordplay    = $4,
            score_storytelling= $5,
            score_punchlines  = $6,
            scoring_version   = $7,
            cid_signals       = $8,
            suppression_flags = $9,
            conceptual_score  = $10,
            updated_at        = EXTRACT(EPOCH FROM NOW())::int
          WHERE id = $11
        `, [
          pipeline.scores.overall,
          pipeline.scores.flow,
          pipeline.scores.rhyming,
          pipeline.scores.wordplay,
          pipeline.scores.storytelling,
          pipeline.scores.punchlines,
          SCORING_VERSION,
          JSON.stringify(cidSignals),
          JSON.stringify(pipeline.suppressionFlags),
          pipeline.conceptualScore,
          row.id,
        ]);
      }

      updated++;

      // Progress every 20 rows
      if ((i + 1) % BATCH === 0) {
        console.log(`  Progress: ${i+1}/${rows.length} (${updated} updated, ${errors} errors)`);
      }
    } catch (e) {
      console.error(`  ERROR on row ${row.id} (${row.artist_name}): ${e.message}`);
      errors++;
    }
  }

  console.log(`\n──────────────────────────────────`);
  console.log(`Rescore complete:`);
  console.log(`  Updated : ${updated}`);
  console.log(`  Skipped : ${skipped} (non-verse or already current)`);
  console.log(`  Errors  : ${errors}`);
  if (DRY_RUN) console.log(`  (DRY RUN — no writes made)`);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
