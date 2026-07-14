/**
 * suppressionEngine.ts
 * RhymeMath v6 — Suppression Layer
 *
 * Prevents inflated subscores and unrealistic rankings by detecting:
 *   - Repetitive/filler content stacking into elite scores
 *   - Shallow tag accumulation (many weak hits summing to high raw score)
 *   - Hook/chorus repetition patterns masquerading as verse craft
 *   - Single-signal dominance (one noisy metric distorting the overall)
 *   - Short/fragment verses claiming extended verse credits
 *
 * CONTRACT:
 *   - suppressionEngine.apply() MUST be called after all raw subscores are computed
 *   - Suppression never raises a score, only constrains it
 *   - Every suppression that fires writes a flag to suppression_flags[]
 *   - The same suppression rules apply in solo, battle, ingest, and rescore paths
 */

import { getLines } from "./textAnalysis.js";
import { clamp } from "./textAnalysis.js";

export interface RawScores {
  flow: number;
  rhyming: number;
  wordplay: number;
  storytelling: number;
  punchlines: number;
}

export interface SuppressionResult {
  scores: RawScores;
  flags: string[];  // machine-readable suppression reasons
  suppressed: boolean;
}

// ── Suppression thresholds ────────────────────────────────────────────────────
const ELITE_FLOOR   = 85;  // Scores at/above this are "elite" — need stronger evidence
const HARD_CAP_WEAK = 72;  // Ceiling for verses with multiple weak-evidence flags
const HARD_CAP_FILLER = 65; // Ceiling when repetition/filler dominates

// ── Repetition detector ───────────────────────────────────────────────────────
// Flags verses where a significant portion of lines are near-identical
// (hook/chorus repetition patterns, filler bars, "uh / yeah / aye" padding)
function detectRepetition(verse: string): { ratio: number; isHookPattern: boolean } {
  const lines = getLines(verse).map(l => l.toLowerCase().trim());
  if (lines.length < 4) return { ratio: 0, isHookPattern: false };

  // Exact duplicate lines
  const counts: Record<string, number> = {};
  for (const l of lines) counts[l] = (counts[l] ?? 0) + 1;
  const duplicateLines = Object.values(counts).filter(c => c > 1).reduce((s, c) => s + (c - 1), 0);
  const ratio = duplicateLines / lines.length;

  // Hook pattern: short lines (< 6 words), all repeated, clustered
  const shortRepeatLines = lines.filter(l => l.split(/\s+/).length < 6 && counts[l] > 1).length;
  const isHookPattern = shortRepeatLines / lines.length > 0.4;

  return { ratio, isHookPattern };
}

// ── Filler detector ───────────────────────────────────────────────────────────
// Counts proportion of words that are filler/padding with no semantic content
const FILLER_WORDS = new Set([
  "uh", "uh-uh", "yeah", "yea", "yuh", "ayy", "aye", "ay", "hey",
  "oh", "ooh", "ah", "aha", "mm", "mmm", "hm", "hmm",
  "like", "you", "know", "i", "a", "an", "the", "and", "or", "but",
  "it", "its", "it's", "that", "this", "these", "those",
  "na", "nah", "la", "da", "ta", "wa",
]);

function fillerRatio(verse: string): number {
  const words = verse.toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return 0;
  const fillerCount = words.filter(w => FILLER_WORDS.has(w)).length;
  return fillerCount / words.length;
}

// ── Shallow-tag detector ──────────────────────────────────────────────────────
// A high raw score assembled from MANY small hits (each < threshold) is less credible
// than the same score assembled from fewer, stronger hits.
// Fires when: raw score is elite AND evidence spread is thin (many 1-pt hits, no 10+ pt hits)
function isShallowTagStack(rawScore: number, lineCount: number, verse: string): boolean {
  if (rawScore < ELITE_FLOOR) return false;
  // Elite score on a very short verse = suspicious
  if (lineCount < 8 && rawScore >= ELITE_FLOOR) return true;
  // Elite score with low word diversity = suspicious (same words repeated)
  const words = verse.toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/).filter(w => w.length > 1);
  const uniqueRatio = new Set(words).size / Math.max(1, words.length);
  if (uniqueRatio < 0.45 && rawScore >= ELITE_FLOOR) return true;
  return false;
}

// ── Single-signal dominance ───────────────────────────────────────────────────
// Prevents one noisy metric from carrying the full score.
// Example: very high internal rhyme count (151) with low other signals → suppress
function dominanceCheck(scores: RawScores): { dominant: string | null; gap: number } {
  const arr = [
    { name: "flow", v: scores.flow },
    { name: "rhyming", v: scores.rhyming },
    { name: "wordplay", v: scores.wordplay },
    { name: "storytelling", v: scores.storytelling },
    { name: "punchlines", v: scores.punchlines },
  ].sort((a, b) => b.v - a.v);
  const gap = arr[0].v - arr[1].v;
  return { dominant: gap > 35 ? arr[0].name : null, gap };
}

