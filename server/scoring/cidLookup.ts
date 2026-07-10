/**
 * cidLookup.ts
 * Cultural Intelligence Database (CID) v5.4 — FULL scoring integration.
 *
 * FOUR SIGNAL LAYERS (all additive, all non-breaking):
 *   1. Canonical Records  — direct match against cultural_records.term /
 *                           canonical_label / short_anchor (60 entities)
 *   2. Alias Resolution   — slang → canonical entity mapping (24 aliases)
 *   3. Entendre Detection — anchor phrase pattern matching (12 patterns)
 *   4. Semantic Graph     — co-occurrence bonus when two related entities
 *                           both appear in the same verse (30 edges)
 *
 * CONTRACT:
 *   - Only rows with review_status = 'approved' AND status = 'active' fire scoring
 *   - candidate_queue is NEVER queried — review-only, never scored
 *   - HIGH-RISK aliases (e.g. "pen") require longer-phrase context to fire
 *   - If DB is unavailable, returns zero signals — base scoring unaffected
 *   - Cache per process; cleared on server restart or explicit clearCIDCache()
 */

import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

// ── High-risk alias terms that require phrase-context to avoid false positives ──
// These are common English words that double as slang — require surrounding
// context words to confirm they're being used in the cultural sense.
const HIGH_RISK_ALIASES: Record<string, string[]> = {
  "pen":   ["send", "flow", "rhyme", "bars", "spit", "write", "ill", "the", "my", "wit"],
  "chain": ["gold", "platinum", "neck", "jewel", "ice", "rock", "bust", "cop"],
  "game":  ["the game", "rap game", "street", "came from", "in the"],
  "section": ["vip", "the section", "my section", "verse", "paid"],
};

export interface CIDScoreSignals {
  /** Layer 1: direct canonical record hits */
  canonicalMatches: number;
  /** Layer 2: alias resolution hits */
  aliasMatches: number;
  /** Layer 3: entendre pattern hits */
  entendreMatches: number;
  /** Layer 4: semantic graph co-occurrence bonus */
  semanticCooccurrences: number;
  /** Combined cultural reference density (0-1) driving wordplay bonus */
  culturalReferenceDensity: number;
  /** Entendre score (0-1) driving wordplay bonus */
  entendreScore: number;
  /** Punchline pattern score (0-1) driving punchlines bonus */
  punchlinePatternScore: number;
  /** Semantic co-occurrence score (0-1) driving coherence bonus */
  semanticScore: number;
  /** Evidence strings for result display */
  evidence: string[];
  /** All matched entity labels for deduplication */
  matchedEntities: string[];
}

const ZERO_SIGNALS: CIDScoreSignals = {
  canonicalMatches: 0,
  aliasMatches: 0,
  entendreMatches: 0,
  semanticCooccurrences: 0,
  culturalReferenceDensity: 0,
  entendreScore: 0,
  punchlinePatternScore: 0,
  semanticScore: 0,
  evidence: [],
  matchedEntities: [],
};

interface CIDFigure {
  id: number;
  figure_name: string;
  aliases: string[];
  figure_type: string;
  domains: string[];
  cultural_context: string | null;
  scandal_summary: string | null;
  era: string | null;
}

interface CIDCache {
  // Layer 0: real-world figures (people, events, scandals)
  figures: CIDFigure[];
  // Layer 1: canonical records — term + short_anchor for direct matching
  canonicalRecords: Array<{
    record_id: string;
    term: string;
    short_anchor: string | null;
    display_label: string;
    category: string;
    confidence: number;
    risk_flag: string;
  }>;
  // Layer 2: aliases — slang text → canonical record
  aliasTerms: Array<{
    alias_id: string;
    alias_text: string;
    canonical_record_id: string;
    canonical_label: string;
    category: string;
    risk_flag: string;
    sensitivity_tag: string;
  }>;
  // Layer 3: entendres
  entendreAnchors: Array<{
    entendre_id: string;
    short_anchor: string;
    anchor: string;
    strength: number;
    confidence: number;
    interp1: string;
    interp2: string;
    risk_flag: string;
  }>;
  // Layer 3b: punchlines
  punchlineAnchors: Array<{
    punchline_id: string;
    short_anchor: string;
    setup_anchor: string;
    mechanism: string;
    strength: number;
    confidence: number;
  }>;
  // Layer 4: semantic graph edges
  semanticEdges: Array<{
    from_record_id: string;
    from_label: string;
    to_record_id: string;
    to_label: string;
    relationship_type: string;
    confidence: number;
  }>;
}

