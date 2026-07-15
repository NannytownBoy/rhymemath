/**
 * RhymeMath Data Integrity Service
 * Runs automatically every 30 minutes to clean bad/stale/mislabeled entries.
 * Also exposes runIntegrityCheck() for on-demand use (admin route, startup).
 */

import { Pool } from "pg";

const pool = new Pool({
  connectionString: (process.env.DB_URL || process.env.DATABASE_URL),
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

// ─── Rule Sets ────────────────────────────────────────────────────────────────

/** Song names that are known typos / misspellings — always remove */
const SONG_NAME_BLOCKLIST = [
  "test", "asdf", "aaa", "xxx", "zzz", "foo", "bar", "baz", "qwerty",
  "untitled", "unknown",
  // Nas "NY State of Mind" misspellings
  "new orl state of mind", "new york state of mine",
  "new york state of mind (misspelled)", "ny state of mind", "new york state",
];

/** Artist name typos / merge errors — always remove */
const ARTIST_NAME_BLOCKLIST = [
  "test", "asdf", "aaa", "xxx", "zzz", "foo", "bar", "baz", "qwerty",
  "kendrick lemar", "kendrick lamar jr", "kendrick lamaar", "kendrick lamer",
  "kendrick lemar lamar", "kdot", "k dot",
  "drake aubrey", "aubrey drake", "drak",
  "jay z", "jayz", "jay-z.",
  "eminem slim", "slim shady eminem",
  "biggie smalls notorious", "notorious big", "biggy",
  "lil wayne weezy", "weezy f baby",
  "nas nasir", "nasir jones nas",
];

/**
 * Mislabeled entries: verse belongs to a DIFFERENT artist than who's credited.
 * Format: { artist, song } — both are lowercased for comparison.
 * These are removed because the score is attributed to the wrong person.
 */
const MISLABELED_ENTRIES: Array<{ artist: string; song: string; reason: string }> = [
  {
    artist: "nas",
    song: "life's a bitch",
    reason: "Verse in DB is AZ's verse, not Nas. AZ is the primary rapper on that track.",
  },
  {
    artist: "nas",
    song: "lifes a bitch",   // variant without apostrophe
    reason: "Verse in DB is AZ's verse, not Nas.",
  },
];

/**
 * Artist name casing corrections — applied every 30 min.
 * Key: what's stored (lowercased for matching), Value: correct form.
 */
const ARTIST_CASING_CORRECTIONS: Record<string, string> = {
  "jid":         "JID",
  "mach-hommy":  "Mach-Hommy",
  "dmx":         "DMX",
  "az":          "AZ",
  "rza":         "RZA",
  "gza":         "GZA",
  "mf doom":     "MF DOOM",
  "krs-one":     "KRS-One",
  "big l":       "Big L",
  "big pun":     "Big Pun",
  "big daddy kane": "Big Daddy Kane",
  "el-p":        "El-P",
  "ab-soul":     "Ab-Soul",
  "jay electronica": "Jay Electronica",
  "j. cole":     "J. Cole",
  "j cole":      "J. Cole",
  "posdnous":    "Posdnuos",
  "yasiin bey (fka mos def)": "Yasiin Bey (fka Mos Def)",
};

// ─── Core Check Function ───────────────────────────────────────────────────────

export interface IntegrityReport {
  timestamp: string;
  analyses: {
    placeholder_verse_removed: number;
    short_verse_removed: number;
    bad_artist_name_removed: number;
    bad_song_name_removed: number;
    mislabeled_removed: number;
    duplicates_removed: number;
  };
  comparisons: {
    placeholder_verse_removed: number;
    bad_artist_name_removed: number;
  };
  total_removed: number;
  mislabeled_details: string[];
}

export async function runIntegrityCheck(): Promise<IntegrityReport> {
  const report: IntegrityReport = {
    timestamp: new Date().toISOString(),
    analyses: {
      placeholder_verse_removed: 0,
      short_verse_removed: 0,
      bad_artist_name_removed: 0,
      bad_song_name_removed: 0,
      mislabeled_removed: 0,
      duplicates_removed: 0,
    },
    comparisons: {
      placeholder_verse_removed: 0,
      bad_artist_name_removed: 0,
    },
    total_removed: 0,
    mislabeled_details: [],
  };

  // ── 1. Remove placeholder / empty verses in analyses ──────────────────────
  const r1 = await pool.query(`
    DELETE FROM analyses
    WHERE verse LIKE '[No verse provided%'
       OR verse LIKE '(No verse%'
       OR verse ILIKE '%no lyrics entered%'
       OR verse ILIKE '%no verse provided%'
    RETURNING id;
  `);
  report.analyses.placeholder_verse_removed = r1.rowCount ?? 0;

  // ── 2. Remove near-empty verses (< 20 meaningful chars) ───────────────────
  const r2 = await pool.query(`
    DELETE FROM analyses
    WHERE LENGTH(TRIM(verse)) < 20
    RETURNING id;
  `);
  report.analyses.short_verse_removed = r2.rowCount ?? 0;

  // ── 3. Remove bad artist names in analyses ────────────────────────────────
  const artistPlaceholders = ARTIST_NAME_BLOCKLIST.map((_, i) => `$${i + 1}`).join(", ");
  const r3 = await pool.query(
    `DELETE FROM analyses
     WHERE LOWER(TRIM(artist_name)) IN (${artistPlaceholders})
        OR TRIM(artist_name) = ''
     RETURNING id;`,
    ARTIST_NAME_BLOCKLIST,
  );
  report.analyses.bad_artist_name_removed = r3.rowCount ?? 0;

  // ── 4. Remove bad song names in analyses ──────────────────────────────────
  const songPlaceholders = SONG_NAME_BLOCKLIST.map((_, i) => `$${i + 1}`).join(", ");
  const r4 = await pool.query(
    `DELETE FROM analyses
     WHERE LOWER(TRIM(song_name)) IN (${songPlaceholders})
        OR TRIM(song_name) = ''
     RETURNING id;`,
    SONG_NAME_BLOCKLIST,
  );
  report.analyses.bad_song_name_removed = r4.rowCount ?? 0;

  // ── 5. Remove mislabeled entries (right song, wrong artist) ───────────────
  let mislabeledCount = 0;
  for (const entry of MISLABELED_ENTRIES) {
    const rm = await pool.query(
      `DELETE FROM analyses
       WHERE LOWER(TRIM(artist_name)) = $1
         AND LOWER(TRIM(song_name))   = $2
       RETURNING id;`,
      [entry.artist, entry.song],
    );
    const removed = rm.rowCount ?? 0;
    if (removed > 0) {
      mislabeledCount += removed;
      report.mislabeled_details.push(
        `Removed ${removed} mislabeled entry: "${entry.artist}" / "${entry.song}" — ${entry.reason}`,
      );
    }
  }
  report.analyses.mislabeled_removed = mislabeledCount;

  // ── 6. Deduplicate analyses: keep highest score per artist+song ───────────
  const r6 = await pool.query(`
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
    )
    RETURNING id;
  `);
  report.analyses.duplicates_removed = r6.rowCount ?? 0;

  // ── 7. Clean placeholder verses in comparisons ────────────────────────────
  const r7 = await pool.query(`
    DELETE FROM comparisons
    WHERE verse_a LIKE '[No verse provided%'
       OR verse_a LIKE '(No verse%'
       OR verse_a ILIKE '%no lyrics entered%'
       OR verse_b LIKE '[No verse provided%'
       OR verse_b LIKE '(No verse%'
       OR verse_b ILIKE '%no lyrics entered%'
    RETURNING id;
  `);
  report.comparisons.placeholder_verse_removed = r7.rowCount ?? 0;

  // ── 8. Clean bad artist names in comparisons ──────────────────────────────
  const r8 = await pool.query(
    `DELETE FROM comparisons
     WHERE LOWER(TRIM(artist_a_name)) IN (${artistPlaceholders})
        OR LOWER(TRIM(artist_b_name)) IN (${artistPlaceholders})
        OR TRIM(artist_a_name) = ''
        OR TRIM(artist_b_name) = ''
     RETURNING id;`,
    [...ARTIST_NAME_BLOCKLIST, ...ARTIST_NAME_BLOCKLIST],
  );
  report.comparisons.bad_artist_name_removed = r8.rowCount ?? 0;

  // ── 9. Normalize artist name casing ───────────────────────────────────────
  for (const [storedLower, correctForm] of Object.entries(ARTIST_CASING_CORRECTIONS)) {
    // Fix in analyses
    await pool.query(
      `UPDATE analyses SET artist_name = $1 WHERE LOWER(TRIM(artist_name)) = $2 AND artist_name != $1`,
      [correctForm, storedLower]
    );
    // Fix in comparisons (both sides)
    await pool.query(
      `UPDATE comparisons SET artist_a_name = $1 WHERE LOWER(TRIM(artist_a_name)) = $2 AND artist_a_name != $1`,
      [correctForm, storedLower]
    );
    await pool.query(
      `UPDATE comparisons SET artist_b_name = $1 WHERE LOWER(TRIM(artist_b_name)) = $2 AND artist_b_name != $1`,
      [correctForm, storedLower]
    );
  }

  // ── Totals ────────────────────────────────────────────────────────────────
  report.total_removed =
    report.analyses.placeholder_verse_removed +
    report.analyses.short_verse_removed +
    report.analyses.bad_artist_name_removed +
    report.analyses.bad_song_name_removed +
    report.analyses.mislabeled_removed +
    report.analyses.duplicates_removed +
    report.comparisons.placeholder_verse_removed +
    report.comparisons.bad_artist_name_removed;

  return report;
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

const INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

export function startIntegrityScheduler(): void {
  // Run once on startup (after a short delay to let DB settle)
  setTimeout(async () => {
    console.log("[integrity] Running startup integrity check...");
    try {
      const report = await runIntegrityCheck();
      if (report.total_removed > 0) {
        console.log(`[integrity] Startup: removed ${report.total_removed} bad rows.`);
        if (report.mislabeled_details.length > 0) {
          report.mislabeled_details.forEach((d) => console.log(`[integrity]   → ${d}`));
        }
      } else {
        console.log("[integrity] Startup: DB is clean, no rows removed.");
      }
    } catch (err) {
      console.error("[integrity] Startup check failed:", err);
    }
  }, 5000);

  // Then every 30 minutes
  setInterval(async () => {
    console.log("[integrity] Running scheduled integrity check...");
    try {
      const report = await runIntegrityCheck();
      if (report.total_removed > 0) {
        console.log(`[integrity] Scheduled: removed ${report.total_removed} bad rows.`);
        if (report.mislabeled_details.length > 0) {
          report.mislabeled_details.forEach((d) => console.log(`[integrity]   → ${d}`));
        }
      } else {
        console.log("[integrity] Scheduled: DB is clean.");
      }
    } catch (err) {
      console.error("[integrity] Scheduled check failed:", err);
    }
  }, INTERVAL_MS);

  console.log(`[integrity] Scheduler started — runs every ${INTERVAL_MS / 60000} minutes.`);
}