// ── Verse length credibility ──────────────────────────────────────────────────
// A 4-line fragment cannot credibly demonstrate elite storytelling or extended flow.
// Caps elite scores on short verses — does NOT penalize average scores.
function lengthCredibilityFlag(lineCount: number, scores: RawScores): string[] {
  const flags: string[] = [];
  if (lineCount < 4) {
    if (scores.storytelling > 70) flags.push("storytelling_cap_short_verse");
    if (scores.flow > 70) flags.push("flow_cap_short_verse");
  }
  if (lineCount < 8) {
    if (scores.storytelling > 78) flags.push("storytelling_cap_partial_verse");
  }
  return flags;
}

// ── Main suppression function ─────────────────────────────────────────────────

export function applySuppressionLayer(
  rawScores: RawScores,
  verse: string,
  lineCount: number
): SuppressionResult {
  const scores = { ...rawScores };
  const flags: string[] = [];

  // ── 1. Repetition suppression ────────────────────────────────────────────
  const rep = detectRepetition(verse);
  if (rep.isHookPattern) {
    // Hard cap: hook/chorus patterns get capped at HARD_CAP_FILLER
    scores.flow         = Math.min(scores.flow, HARD_CAP_FILLER);
    scores.storytelling = Math.min(scores.storytelling, HARD_CAP_FILLER);
    scores.punchlines   = Math.min(scores.punchlines, HARD_CAP_FILLER);
    flags.push("hook_pattern_detected");
  } else if (rep.ratio > 0.35) {
    // High repetition (not hook) — cap at HARD_CAP_WEAK
    scores.flow         = Math.min(scores.flow, HARD_CAP_WEAK);
    scores.rhyming      = Math.min(scores.rhyming, HARD_CAP_WEAK);
    flags.push("high_repetition_ratio");
  }

  // ── 2. Filler suppression ────────────────────────────────────────────────
  const filler = fillerRatio(verse);
  if (filler > 0.45) {
    // >45% filler words = very low information density
    scores.wordplay     = Math.min(scores.wordplay, HARD_CAP_FILLER + 5);
    scores.storytelling = Math.min(scores.storytelling, HARD_CAP_FILLER + 5);
    scores.punchlines   = Math.min(scores.punchlines, HARD_CAP_FILLER + 5);
    flags.push(`high_filler_ratio:${(filler * 100).toFixed(0)}pct`);
  } else if (filler > 0.30) {
    // Moderate filler — light suppression on wordplay/storytelling only
    scores.wordplay     = Math.min(scores.wordplay, HARD_CAP_WEAK + 5);
    scores.storytelling = Math.min(scores.storytelling, HARD_CAP_WEAK + 5);
    flags.push(`moderate_filler_ratio:${(filler * 100).toFixed(0)}pct`);
  }

  // ── 3. Shallow tag stack suppression ────────────────────────────────────
  // Check each elite-scoring dimension for shallow evidence
  const dimensions: (keyof RawScores)[] = ["wordplay", "storytelling", "punchlines", "rhyming", "flow"];
  for (const dim of dimensions) {
    if (isShallowTagStack(scores[dim], lineCount, verse)) {
      scores[dim] = Math.min(scores[dim], HARD_CAP_WEAK + 3);
      flags.push(`shallow_tag_stack:${dim}`);
    }
  }

  // ── 4. Single-signal dominance cap ──────────────────────────────────────
  const { dominant, gap } = dominanceCheck(scores);
  if (dominant && gap > 35) {
    // Cap the dominant signal at HARD_CAP_WEAK if the gap is extreme
    scores[dominant as keyof RawScores] = Math.min(
      scores[dominant as keyof RawScores],
      HARD_CAP_WEAK + 5
    );
    flags.push(`single_signal_dominance:${dominant}:gap_${Math.round(gap)}`);
  }

  // ── 5. Short-verse credibility caps ─────────────────────────────────────
  const lengthFlags = lengthCredibilityFlag(lineCount, scores);
  for (const f of lengthFlags) {
    flags.push(f);
    if (f.includes("storytelling")) scores.storytelling = Math.min(scores.storytelling, lineCount < 4 ? 70 : 78);
    if (f.includes("flow")) scores.flow = Math.min(scores.flow, 70);
  }

  // ── 6. Enforce per-dimension minimums (never suppress below 20) ──────────
  // A verse can score low, but suppression must not artificially floor to 0
  for (const k of Object.keys(scores) as (keyof RawScores)[]) {
    scores[k] = clamp(Math.round(scores[k]));
    scores[k] = Math.max(scores[k], 20); // absolute floor
  }

  return {
    scores,
    flags,
    suppressed: flags.length > 0,
  };
}
