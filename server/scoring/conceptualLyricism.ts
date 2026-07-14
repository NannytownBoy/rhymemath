/**
 * conceptualLyricism.ts
 * RhymeMath v6 — Conceptual Lyricism cross-cutting signal
 *
 * Conceptual lyricism is NOT a 6th scoring pillar.
 * It is a cross-cutting signal that strengthens interpretation across the
 * five core pillars when present. It cannot create fake scores where
 * evidence is absent, but it adds weight when signals are genuinely there.
 *
 * What it detects:
 *   - Abstraction / philosophical framing (worldview language)
 *   - Symbolism clusters (extended metaphor systems)
 *   - Thematic continuity (the same abstract idea recurs across the verse)
 *   - Image systems (concrete images serving a symbolic function)
 *   - Poetic density (layered meaning per line — compression)
 *
 * Output: conceptualScore 0-100 (advisory signal, not a 6th weight)
 * Usage: when conceptualScore >= threshold, provides small additive bonus
 *        to Wordplay, Storytelling, and Punchlines — never to Flow or Rhyming.
 */

import { getLines } from "./textAnalysis.js";
import { clamp } from "./textAnalysis.js";

// ── Abstraction vocabulary ────────────────────────────────────────────────────
// Words that signal abstract/philosophical framing in a rap context
const ABSTRACTION_TERMS = new Set([
  // Existence / metaphysics
  "existence","eternal","mortal","immortal","infinite","void","nothingness","divine",
  "celestial","cosmic","universe","creation","entropy","paradox","duality","transcend",
  "ascend","descend","abyss","consciousness","subconscious","ego","psyche","karma",
  "reincarnation","spirit","soul","ghost","phantom","shadow","mirror","reflection",
  // Socio-political abstraction
  "system","institution","oppression","liberation","revolution","struggle","resistance",
  "power","authority","hierarchy","empire","colonize","colonization","subjugate",
  "propaganda","ideology","paradigm","narrative","illusion","matrix","simulation",
  // Poetic abstractions frequently used in elite rap
  "legacy","heritage","bloodline","lineage","ancestry","sacrifice","redemption",
  "resurrection","phoenix","cycle","spiral","labyrinth","crossroads","threshold",
  "genesis","exodus","revelation","prophecy","vision","oracle","symbol","allegory",
  "parable","metaphor","archetype","ritual","ceremony","covenant","testament",
  // Nature as symbol
  "storm","flood","drought","fire","ice","stone","iron","gold","silver","diamond",
  "seed","root","branch","bloom","decay","rot","rust","dust","ash","rebirth",
]);

// ── Symbol cluster detector ───────────────────────────────────────────────────
// Identifies extended metaphor systems: the same symbolic domain recurring across lines
// e.g. "womb / tomb / beast / yeast / feast" = organic/life-cycle system
const SYMBOL_FAMILIES: Array<{ name: string; terms: string[] }> = [
  { name: "life_death_cycle",    terms: ["womb","tomb","birth","death","die","live","decay","bloom","seed","ash","dust","grave","born","dead"] },
  { name: "royalty_power",       terms: ["king","queen","crown","throne","empire","dynasty","reign","rule","lord","sovereign","palace","kingdom"] },
  { name: "war_conflict",        terms: ["war","battle","soldier","weapon","sword","shield","army","enemy","defeat","victory","wound","scar","warrior"] },
  { name: "street_trap_duality", terms: ["trap","grind","hustle","corner","block","fiend","pack","bird","work","serve","flip","score","drought"] },
  { name: "religion_spirit",     terms: ["god","devil","angel","demon","heaven","hell","prayer","sin","bless","curse","prophet","disciple","scripture"] },
  { name: "chess_strategy",      terms: ["chess","pawn","king","queen","bishop","rook","knight","checkmate","move","piece","board","play","sacrifice"] },
  { name: "nature_elements",     terms: ["fire","water","earth","wind","storm","rain","flood","lightning","mountain","ocean","river","desert","jungle"] },
];

function detectSymbolClusters(verse: string): { clusters: string[]; maxDepth: number } {
  const lower = verse.toLowerCase();
  const fired: string[] = [];
  let maxDepth = 0;

  for (const family of SYMBOL_FAMILIES) {
    const hits = family.terms.filter(t => {
      // whole-word match
      const re = new RegExp(`\\b${t}\\b`, "i");
      return re.test(lower);
    }).length;
    if (hits >= 2) {
      fired.push(family.name);
      maxDepth = Math.max(maxDepth, hits);
    }
  }

  return { clusters: fired, maxDepth };
}

// ── Thematic continuity ───────────────────────────────────────────────────────
// Measures whether a single abstract concept recurs throughout the verse
// (vs. a verse that topic-hops with abstract words scattered randomly)
function thematicContinuity(verse: string): number {
  const lines = getLines(verse);
  if (lines.length < 4) return 0;

  // Find the most-represented abstraction term cluster across lines
  const termLines: Record<string, number> = {};
  for (const line of lines) {
    const lower = line.toLowerCase();
    for (const term of ABSTRACTION_TERMS) {
      if (lower.includes(term)) {
        termLines[term] = (termLines[term] ?? 0) + 1;
      }
    }
  }

  const topTerm = Object.values(termLines).sort((a, b) => b - a)[0] ?? 0;
  // A term appearing in 40%+ of lines = genuine thematic anchor
  return topTerm / lines.length;
}

