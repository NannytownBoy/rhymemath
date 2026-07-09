/**
 * full-rescore.mjs  v2
 * Re-scores existing analyses rows IN PLACE via direct DB update.
 * Calls /api/score-only (or local scoreComparison) — does NOT insert new rows.
 * 
 * Usage:
 *   DATABASE_URL="..." API_BASE="https://rhymemath-production.up.railway.app" node scripts/full-rescore.mjs
 *   --dry-run   preview only, no DB writes
 *   --limit N   process only first N rows
 */

import pg from "pg";
const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
const API_BASE = process.env.API_BASE || "https://rhymemath-production.up.railway.app";
const DRY_RUN = process.argv.includes("--dry-run");
const LIMIT_ARG = process.argv.indexOf("--limit");
const LIMIT = LIMIT_ARG >= 0 ? parseInt(process.argv[LIMIT_ARG + 1], 10) : null;
const DELAY_MS = 600;

if (!DATABASE_URL) { console.error("DATABASE_URL required"); process.exit(1); }

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

  const q = LIMIT
    ? `SELECT id, artist_name, song_name, verse_label, verse, score_overall, score_storytelling FROM analyses WHERE verse IS NOT NULL AND length(verse) > 20 ORDER BY id LIMIT ${LIMIT}`
    : `SELECT id, artist_name, song_name, verse_label, verse, score_overall, score_storytelling FROM analyses WHERE verse IS NOT NULL AND length(verse) > 20 ORDER BY id`;

  const { rows } = await pool.query(q);
  console.log(`\nFull re-score v2: ${rows.length} rows (UPDATE in place)`);
  console.log(`API: ${API_BASE}`);
  console.log(DRY_RUN ? "DRY RUN — no DB writes\n" : "LIVE RUN — updating DB\n");

  let updated = 0, failed = 0, unchanged = 0;

  for (const row of rows) {
    try {
      const res = await fetch(`${API_BASE}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artistName: row.artist_name,
          songName: row.song_name,
          verse: row.verse,
          verseLabel: row.verse_label || "Verse 1",
          _rescoreExisting: row.id,  // signal to server (ignored if unrecognized)
        }),
      });

      if (!res.ok) { failed++; continue; }
      const data = await res.json();
      if (!data?.scores?.overall) { failed++; continue; }

      const oldOverall = parseFloat(row.score_overall) || 0;
      const oldStory = parseFloat(row.score_storytelling) || 0;
      const newOverall = data.scores.overall;
      const newStory = data.scores.storytelling || 0;
      const delta = newOverall - oldOverall;

      if (Math.abs(delta) < 0.05 && Math.abs(newStory - oldStory) < 1) {
        unchanged++;
        continue;
      }

      if (!DRY_RUN) {
        // Delete the newly-inserted duplicate row (API always inserts a new one)
        // Find it by artist+song+verse_label and higher id than our original row
        await pool.query(
          `DELETE FROM analyses WHERE artist_name=$1 AND song_name=$2 AND (verse_label=$3 OR verse_label IS NULL) AND id > $4`,
          [row.artist_name, row.song_name, row.verse_label, row.id]
        );
        // Update the original row with the new scores
        await pool.query(
          `UPDATE analyses SET
            score_overall=$1, score_storytelling=$2, score_flow=$3,
            score_wordplay=$4, score_rhyming=$5, score_punchlines=$6,
            result_json=$7
          WHERE id=$8`,
          [
            newOverall,
            newStory,
            data.scores.flow || 0,
            data.scores.wordplay || 0,
            data.scores.rhyming || 0,
            data.scores.punchlines || 0,
            JSON.stringify(data),
            row.id
          ]
        );
      }

      const deltaStr = (delta >= 0 ? "+" : "") + delta.toFixed(1);
      const storyDelta = newStory - oldStory;
      const storyStr = (storyDelta >= 0 ? "+" : "") + storyDelta.toFixed(0);
      const marker = delta > 0.5 ? "  [↑]" : delta < -0.5 ? "  [↓]" : "  [~]";
      process.stdout.write(`${marker} ${row.artist_name.padEnd(22)} — ${(row.song_name||"").slice(0,28).padEnd(28)} ${oldOverall.toFixed(1)}→${newOverall.toFixed(1)} (${deltaStr}) story:${oldStory}→${newStory}(${storyStr})\n`);
      updated++;

    } catch (err) {
      failed++;
      process.stdout.write(`  [ERR] ${row.artist_name} — ${err.message.slice(0,60)}\n`);
    }

    await sleep(DELAY_MS);
  }

  console.log(`\n${"─".repeat(60)}`);
  console.log(`  Meaningfully updated: ${updated}`);
  console.log(`  Unchanged:            ${unchanged}`);
  console.log(`  Failed:               ${failed}`);
  console.log(`${"─".repeat(60)}\n`);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
