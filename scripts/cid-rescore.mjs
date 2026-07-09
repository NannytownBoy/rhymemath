/**
 * cid-rescore.mjs
 * ───────────────────────────────────────────────────────────────────
 * Applies full CID v5.4 scoring (all 4 layers) to all existing analyses.
 *
 * LAYERS:
 *   1. Canonical Records  — direct entity matching (term + short_anchor)
 *   2. Alias Resolution   — slang → canonical entity
 *   3. Entendres          — anchor phrase double-meaning detection
 *   3b. Punchline Patterns — setup/payoff structure detection
 *   4. Semantic Graph     — co-occurrence bonus for related entity pairs
 *
 * BONUS MATH (mirrors routes.ts exactly):
 *   Wordplay:   min(10, density*5 + entendre*4 + semantic*3)
 *   Punchlines: min(6,  punchline*5 + semantic*2)
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node scripts/cid-rescore.mjs
 *   DATABASE_URL="postgresql://..." node scripts/cid-rescore.mjs --force
 *
 * --force reprocesses rows already at v4.2 (needed after new CID imports).
 * ───────────────────────────────────────────────────────────────────
 */

import pg from "pg";

const { Pool } = pg;

const SCORING_VERSION = "v5.0";
const WEIGHTS = { flow: 0.30, rhyming: 0.22, wordplay: 0.20, storytelling: 0.16, punchlines: 0.12 };
const FORCE = process.argv.includes("--force");

// ── High-risk aliases (mirrors cidLookup.ts) ─────────────────────────────────
const HIGH_RISK_ALIASES = {
  "pen":     ["send", "flow", "rhyme", "bars", "spit", "write", "ill", "the", "my", "wit"],
  "chain":   ["gold", "platinum", "neck", "jewel", "ice", "rock", "bust", "cop"],
  "game":    ["the game", "rap game", "street", "came from", "in the"],
  "section": ["vip", "the section", "my section", "verse", "paid"],
};

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wholeWordTest(term, verse) {
  return new RegExp(`\\b${escapeRegex(term)}\\b`, "i").test(verse);
}

function highRiskMatches(verse, alias) {
  const contextWords = HIGH_RISK_ALIASES[alias.toLowerCase()];
  if (!contextWords) return false;
  const re = new RegExp(`\\b${escapeRegex(alias)}\\b`, "i");
  if (!re.test(verse)) return false;
  const match = verse.match(re);
  if (!match || match.index === undefined) return false;
  const window = verse.slice(
    Math.max(0, match.index - 60),
    Math.min(verse.length, match.index + alias.length + 60)
  ).toLowerCase();
  return contextWords.some(ctx => window.includes(ctx));
}

// ── Full 4-layer CID bonus computation (mirrors routes.ts) ───────────────────

