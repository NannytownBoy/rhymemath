/**
 * rescore-v4.ts
 * Batch migration: re-score all rows in the `analyses` table under v4 weights.
 * Flow 30 / Rhyme 22 / Wordplay 18 / Storytelling 18 / Punchlines 12
 *
 * Run with:
 *   DATABASE_URL=<url> npx tsx scripts/rescore-v4.ts
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { analyses } from "../shared/schema";
import { analyzeVerseSolo } from "../server/scoring/scoreComparison";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌  DATABASE_URL environment variable is required");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
const db = drizzle(pool);

async function main() {
  console.log("🎯  RhymeMath v4 rescore migration starting...");
  console.log("   Weights: Flow 30 | Rhyme 22 | Wordplay 18 | Story 18 | Punches 12\n");

  // Fetch all solo analyses
  const rows = await db.select().from(analyses);
  console.log(`   Found ${rows.length} analyses to rescore.\n`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      // Skip placeholder verses
      if (!row.verse || row.verse.startsWith("[No verse provided")) {
        skipped++;
        continue;
      }

      // Re-score with v4 DEFAULT_WEIGHTS (no weights param = uses DEFAULT_WEIGHTS)
      const result = analyzeVerseSolo({
        artistName: row.artistName,
        songName: row.songName,
        verseLabel: row.verseLabel ?? undefined,
        verse: row.verse,
        // No weights param — uses DEFAULT_WEIGHTS which is now v4
      });

      // Update the row with fresh scores + result JSON + v4 scoring mode
      await db
        .update(analyses)
        .set({
          scoreOverall:      result.scores.overall,
          scoreFlow:         result.scores.flow,
          scoreWordplay:     result.scores.wordplay,
          scoreStorytelling: result.scores.storytelling,
          scoreRhyming:      result.scores.rhyming,
          scorePunchlines:   result.scores.punchlines,
          resultJson:        JSON.stringify(result),
          scoringMode:       "standard-v4",
        })
        .where(eq(analyses.id, row.id));

      console.log(`   ✅  [${String(updated + 1).padStart(3)}] ${row.artistName} — "${row.songName}" | ${row.scoreOverall.toFixed(1)} → ${result.scores.overall.toFixed(1)}`);
      updated++;
    } catch (err) {
      console.error(`   ❌  Error on row ${row.id} (${row.artistName} — ${row.songName}):`, err);
      errors++;
    }
  }

  console.log(`\n✅  Migration complete.`);
  console.log(`   Updated: ${updated} | Skipped (placeholder): ${skipped} | Errors: ${errors}`);
  await pool.end();
}

// Need eq from drizzle-orm
import { eq } from "drizzle-orm";

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