// ── Poetic compression ────────────────────────────────────────────────────────
// Dense lines (high abstraction word count per line) = compressed meaning
function poeticDensity(verse: string): number {
  const lines = getLines(verse);
  if (lines.length === 0) return 0;

  let abstractHitsTotal = 0;
  for (const line of lines) {
    const lower = line.toLowerCase();
    const words = lower.split(/\s+/);
    abstractHitsTotal += words.filter(w => ABSTRACTION_TERMS.has(w)).length;
  }

  return abstractHitsTotal / lines.length; // avg abstraction words per line
}

// ── Main: scoreConceptualLyricism ─────────────────────────────────────────────

export interface ConceptualResult {
  conceptualScore: number;  // 0-100
  evidence: string[];
  symbolClusters: string[];
  poeticDensityScore: number;
  thematicContinuityScore: number;
}

export function scoreConceptualLyricism(verse: string): ConceptualResult {
  if (!verse || verse.trim().length < 20) {
    return { conceptualScore: 0, evidence: [], symbolClusters: [], poeticDensityScore: 0, thematicContinuityScore: 0 };
  }

  const lines = getLines(verse);
  const { clusters, maxDepth } = detectSymbolClusters(verse);
  const continuity = thematicContinuity(verse);
  const density = poeticDensity(verse);

  // Count raw abstraction term hits (unique terms)
  const lower = verse.toLowerCase();
  const abstractHits = [...ABSTRACTION_TERMS].filter(t => {
    const re = new RegExp(`\\b${t}\\b`, "i");
    return re.test(lower);
  }).length;

  // ── Component scores ──────────────────────────────────────────────────────
  // 1. Symbol cluster depth (up to 30 pts)
  const clusterScore = Math.min(clusters.length * 8 + maxDepth * 2, 30);

  // 2. Thematic continuity (up to 25 pts)
  const continuityScore = clamp(continuity * 50);

  // 3. Poetic density per line (up to 20 pts)
  const densityScore = Math.min(density * 15, 20);

  // 4. Raw abstraction vocabulary (up to 25 pts)
  const vocabScore = Math.min(abstractHits * 3, 25);

  const raw = clusterScore + continuityScore + densityScore + vocabScore;
  const conceptualScore = clamp(Math.round(raw));

  const evidence: string[] = [];
  if (clusters.length > 0) evidence.push(`Symbol clusters: ${clusters.join(", ")}`);
  if (abstractHits > 0) evidence.push(`${abstractHits} abstraction term${abstractHits !== 1 ? "s" : ""} detected`);
  if (continuity > 0.3) evidence.push(`Thematic continuity: ${(continuity * 100).toFixed(0)}% of lines share a theme`);
  if (density > 0.5) evidence.push(`Poetic density: ${density.toFixed(2)} abstraction words/line`);

  return {
    conceptualScore,
    evidence,
    symbolClusters: clusters,
    poeticDensityScore: densityScore,
    thematicContinuityScore: continuityScore,
  };
}

// ── Conceptual boost application ─────────────────────────────────────────────
// When conceptualScore crosses a threshold, apply small additive boosts
// to Wordplay, Storytelling, and Punchlines only.
// Never boosts Flow or Rhyming.
// Never lifts a dimension above its credible cap.
// Requires minimum existing evidence in the target dimension to fire.

export function applyConceptualBoosts(
  scores: { wordplay: number; storytelling: number; punchlines: number; flow: number; rhyming: number },
  conceptualScore: number,
  suppressionFlags: string[]
): { wordplay: number; storytelling: number; punchlines: number; flow: number; rhyming: number } {
  if (conceptualScore < 30) return { ...scores };  // below threshold — no boost

  // If suppression already fired on a dimension, conceptual cannot override it
  const suppressed = new Set(suppressionFlags.map(f => f.split(":")[0]));

  const result = { ...scores };

  // Boost scale: 30-49 = small, 50-69 = medium, 70+ = significant
  const boost = conceptualScore >= 70 ? 6 : conceptualScore >= 50 ? 4 : 2;

  if (!suppressed.has("shallow_tag_stack") && !suppressed.has("hook_pattern_detected")) {
    // Wordplay boost only if existing wordplay evidence (score > 35)
    if (scores.wordplay > 35) {
      result.wordplay = Math.min(clamp(scores.wordplay + boost), 92);
    }
    // Storytelling boost only if thematic coherence exists (score > 40)
    if (scores.storytelling > 40) {
      result.storytelling = Math.min(clamp(scores.storytelling + boost), 92);
    }
    // Punchlines boost only if punchline signals exist (score > 40)
    if (scores.punchlines > 40) {
      result.punchlines = Math.min(clamp(scores.punchlines + boost), 90);
    }
  }

  return result;
}
