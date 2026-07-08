/**
 * cidLookup.ts
 * Cultural Intelligence Database (CID) v5.4 — scoring integration.
 *
 * CONTRACT:
 *   - Only queries rows with review_status = 'approved' AND status = 'active'
 *   - candidate_queue is NEVER queried here — review-only, no scoring
 *   - Results are additive signals on top of base textAnalysis scores
 *   - If DB is unavailable, returns zero scores gracefully (never throws)
 */

import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

export interface CIDScoreSignals {
  /** Wordplay bonus: cultural reference density (0-1 scale) */
  culturalReferenceDensity: number;
  /** Wordplay bonus: entendre matches (approved, strength >= 3) */
  entendreScore: number;
  /** Punchlines bonus: punchline pattern matches (approved, confidence >= 3) */
  punchlinePatternScore: number;
  /** Number of alias terms matched in verse */
  aliasMatches: number;
  /** Number of entendre anchors matched */
  entendreMatches: number;
  /** Number of punchline pattern anchors matched */
  punchlineMatches: number;
  /** Evidence strings for result display */
  evidence: string[];
}

const ZERO_SIGNALS: CIDScoreSignals = {
  culturalReferenceDensity: 0,
  entendreScore: 0,
  punchlinePatternScore: 0,
  aliasMatches: 0,
  entendreMatches: 0,
  punchlineMatches: 0,
  evidence: [],
};

/**
 * Loads approved CID records from DB for scoring.
 * Cached per process — refreshes on each server restart.
 * For hot updates, call clearCIDCache().
 */
let _cache: {
  aliasTerms: Array<{ alias_text: string; canonical_meaning: string; category: string }>;
  entendreAnchors: Array<{ short_anchor: string; anchor: string; strength: number; confidence: number; interp1: string }>;
  punchlineAnchors: Array<{ short_anchor: string; setup_anchor: string; mechanism: string; strength: number; confidence: number }>;
} | null = null;

async function loadCIDCache() {
  if (_cache) return _cache;

  try {
    const [aliasRes, entendreRes, punchRes] = await Promise.all([
      // Aliases: approved only — term resolution layer
      pool.query(`
        SELECT a.alias_text, r.term AS canonical_meaning, r.category_primary AS category
        FROM cid_aliases a
        LEFT JOIN cid_cultural_records r ON r.record_id = a.canonical_record_id
        WHERE a.review_status = 'approved' AND a.status = 'active'
      `),
      // Entendres: approved + strength >= 3 + confidence >= 3
      pool.query(`
        SELECT short_anchor, anchor, strength_estimate AS strength,
               confidence, interpretation_1 AS interp1
        FROM cid_entendre_candidates
        WHERE review_status = 'approved' AND status = 'active'
          AND strength_estimate >= 3 AND confidence >= 3
      `),
      // Punchlines: approved + confidence >= 3
      pool.query(`
        SELECT short_anchor, setup_anchor, mechanism,
               strength_estimate AS strength, confidence
        FROM cid_punchline_patterns
        WHERE review_status = 'approved' AND status = 'active'
          AND confidence >= 3
      `),
    ]);

    _cache = {
      aliasTerms: aliasRes.rows,
      entendreAnchors: entendreRes.rows,
      punchlineAnchors: punchRes.rows,
    };

    return _cache;
  } catch (err) {
    // DB unavailable — return empty, don't break scoring
    return { aliasTerms: [], entendreAnchors: [], punchlineAnchors: [] };
  }
}

export function clearCIDCache() {
  _cache = null;
}

/**
 * Main entry point. Call with the full verse text.
 * Returns additive scoring signals — never throws.
 */
export async function scoreCIDSignals(verse: string, lineCount: number): Promise<CIDScoreSignals> {
  if (!verse || verse.trim().length < 10) return ZERO_SIGNALS;

  try {
    const { aliasTerms, entendreAnchors, punchlineAnchors } = await loadCIDCache();
    const verseLower = verse.toLowerCase();
    const evidence: string[] = [];

    // ── 1. Alias / cultural reference density ────────────────────────────────
    let aliasMatches = 0;
    const matchedAliases: string[] = [];
    for (const alias of aliasTerms) {
      if (!alias.alias_text) continue;
      const term = alias.alias_text.toLowerCase().trim();
      if (term.length < 3) continue;
      // Whole-word match
      const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (re.test(verseLower)) {
        aliasMatches++;
        matchedAliases.push(alias.alias_text);
      }
    }
    if (aliasMatches > 0) {
      evidence.push(`CID: ${aliasMatches} cultural reference(s) detected — ${matchedAliases.slice(0, 4).join(', ')}${aliasMatches > 4 ? ` +${aliasMatches - 4} more` : ''}`);
    }

    // Cultural reference density: ratio of matched aliases to line count, capped at 1
    const culturalReferenceDensity = Math.min(1, aliasMatches / Math.max(1, lineCount * 0.3));

    // ── 2. Entendre matching ──────────────────────────────────────────────────
    let entendreMatches = 0;
    let entendreStrengthSum = 0;
    for (const ent of entendreAnchors) {
      const anchor = (ent.short_anchor || ent.anchor || '').toLowerCase().trim();
      if (anchor.length < 3) continue;
      const re = new RegExp(anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      if (re.test(verseLower)) {
        entendreMatches++;
        entendreStrengthSum += ent.strength || 3;
        if (ent.interp1 && entendreMatches <= 2) {
          evidence.push(`CID entendre: "${ent.short_anchor || ent.anchor}" — ${ent.interp1}`);
        }
      }
    }
    // Normalize: avg strength of matches / 5, scaled by match count (capped)
    const entendreScore = entendreMatches === 0 ? 0
      : Math.min(1, (entendreStrengthSum / entendreMatches / 5) * Math.min(entendreMatches, 4) / 4);

    // ── 3. Punchline pattern matching ─────────────────────────────────────────
    let punchlineMatches = 0;
    let punchStrengthSum = 0;
    for (const punch of punchlineAnchors) {
      const anchor = (punch.short_anchor || punch.setup_anchor || '').toLowerCase().trim();
      if (anchor.length < 4) continue;
      const re = new RegExp(anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      if (re.test(verseLower)) {
        punchlineMatches++;
        punchStrengthSum += punch.strength || 3;
        if (punch.mechanism && punchlineMatches <= 2) {
          evidence.push(`CID punchline: "${punch.short_anchor || punch.setup_anchor}" — ${punch.mechanism}`);
        }
      }
    }
    const punchlinePatternScore = punchlineMatches === 0 ? 0
      : Math.min(1, (punchStrengthSum / punchlineMatches / 5) * Math.min(punchlineMatches, 3) / 3);

    return {
      culturalReferenceDensity,
      entendreScore,
      punchlinePatternScore,
      aliasMatches,
      entendreMatches,
      punchlineMatches,
      evidence,
    };
  } catch {
    return ZERO_SIGNALS;
  }
}