let _cache: CIDCache | null = null;

async function loadCIDCache(): Promise<CIDCache> {
  if (_cache) return _cache;

  try {
    const [figRes, recRes, aliasRes, entendreRes, punchRes, edgeRes] = await Promise.all([

      // Layer 0: real-world figures
      pool.query(`
        SELECT id, figure_name, aliases, figure_type, domains,
               cultural_context, scandal_summary, era
        FROM cid_figures
        WHERE review_status = 'approved' AND status = 'active'
      `),

      // Layer 1: canonical records — approved + active only
      pool.query(`
        SELECT record_id,
               COALESCE(term, canonical_meaning, display_label) AS term,
               short_anchor,
               display_label,
               category_primary AS category,
               confidence,
               COALESCE(risk_flag, 'low') AS risk_flag
        FROM cid_cultural_records
        WHERE review_status = 'approved'
          AND status = 'active'
          AND COALESCE(term, canonical_meaning, display_label) IS NOT NULL
      `),

      // Layer 2: aliases — approved + active, join to get canonical label
      pool.query(`
        SELECT a.alias_id,
               a.alias_text,
               a.canonical_record_id,
               COALESCE(r.term, r.canonical_meaning, r.display_label) AS canonical_label,
               r.category_primary AS category,
               COALESCE(a.risk_flag, 'low') AS risk_flag,
               COALESCE(a.sensitivity_tag, 'contextual') AS sensitivity_tag
        FROM cid_aliases a
        LEFT JOIN cid_cultural_records r ON r.record_id = a.canonical_record_id
        WHERE a.review_status = 'approved'
          AND a.status = 'active'
      `),

      // Layer 3: entendres — approved + strength >= 3 + confidence >= 3
      pool.query(`
        SELECT entendre_id, short_anchor, anchor,
               strength_estimate AS strength, confidence,
               interpretation_1 AS interp1,
               interpretation_2 AS interp2,
               COALESCE(risk_flag, 'low') AS risk_flag
        FROM cid_entendre_candidates
        WHERE review_status = 'approved'
          AND status = 'active'
          AND strength_estimate >= 3
          AND confidence >= 3
      `),

      // Layer 3b: punchlines — approved + confidence >= 3
      pool.query(`
        SELECT punchline_id, short_anchor, setup_anchor, mechanism,
               strength_estimate AS strength, confidence
        FROM cid_punchline_patterns
        WHERE review_status = 'approved'
          AND status = 'active'
          AND confidence >= 3
      `),

      // Layer 4: semantic graph — approved edges only
      pool.query(`
        SELECT from_record_id, from_label, to_record_id, to_label,
               relationship_type, confidence::integer AS confidence
        FROM cid_semantic_relationships
        WHERE review_status = 'approved'
          AND status = 'active'
      `),
    ]);

    _cache = {
      figures: figRes.rows.map(r => ({
        ...r,
        aliases: Array.isArray(r.aliases) ? r.aliases : (JSON.parse(r.aliases ?? '[]')),
        domains: Array.isArray(r.domains) ? r.domains : (JSON.parse(r.domains ?? '[]')),
      })),
      canonicalRecords: recRes.rows,
      aliasTerms: aliasRes.rows,
      entendreAnchors: entendreRes.rows,
      punchlineAnchors: punchRes.rows,
      semanticEdges: edgeRes.rows,
    };

    console.log(
      `[CID] Cache loaded: ${_cache.figures.length} figures, ` +
      `${_cache.canonicalRecords.length} records, ` +
      `${_cache.aliasTerms.length} aliases, ` +
      `${_cache.entendreAnchors.length} entendres, ` +
      `${_cache.punchlineAnchors.length} punchlines, ` +
      `${_cache.semanticEdges.length} semantic edges`
    );

    return _cache;
  } catch (err) {
    console.error("[CID] Cache load failed (non-fatal):", err);
    return {
      figures: [],
      canonicalRecords: [],
      aliasTerms: [],
      entendreAnchors: [],
      punchlineAnchors: [],
      semanticEdges: [],
    };
  }
}