function computeFullCIDBonus(verse, lineCount, cid) {
  const verseLower = verse.toLowerCase();
  const matchedRecordIds = new Set();
  const matchedEntityLabels = [];
  const evidence = [];

  // Layer 1: Canonical Records
  let canonicalMatches = 0;
  for (const rec of cid.canonicalRecords) {
    let matched = false;
    if (rec.term && rec.term.length >= 3) {
      const isHighRisk = rec.term.toLowerCase() in HIGH_RISK_ALIASES;
      matched = isHighRisk
        ? highRiskMatches(verseLower, rec.term)
        : wholeWordTest(rec.term, verseLower);
    }
    if (!matched && rec.short_anchor && rec.short_anchor.length >= 5) {
      matched = verseLower.includes(rec.short_anchor.toLowerCase());
    }
    if (matched && !matchedRecordIds.has(rec.record_id)) {
      matchedRecordIds.add(rec.record_id);
      matchedEntityLabels.push(rec.display_label || rec.term);
      canonicalMatches++;
    }
  }

  // Layer 2: Alias Resolution
  let aliasMatches = 0;
  for (const alias of cid.aliasTerms) {
    if (!alias.alias_text || alias.alias_text.length < 2) continue;
    const isHighRisk = alias.alias_text.toLowerCase() in HIGH_RISK_ALIASES;
    const matched = isHighRisk
      ? highRiskMatches(verseLower, alias.alias_text)
      : wholeWordTest(alias.alias_text, verseLower);
    if (matched && !matchedRecordIds.has(alias.canonical_record_id)) {
      matchedRecordIds.add(alias.canonical_record_id);
      matchedEntityLabels.push(alias.alias_text);
      aliasMatches++;
    }
  }

  const totalRefMatches = canonicalMatches + aliasMatches;
  const culturalReferenceDensity = Math.min(1, totalRefMatches / Math.max(1, lineCount * 0.15));

  if (totalRefMatches > 0) {
    const top = matchedEntityLabels.slice(0, 5).join(", ");
    const more = matchedEntityLabels.length > 5 ? ` +${matchedEntityLabels.length - 5} more` : "";
    evidence.push(`CID: ${totalRefMatches} cultural reference(s) — ${top}${more}`);
  }

  // Layer 3: Entendres
  let entendreMatches = 0;
  let entendreStrengthSum = 0;
  for (const ent of cid.entendreAnchors) {
    const anchor = (ent.short_anchor || ent.anchor || "").trim();
    if (anchor.length < 4) continue;
    const matched = verseLower.includes(anchor.toLowerCase()) ||
      new RegExp(escapeRegex(anchor), "i").test(verseLower);
    if (matched) {
      entendreMatches++;
      entendreStrengthSum += Number(ent.strength) || 3;
      if (entendreMatches <= 3 && ent.interp1) {
        evidence.push(`CID entendre: "${anchor}" — ${ent.interp1}`);
      }
    }
  }
  const entendreScore = entendreMatches === 0 ? 0
    : Math.min(1, (entendreStrengthSum / entendreMatches / 5) * (Math.min(entendreMatches, 4) / 4));

  // Layer 3b: Punchlines
  let punchlineMatches = 0;
  let punchStrengthSum = 0;
  for (const punch of cid.punchlineAnchors) {
    const anchor = (punch.short_anchor || punch.setup_anchor || "").trim();
    if (anchor.length < 5) continue;
    const matched = verseLower.includes(anchor.toLowerCase()) ||
      new RegExp(escapeRegex(anchor), "i").test(verseLower);
    if (matched) {
      punchlineMatches++;
      punchStrengthSum += Number(punch.strength) || 3;
      if (punchlineMatches <= 2 && punch.mechanism) {
        evidence.push(`CID punchline: "${anchor}" — ${punch.mechanism}`);
      }
    }
  }
  const punchlinePatternScore = punchlineMatches === 0 ? 0
    : Math.min(1, (punchStrengthSum / punchlineMatches / 5) * (Math.min(punchlineMatches, 3) / 3));

  // Layer 4: Semantic Graph Co-occurrence
  let semanticCooccurrences = 0;
  const semanticPairs = [];
  for (const edge of cid.semanticEdges) {
    if (matchedRecordIds.has(edge.from_record_id) && matchedRecordIds.has(edge.to_record_id)) {
      semanticCooccurrences++;
      if (semanticPairs.length < 2) semanticPairs.push(`${edge.from_label} ↔ ${edge.to_label}`);
    }
  }
  const semanticScore = Math.min(1, semanticCooccurrences / 3);

  if (semanticCooccurrences > 0) {
    evidence.push(`CID semantic: ${semanticCooccurrences} related pair(s) — ${semanticPairs.join("; ")}`);
  }

  const hasCIDSignal = totalRefMatches > 0 || entendreMatches > 0 || semanticCooccurrences > 0;
  if (!hasCIDSignal) return null;

  // Bonus math — mirrors routes.ts exactly
  const wordplayBonus = Math.min(10,
    culturalReferenceDensity * 5 +
    entendreScore            * 4 +
    semanticScore            * 3
  );
  const punchBonus = Math.min(6,
    punchlinePatternScore * 5 +
    semanticScore         * 2
  );

  return {
    wordplayBonus, punchBonus, evidence,
    canonicalMatches, aliasMatches, entendreMatches,
    punchlineMatches, semanticCooccurrences,
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  console.log(`\n═══════════════════════════════════════════════════`);
  console.log(`  RhymeMath CID Rescore — Full 4-Layer — ${SCORING_VERSION}`);
  console.log(`  ${FORCE ? "FORCE mode: reprocessing all rows" : "Skipping rows already at " + SCORING_VERSION}`);
  console.log(`═══════════════════════════════════════════════════\n`);

  // Load all CID data
  console.log("Loading CID data from Railway...");
  const [recRes, aliasRes, entendreRes, punchRes, edgeRes] = await Promise.all([
    pool.query(`
      SELECT record_id,
             COALESCE(term, canonical_meaning, display_label) AS term,
             short_anchor, display_label, category_primary AS category,
             confidence, COALESCE(risk_flag, 'low') AS risk_flag
      FROM cid_cultural_records
      WHERE review_status = 'approved' AND status = 'active'
        AND COALESCE(term, canonical_meaning, display_label) IS NOT NULL
    `),
    pool.query(`
      SELECT a.alias_id, a.alias_text, a.canonical_record_id,
             COALESCE(r.term, r.canonical_meaning, r.display_label) AS canonical_label,
             r.category_primary AS category,
             COALESCE(a.risk_flag, 'low') AS risk_flag
      FROM cid_aliases a
      LEFT JOIN cid_cultural_records r ON r.record_id = a.canonical_record_id
      WHERE a.review_status = 'approved' AND a.status = 'active'
    `),
    pool.query(`
      SELECT entendre_id, short_anchor, anchor,
             strength_estimate AS strength, confidence,
             interpretation_1 AS interp1
      FROM cid_entendre_candidates
      WHERE review_status = 'approved' AND status = 'active'
        AND strength_estimate >= 3 AND confidence >= 3
    `),
    pool.query(`
      SELECT punchline_id, short_anchor, setup_anchor, mechanism,
             strength_estimate AS strength, confidence
      FROM cid_punchline_patterns
      WHERE review_status = 'approved' AND status = 'active' AND confidence >= 3
    `),
    pool.query(`
      SELECT from_record_id, from_label, to_record_id, to_label,
             relationship_type, confidence::integer AS confidence
      FROM cid_semantic_relationships
      WHERE review_status = 'approved' AND status = 'active'
    `),
  ]);

  const cid = {
    canonicalRecords: recRes.rows,
    aliasTerms: aliasRes.rows,
    entendreAnchors: entendreRes.rows,
    punchlineAnchors: punchRes.rows,
    semanticEdges: edgeRes.rows,
  };

  console.log(`  Canonical records: ${cid.canonicalRecords.length}`);
  console.log(`  Aliases:           ${cid.aliasTerms.length}`);
  console.log(`  Entendres:         ${cid.entendreAnchors.length}`);
  console.log(`  Punchlines:        ${cid.punchlineAnchors.length}`);
  console.log(`  Semantic edges:    ${cid.semanticEdges.length}\n`);

  const { rows: analyses } = await pool.query(
    `SELECT id, result_id, artist_name, song_name, verse, scoring_mode,
            score_overall, score_flow, score_wordplay, score_storytelling,
            score_rhyming, score_punchlines, result_json
     FROM analyses ORDER BY score_overall DESC`
  );

  console.log(`Loaded ${analyses.length} analyses. Processing...\n`);

  let updated = 0;
  let skipped = 0;
  let noHit = 0;
  const r = v => Math.round(v * 10) / 10;

  for (const row of analyses) {
    if (!FORCE && row.scoring_mode === `standard-${SCORING_VERSION}`) {
      skipped++;
      continue;
    }

    const verse = row.verse || "";
    const lineCount = verse.split("\n").filter(l => l.trim()).length;
    const bonus = computeFullCIDBonus(verse, lineCount, cid);

    if (!bonus) {
      noHit++;
      await pool.query(`UPDATE analyses SET scoring_mode = $1 WHERE id = $2`,
        [`standard-${SCORING_VERSION}`, row.id]);
      continue;
    }

    const newWordplay   = Math.min(100, row.score_wordplay   + bonus.wordplayBonus);
    const newPunchlines = Math.min(100, row.score_punchlines + bonus.punchBonus);
    const newOverall    = Math.min(100,
      row.score_flow         * WEIGHTS.flow +
      row.score_rhyming      * WEIGHTS.rhyming +
      newWordplay            * WEIGHTS.wordplay +
      row.score_storytelling * WEIGHTS.storytelling +
      newPunchlines          * WEIGHTS.punchlines
    );

    let resultJson = {};
    try { resultJson = JSON.parse(row.result_json); } catch (_) {}
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

    await pool.query(
      `UPDATE analyses
       SET score_wordplay=$1, score_punchlines=$2, score_overall=$3,
           result_json=$4, scoring_mode=$5
       WHERE id=$6`,
      [r(newWordplay), r(newPunchlines), r(newOverall),
       JSON.stringify(resultJson), `standard-${SCORING_VERSION}`, row.id]
    );

    updated++;
    const delta = r(newOverall) - r(row.score_overall);
    const sign  = delta >= 0 ? "+" : "";
    const tags  = [
      bonus.canonicalMatches   > 0 ? `records:${bonus.canonicalMatches}`   : "",
      bonus.aliasMatches       > 0 ? `aliases:${bonus.aliasMatches}`       : "",
      bonus.entendreMatches    > 0 ? `entendres:${bonus.entendreMatches}`  : "",
      bonus.semanticCooccurrences > 0 ? `semantic:${bonus.semanticCooccurrences}` : "",
    ].filter(Boolean).join("  ");

    console.log(
      `  [UPDATED] ${row.artist_name.padEnd(20)} — ` +
      `${row.song_name.substring(0, 26).padEnd(28)}` +
      `${r(row.score_overall).toFixed(1)} → ${r(newOverall).toFixed(1)}  (${sign}${delta.toFixed(1)})` +
      (tags ? `  [${tags}]` : "")
    );
    for (const e of bonus.evidence) console.log(`           ${e}`);
  }

  console.log(`\n───────────────────────────────────────────────────`);
  console.log(`  Done.`);
  console.log(`  Updated:        ${updated} rows`);
  console.log(`  No CID hit:     ${noHit} rows (version bumped only)`);
  console.log(`  Skipped:        ${skipped} rows (already ${SCORING_VERSION})`);
  console.log(`  Scoring version: ${SCORING_VERSION}`);
  console.log(`───────────────────────────────────────────────────\n`);

  await pool.end();
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
