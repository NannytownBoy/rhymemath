/**
 * cid-rescore.mjs
 * ───────────────────────────────────────────────────────────────────
 * Applies Cultural Intelligence Database (CID) v5.4 bonuses to all
 * existing analyses in the database.
 *
 * What it does:
 *   1. Loads approved CID signals from Railway (entendres, punchlines, aliases)
 *   2. For each analysis row, re-runs the exact same CID bonus logic used
 *      in routes.ts during live scoring
 *   3. Updates score_wordplay, score_punchlines, score_overall and result_json
 *   4. Bumps scoring_mode from "standard-v4" → "standard-v4.1" (or bare
 *      "standard" → "standard-v4.1") to mark CID-enriched records
 *   5. Prints a before/after table for every changed row
 *
 * Scoring version after this run: v4.1
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node scripts/cid-rescore.mjs
 *
 * Safe to re-run — idempotent. Rows already at v4.1 are skipped.
 * ───────────────────────────────────────────────────────────────────
 */

import pg from "pg";

const { Pool } = pg;

const SCORING_VERSION = "v4.1";
const WEIGHTS = { flow: 0.30, rhyming: 0.22, wordplay: 0.20, storytelling: 0.16, punchlines: 0.12 };

// ── CID bonus logic (mirrors routes.ts exactly) ─────────────────────────────