export function clearCIDCache() {
  _cache = null;
}

/**
 * getMatchedTokens
 * Returns all CID-matched surface forms found in the verse text.
 * Used by the /api/cid/tokens endpoint to drive teal glow on the frontend.
 * Deduplicates by matched string (case-insensitive).
 */
export async function getMatchedTokens(
  verse: string
): Promise<{ token: string; label: string; layer: "canonical" | "alias" | "entendre" | "punchline" }[]> {
  if (!verse || verse.trim().length < 10) return [];
  const cache = await loadCIDCache();
  const verseLower = verse.toLowerCase();
  const seen = new Set<string>();
  const results: { token: string; label: string; layer: "canonical" | "alias" | "entendre" | "punchline" }[] = [];

  const add = (token: string, label: string, layer: "canonical" | "alias" | "entendre" | "punchline") => {
    const key = token.toLowerCase();
    if (!seen.has(key)) { seen.add(key); results.push({ token, label, layer }); }
  };

  // Layer 0: real-world figures
  for (const fig of cache.figures) {
    const allNames = [fig.figure_name, ...fig.aliases];
    const matchedName = allNames.find(name => name.length >= 3 && wholeWord(name).test(verseLower));
    if (matchedName) add(matchedName, fig.figure_name, "canonical");
  }

  // Layer 1: canonical records
  for (const rec of cache.canonicalRecords) {
    let matchedToken: string | null = null;
    if (rec.term && rec.term.length >= 3) {
      const isHR = rec.term.toLowerCase() in HIGH_RISK_ALIASES;
      if (isHR ? highRiskAliasMatches(verseLower, rec.term) : wholeWord(rec.term).test(verseLower))
        matchedToken = rec.term;
    }
    if (!matchedToken && rec.short_anchor && rec.short_anchor.length >= 5) {
      if (verseLower.includes(rec.short_anchor.toLowerCase()))
        matchedToken = rec.short_anchor;
    }
    if (matchedToken) add(matchedToken, rec.display_label || rec.term, "canonical");
  }

  // Layer 2: aliases
  for (const alias of cache.aliasTerms) {
    if (!alias.alias_text || alias.alias_text.length < 2) continue;
    const isHR = alias.alias_text.toLowerCase() in HIGH_RISK_ALIASES;
    const hit = isHR
      ? highRiskAliasMatches(verseLower, alias.alias_text)
      : wholeWord(alias.alias_text).test(verseLower);
    if (hit) add(alias.alias_text, alias.canonical_label, "alias");
  }

  // Layer 3: entendres
  for (const ent of cache.entendreAnchors) {
    const anchor = (ent.short_anchor || ent.anchor || "").trim();
    if (anchor.length < 4) continue;
    if (verseLower.includes(anchor.toLowerCase()) || new RegExp(escapeRegex(anchor), "i").test(verseLower))
      add(anchor, anchor, "entendre");
  }

  // Layer 4: punchlines
  for (const punch of cache.punchlineAnchors) {
    const anchor = (punch.short_anchor || punch.setup_anchor || "").trim();
    if (anchor.length < 5) continue;
    if (verseLower.includes(anchor.toLowerCase()) || new RegExp(escapeRegex(anchor), "i").test(verseLower))
      add(anchor, anchor, "punchline");
  }

  return results;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wholeWord(term: string): RegExp {
  return new RegExp(`\\b${escapeRegex(term)}\\b`, "i");
}

/**
 * For high-risk aliases, require at least one context word nearby (within 60 chars).
 * Returns true if the alias fires legitimately.
 */
function highRiskAliasMatches(verse: string, alias: string): boolean {
  const contextWords = HIGH_RISK_ALIASES[alias.toLowerCase()];
  if (!contextWords) return false; // not high-risk, shouldn't be called this way

  const re = wholeWord(alias);
  if (!re.test(verse)) return false;

  // Find match position and check surrounding 60 chars for at least one context word
  const match = verse.match(re);
  if (!match || match.index === undefined) return false;

  const window = verse.slice(
    Math.max(0, match.index - 60),
    Math.min(verse.length, match.index + alias.length + 60)
  ).toLowerCase();

  return contextWords.some(ctx => window.includes(ctx));
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Full CID scoring — runs all 4 layers against the verse text.
 * Returns additive scoring signals. Never throws.
 */
export async function scoreCIDSignals(verse: string, lineCount: number): Promise<CIDScoreSignals> {
  if (!verse || verse.trim().length < 10) return ZERO_SIGNALS;

  try {
    const cache = await loadCIDCache();
    const verseLower = verse.toLowerCase();
    const evidence: string[] = [];

    // Track matched record_ids for semantic graph lookup + deduplication
    const matchedRecordIds = new Set<string>();
    const matchedEntityLabels: string[] = [];

    // ── LAYER 0: Real-World Figures ──────────────────────────────────────────
    // Match cid_figures by primary name + all aliases (people, scandals, events)
    let figureMatches = 0;
    for (const fig of cache.figures) {
      const allNames = [fig.figure_name, ...fig.aliases];
      const hit = allNames.some(name => name.length >= 3 && wholeWord(name).test(verseLower));
      if (hit) {
        const key = `fig_${fig.id}`;
        if (!matchedRecordIds.has(key)) {
          matchedRecordIds.add(key);
          matchedEntityLabels.push(fig.figure_name);
          figureMatches++;
          evidence.push(`CID figure: "${fig.figure_name}"${fig.scandal_summary ? ` — ${fig.scandal_summary.slice(0, 60)}...` : ''}`);
        }
      }
    }

        // ── LAYER 1: Canonical Records ────────────────────────────────────────────
    // Match against term, short_anchor, and display_label of approved records
    let canonicalMatches = 0;
    for (const rec of cache.canonicalRecords) {
      let matched = false;

      // Try term (primary)
      if (rec.term && rec.term.length >= 3) {
        const isHighRisk = rec.term.toLowerCase() in HIGH_RISK_ALIASES;
        if (isHighRisk) {
          matched = highRiskAliasMatches(verseLower, rec.term);
        } else {
          matched = wholeWord(rec.term).test(verseLower);
        }
      }

      // Try short_anchor as fallback (phrase-level match — no whole-word required)
      if (!matched && rec.short_anchor && rec.short_anchor.length >= 5) {
        matched = verseLower.includes(rec.short_anchor.toLowerCase());
      }

      if (matched && !matchedRecordIds.has(rec.record_id)) {
        matchedRecordIds.add(rec.record_id);
        matchedEntityLabels.push(rec.display_label || rec.term);
        canonicalMatches++;
      }
    }

    // ── LAYER 2: Alias Resolution ─────────────────────────────────────────────
    // Slang terms that resolve to a canonical record
    let aliasMatches = 0;
    for (const alias of cache.aliasTerms) {
      if (!alias.alias_text || alias.alias_text.length < 2) continue;

      let matched = false;
      const isHighRisk = alias.alias_text.toLowerCase() in HIGH_RISK_ALIASES;

      if (isHighRisk) {
        matched = highRiskAliasMatches(verseLower, alias.alias_text);
      } else {
        matched = wholeWord(alias.alias_text).test(verseLower);
      }

      if (matched && !matchedRecordIds.has(alias.canonical_record_id)) {
        matchedRecordIds.add(alias.canonical_record_id);
        matchedEntityLabels.push(alias.alias_text);
        aliasMatches++;
      }
    }

    // Combined cultural reference density across layers 0 + 1 + 2
    const totalRefMatches = figureMatches + canonicalMatches + aliasMatches;
    // Density denominator: 0.15 means 2 hits in a 16-line verse = density 0.83
    // Tuned to approximate the "oh shit" recognition threshold —
    // even 1-2 authentic cultural hits in a verse is a meaningful signal
    const culturalReferenceDensity = Math.min(1, totalRefMatches / Math.max(1, lineCount * 0.15));

    if (totalRefMatches > 0) {
      const topRefs = matchedEntityLabels.slice(0, 5).join(", ");
      const more = matchedEntityLabels.length > 5 ? ` +${matchedEntityLabels.length - 5} more` : "";
      evidence.push(
        `CID: ${totalRefMatches} cultural reference(s) — ${topRefs}${more}`
      );
    }

    // ── LAYER 3: Entendre Detection ───────────────────────────────────────────
    let entendreMatches = 0;
    let entendreStrengthSum = 0;
    for (const ent of cache.entendreAnchors) {
      const anchor = (ent.short_anchor || ent.anchor || "").trim();
      if (anchor.length < 4) continue;

      // Phrase-level match (entendres are multi-word, so no whole-word needed)
      const matched = verseLower.includes(anchor.toLowerCase()) ||
        new RegExp(escapeRegex(anchor), "i").test(verseLower);

      if (matched) {
        entendreMatches++;
        entendreStrengthSum += Number(ent.strength) || 3;
        if (entendreMatches <= 3) {
          const interp = ent.interp1 ? ` — ${ent.interp1}` : "";
          evidence.push(`CID entendre: "${anchor}"${interp}`);
        }
      }
    }

    const entendreScore = entendreMatches === 0 ? 0
      : Math.min(1,
          (entendreStrengthSum / entendreMatches / 5) *
          (Math.min(entendreMatches, 4) / 4)
        );

    // ── LAYER 3b: Punchline Pattern Detection ─────────────────────────────────
    let punchlineMatches = 0;
    let punchStrengthSum = 0;
    for (const punch of cache.punchlineAnchors) {
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
      : Math.min(1,
          (punchStrengthSum / punchlineMatches / 5) *
          (Math.min(punchlineMatches, 3) / 3)
        );

    // ── LAYER 4: Semantic Graph Co-occurrence ─────────────────────────────────
    // If two entities connected by a semantic edge BOTH appear in the verse,
    // that's a coherence signal — the artist is operating in a shared cultural
    // domain, not just dropping random references.
    let semanticCooccurrences = 0;
    const semanticPairs: string[] = [];

    for (const edge of cache.semanticEdges) {
      const fromHit = matchedRecordIds.has(edge.from_record_id);
      const toHit   = matchedRecordIds.has(edge.to_record_id);

      if (fromHit && toHit) {
        semanticCooccurrences++;
        if (semanticPairs.length < 2) {
          semanticPairs.push(`${edge.from_label} ↔ ${edge.to_label}`);
        }
      }
    }

    // Semantic score: each co-occurrence is a strong signal — cap at 3 pairs
    const semanticScore = Math.min(1, semanticCooccurrences / 3);

    if (semanticCooccurrences > 0) {
      evidence.push(
        `CID semantic: ${semanticCooccurrences} related concept pair(s) — ${semanticPairs.join("; ")}`
      );
    }

    return {
      canonicalMatches,
      aliasMatches,
      entendreMatches,
      semanticCooccurrences,
      culturalReferenceDensity,
      entendreScore,
      punchlinePatternScore,
      semanticScore,
      evidence,
      matchedEntities: matchedEntityLabels,
    };

  } catch (err) {
    console.error("[CID] Scoring error (non-fatal):", err);
    return ZERO_SIGNALS;
  }
}