function computeCIDBonus(verse, lineCount, cid) {
  const verseLower = verse.toLowerCase();

  // 1. Alias / cultural reference density
  let aliasMatches = 0;
  const matchedAliases = [];
  for (const alias of cid.aliasTerms) {
    if (!alias.alias_text) continue;
    const term = alias.alias_text.toLowerCase().trim();
    if (term.length < 3) continue;
    const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(verseLower)) {
      aliasMatches++;
      matchedAliases.push(alias.alias_text);
    }
  }
  const culturalReferenceDensity = Math.min(1, aliasMatches / Math.max(1, lineCount * 0.3));

  // 2. Entendre matching
  let entendreMatches = 0;
  let entendreStrengthSum = 0;
  const entendreEvidence = [];
  for (const ent of cid.entendreAnchors) {
    const anchor = (ent.short_anchor || ent.anchor || "").toLowerCase().trim();
    if (anchor.length < 3) continue;
    const re = new RegExp(anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    if (re.test(verseLower)) {
      entendreMatches++;
      entendreStrengthSum += ent.strength || 3;
      if (ent.interp1 && entendreMatches <= 2) {
        entendreEvidence.push(`CID entendre: "${ent.short_anchor || ent.anchor}" — ${ent.interp1}`);
      }
    }
  }
  const entendreScore =
    entendreMatches === 0
      ? 0
      : Math.min(1, (entendreStrengthSum / entendreMatches / 5) * (Math.min(entendreMatches, 4) / 4));

  // 3. Punchline pattern matching
  let punchlineMatches = 0;
  let punchStrengthSum = 0;
  const punchEvidence = [];
  for (const punch of cid.punchlineAnchors) {
    const anchor = (punch.short_anchor || punch.setup_anchor || "").toLowerCase().trim();
    if (anchor.length < 4) continue;
    const re = new RegExp(anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    if (re.test(verseLower)) {
      punchlineMatches++;
      punchStrengthSum += punch.strength || 3;
      if (punch.mechanism && punchlineMatches <= 2) {
        punchEvidence.push(`CID punchline: "${punch.short_anchor || punch.setup_anchor}" — ${punch.mechanism}`);
      }
    }
  }
  const punchlinePatternScore =
    punchlineMatches === 0
      ? 0
      : Math.min(1, (punchStrengthSum / punchlineMatches / 5) * (Math.min(punchlineMatches, 3) / 3));

  const hasCIDHit = aliasMatches > 0 || entendreMatches > 0 || punchlineMatches > 0;
  if (!hasCIDHit) return null;

  const wordplayBonus = Math.min(8, culturalReferenceDensity * 5 + entendreScore * 6);
  const punchBonus = Math.min(5, punchlinePatternScore * 8);

  const evidence = [];
  if (aliasMatches > 0) {
    evidence.push(
      `CID: ${aliasMatches} cultural reference(s) detected — ${matchedAliases.slice(0, 4).join(", ")}${aliasMatches > 4 ? ` +${aliasMatches - 4} more` : ""}`
    );
  }
  evidence.push(...entendreEvidence, ...punchEvidence);

  return { wordplayBonus, punchBonus, evidence, aliasMatches, entendreMatches, punchlineMatches };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  console.log(`\n═══════════════════════════════════════════════════`);
  console.log(`  RhymeMath CID Rescore — Scoring Version ${SCORING_VERSION}`);
  console.log(`═══════════════════════════════════════════════════\n`);

  // ── Load CID data ────────────────────────────────────────────────
  console.log("Loading CID v5.4 signals from Railway...");

  const [aliasRes, entendreRes, punchRes] = await Promise.all([
    pool.query(`
      SELECT a.alias_text, r.term AS canonical_meaning, r.category_primary AS category
      FROM cid_aliases a
      LEFT JOIN cid_cultural_records r ON r.record_id = a.canonical_record_id
      WHERE a.review_status = 'approved' AND a.status = 'active'
    `),
    pool.query(`
      SELECT short_anchor, anchor, strength_estimate AS strength,
             confidence, interpretation_1 AS interp1
      FROM cid_entendre_candidates
      WHERE review_status = 'approved' AND status = 'active'
        AND strength_estimate >= 3 AND confidence >= 3
    `),
    pool.query(`
      SELECT short_anchor, setup_anchor, mechanism,
             strength_estimate AS strength, confidence
      FROM cid_punchline_patterns
      WHERE review_status = 'approved' AND status = 'active'
        AND confidence >= 3
    `),
  ]);

  const cid = {
    aliasTerms: aliasRes.rows,
    entendreAnchors: entendreRes.rows,
    punchlineAnchors: punchRes.rows,
  };

  console.log(`  Aliases loaded:    ${cid.aliasTerms.length}`);
  console.log(`  Entendres loaded:  ${cid.entendreAnchors.length}`);
  console.log(`  Punchlines loaded: ${cid.punchlineAnchors.length}`);
  console.log();

  // ── Load all analyses ────────────────────────────────────────────
  const { rows: analyses } = await pool.query(
    `SELECT id, result_id, artist_name, song_name, verse, scoring_mode,
            score_overall, score_flow, score_wordplay, score_storytelling,
            score_rhyming, score_punchlines, result_json
     FROM analyses
     ORDER BY score_overall DESC`
  );

  console.log(`Loaded ${analyses.length} analyses. Processing...\n`);

  let updated = 0;
  let skipped = 0;
  let noHit = 0;

  for (const row of analyses) {
    // Skip rows already at target version
    if (row.scoring_mode === `standard-${SCORING_VERSION}`) {
      skipped++;
      continue;
    }

    const verse = row.verse || "";
    const lineCount = verse.split("\n").filter((l) => l.trim()).length;

    const bonus = computeCIDBonus(verse, lineCount, cid);

    if (!bonus) {
      noHit++;
      // Still bump version even if no CID hit, so we mark it processed
      await pool.query(
        `UPDATE analyses SET scoring_mode = $1 WHERE id = $2`,
        [`standard-${SCORING_VERSION}`, row.id]
      );
      continue;
    }

    // Apply bonuses to existing scores
    const newWordplay = Math.min(100, row.score_wordplay + bonus.wordplayBonus);
    const newPunchlines = Math.min(100, row.score_punchlines + bonus.punchBonus);
    const newOverall = Math.min(100,
      row.score_flow         * WEIGHTS.flow +
      row.score_rhyming      * WEIGHTS.rhyming +
      newWordplay            * WEIGHTS.wordplay +
      row.score_storytelling * WEIGHTS.storytelling +
      newPunchlines          * WEIGHTS.punchlines
    );

    // Round to 1 decimal
    const r = (v) => Math.round(v * 10) / 10;

    // Update result_json with new scores + CID evidence
    let resultJson = {};
    try {
      resultJson = JSON.parse(row.result_json);
    } catch (_) {}

    if (resultJson.scores) {
      resultJson.scores.wordplay   = r(newWordplay);
      resultJson.scores.punchlines = r(newPunchlines);
      resultJson.scores.overall    = r(newOverall);
    }
    if (bonus.evidence.length > 0) {
      const cidNote = bonus.evidence.join(" ");
      resultJson.explanation = resultJson.explanation
        ? resultJson.explanation + " " + cidNote
        : cidNote;
    }
    resultJson.scoringVersion = SCORING_VERSION;

    // Persist
    await pool.query(
      `UPDATE analyses
       SET score_wordplay   = $1,
           score_punchlines = $2,
           score_overall    = $3,
           result_json      = $4,
           scoring_mode     = $5
       WHERE id = $6`,
      [r(newWordplay), r(newPunchlines), r(newOverall), JSON.stringify(resultJson), `standard-${SCORING_VERSION}`, row.id]
    );

    updated++;

    // Print before/after
    const delta = r(newOverall) - r(row.score_overall);
    const sign = delta >= 0 ? "+" : "";
    console.log(
      `  [UPDATED] ${row.artist_name.padEnd(18)} — ${row.song_name.substring(0, 28).padEnd(30)}` +
      `  ${r(row.score_overall).toFixed(1)} → ${r(newOverall).toFixed(1)}  (${sign}${delta.toFixed(1)})` +
      (bonus.aliasMatches > 0 ? `  [aliases:${bonus.aliasMatches}]` : "") +
      (bonus.entendreMatches > 0 ? `  [entendres:${bonus.entendreMatches}]` : "") +
      (bonus.punchlineMatches > 0 ? `  [punchlines:${bonus.punchlineMatches}]` : "")
    );
    if (bonus.evidence.length > 0) {
      for (const e of bonus.evidence) {
        console.log(`           ${e}`);
      }
    }
  }

  console.log(`\n───────────────────────────────────────────────────`);
  console.log(`  Done.`);
  console.log(`  Updated:        ${updated} rows`);
  console.log(`  No CID hit:     ${noHit} rows (version bumped only)`);
  console.log(`  Already ${SCORING_VERSION}: ${skipped} rows (skipped)`);
  console.log(`  Scoring version: ${SCORING_VERSION}`);
  console.log(`───────────────────────────────────────────────────\n`);

  await pool.end();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
