/**
 * scoreComparison.ts
 * Core RhymeMath scoring service.
 * All scoring logic lives here — never inside UI components.
 *
 * Weights (must sum to 1.0):
 *   Flow:                 30%
 *   Wordplay:             20%
 *   Storytelling:         20%
 *   Rhyming:              15%
 *   Punchlines:           15%
 */

import { v4 as uuidv4 } from "uuid";
import { annotateVerse } from "./annotateVerse.js";
import {
  getLines,
  verseSyllableCount,
  lineSyllableCounts,
  detectEndRhymes,
  detectInternalRhymes,
  detectRepeatedSounds,
  multisyllabicRhymes,
  longestRhymeChain,
  lineWordCounts,
  mean,
  variance,
  cadenceVariation,
  countWordplayIndicators,
  analyzeStorytelling,
  detectPunchlines,
  analyzeStructuralLyricism,
  clamp,
} from "./textAnalysis";

import type {
  RhymeMathResult,
  SoloAnalysisResult,
  ArtistResult,
  CategoryScore,
  MeasuredMetrics,
  JudgedMetrics,
  VerseAnalysis,
  ScoreBreakdown,
  CompareRequest,
} from "@shared/schema";

// ─── Weights ──────────────────────────────────────────────────────────────────
const DEFAULT_WEIGHTS = { flow: 0.30, rhyming: 0.22, wordplay: 0.20, storytelling: 0.16, punchlines: 0.12 };
// NOTE: WEIGHTS is now passed as a parameter to every function — no mutable module state

// ─── Measure a Single Verse ───────────────────────────────────────────────────

function measureVerse(verse: string): MeasuredMetrics {
  const lines = getLines(verse);
  const lineCount = lines.length;
  const syllCounts = lineSyllableCounts(lines);
  const wordCounts = lineWordCounts(lines);
  const avgLineLength = mean(wordCounts);
  const lineLengthVariance = variance(wordCounts);
  const { count: endRhymeCount } = detectEndRhymes(lines);
  const internalRhymes = detectInternalRhymes(lines);
  const repeatedSounds = detectRepeatedSounds(verse);
  const totalWords = wordCounts.reduce((s, n) => s + n, 0);

  return {
    rhymeDensity: totalWords > 0 ? (endRhymeCount + internalRhymes) / totalWords : 0,
    internalRhymes,
    endRhymes: endRhymeCount,
    repeatedSounds,
    lineLengthConsistency: Math.max(0, 100 - cadenceVariation(syllCounts)),
    syllableApproximation: verseSyllableCount(verse),
    verseStructure: lineCount <= 8 ? "short" : lineCount <= 16 ? "standard" : "extended",
    lineCount,
    avgLineLength,
    lineLengthVariance,
  };
}

// ─── Score Each Category ──────────────────────────────────────────────────────

// ─── Flow Engine ─────────────────────────────────────────────────────────────
// Five dimensions modeled after how rap scholars and producers measure flow:
// 1. Cadence pocket    — syllable count consistency across lines (the groove)
// 2. Percussive attack — density of hard consonants (T,K,P,D,B,G) = beat emphasis
// 3. Internal assonance — same vowel sounds repeating within/across lines = pocket lock
// 4. Phrase symmetry  — parallel grammatical structures (anaphora, epistrophe)
// 5. Multisyllabic rhyme chains — internal rhymes across 2+ syllables = bounce

// Hard consonant sounds that punch on the beat
const HARD_CONSONANTS = /(?:^|\s)[tdkpbgTDKPBG]/g;

// Approximate vowel phoneme groups for assonance detection
// Each group = words likely sharing a vowel sound
const VOWEL_PATTERNS: RegExp[] = [
  /(ight|ite|ive|ine|ire|ile)/gi,
  /(ow|oa|old|one|oke|ose|ole)/gi,
  /(oo|ew|oom|oon|ool|oot)/gi,
  /(ay|ake|ain|ame|ace|ane|ate)/gi,
  /(ee|ea|een|eel|eam|eak)/gi,
  /(us|ust|un|ug|ump|unk)/gi,
  /(ack|ap|at|an|ad|am)/gi,
];

// Detect multisyllabic rhyme chains: internal vowel-family clusters across all words
// JID-style: internal chains (ique/ki/yayo, soliloquies/cinema/cinnamon) not just line endings
function multisyllabicRhymeChains(lines: string[]): number {
  // Filter stop words — common words that repeat but aren't rhyme chains
  const STOP_WORDS = new Set(['that','this','with','them','they','some','have','from','been','when','what','your','their','just','like','will','would','could','should','about','over','then','than','into','more','also','here','there','where','come','came','make','made','take','took','said','know','think','back','down','going','doing','being','getting','having','putting','saying','looking','feeling','still','even','only','very','much','many','most','both','each','such','same','other','these','those','which','while','after','before','since','until','because','though','every','again','around','through','under','between','without','within','during']);

  const allWords = lines.join(" ").split(/\s+/)
    .map(w => w.replace(/[^a-zA-Z]/g, "").toLowerCase())
    .filter(w => w.length >= 5 && !STOP_WORDS.has(w)); // 5+ chars, no stop words

  // Group 1: standard ending clusters (last 4 chars, multisyllabic words)
  const endingMap: Record<string, number> = {};
  for (const w of allWords) {
    const e = w.slice(-4);
    if (e.length >= 4) endingMap[e] = (endingMap[e] ?? 0) + 1;
  }
  // Threshold 2+ — JID chains repeat across whole verse, not just triplets
  let chainCount = Object.values(endingMap).filter(c => c >= 2).length;

  // Group 2: vowel family rhyme clusters — catch internal rhymes like
  // ique/eek/eak, ayo/ado/aygo, ious/ious/ious, ema/ima/inna
  const VOWEL_FAMILIES: RegExp[] = [
    /(?:ique|eek|eak|ique|eke)/g,       // Dominique / ki / freak
    /(?:ayo|ado|aygo|ado)/g,            // yayo / Daygo
    /(?:ious|ious|ema|ima|inna|inna)/g, // soliloquies / cinema / cinnamon
    /(?:ated|aken|akin|akin)/g,         // tailor-made / fabricate
    /(?:eamin|eenin|eanin|inin)/g,      // schemin / fleein / beatin
    /(?:ackin|ickin|ickin|ickin)/g,     // stackin / kickin
  ];
  const fullText = lines.join(" ").toLowerCase();
  for (const fam of VOWEL_FAMILIES) {
    const hits = (fullText.match(fam) ?? []).length;
    if (hits >= 2) chainCount += 1;
  }

  return chainCount;
}

// Detect phrase symmetry: lines starting with same word(s) = anaphora
function phraseSymmetryScore(lines: string[]): number {
  if (lines.length < 2) return 0;

  // 1. Line-start anaphora: same first word across multiple lines
  const firstWords = lines.map(l => l.trim().toLowerCase().split(/\s+/)[0] ?? "");
  const wordMap: Record<string, number> = {};
  for (const w of firstWords) if (w.length > 1) wordMap[w] = (wordMap[w] ?? 0) + 1;
  const parallelCount = Object.values(wordMap).filter(c => c >= 2).length;

  // 2. Within-line repetition: "chain chain chain" or "word word" = deliberate scheme
  // This catches Kendrick's "chain chain chain, whip whip whip" pattern
  let withinLineReps = 0;
  for (const line of lines) {
    const words = line.toLowerCase().split(/[\s,]+/).filter(w => w.length > 2);
    const wMap: Record<string, number> = {};
    for (const w of words) wMap[w] = (wMap[w] ?? 0) + 1;
    if (Object.values(wMap).some(c => c >= 2)) withinLineReps++;
  }

  const total = parallelCount * 8 + withinLineReps * 3;
  return Math.min(total, 20); // max 20 pts
}

// Count internal assonance: vowel sound groups repeating per line
function internalAssonanceScore(lines: string[]): number {
  let totalHits = 0;
  for (const line of lines) {
    for (const pattern of VOWEL_PATTERNS) {
      const matches = line.match(pattern);
      if (matches && matches.length >= 2) totalHits += matches.length - 1;
    }
  }
  // Normalize: 1 hit per line = baseline, 3+ per line = elite
  const perLine = lines.length > 0 ? totalHits / lines.length : 0;
  return Math.min(perLine * 8, 20); // max 20 pts
}

// Percussive consonant density: hard-consonant words relative to total words
function percussiveAttackScore(verse: string, lines: string[]): number {
  const words = verse.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return 0;
  const hardHits = (verse.match(HARD_CONSONANTS) ?? []).length;
  const density = hardHits / words.length;
  // Adjusted: JID/melodic rappers sit at 28-35%, still deserve solid score
  if (density < 0.15) return 4;       // genuinely too soft
  if (density < 0.25) return 10;
  if (density < 0.35) return 15;      // JID range — melodic pocket, still punchy
  if (density <= 0.55) return 20;     // sweet spot — max 20 pts
  if (density <= 0.7) return 15;      // very percussive but readable
  return 8;                           // chaotic / choppy
}

// ── NEW SIGNAL: Rhyme density cross-wired into flow ─────────────────────────
// Dense internal rhyming IS flow evidence — JID/Kendrick pack rhymes per bar
function rhymeDensityFlowBonus(lines: string[], measured: MeasuredMetrics): number {
  const totalWords = lines.join(' ').split(/\s+/).filter(w => w.length > 0).length;
  if (totalWords === 0) return 0;
  // Cross-wire: use measured internal rhyme count already computed
  const internalDensity = totalWords > 0 ? measured.internalRhymes / totalWords : 0;
  // 0.10 = light, 0.20 = solid, 0.30+ = elite internal rhymer
  if (internalDensity >= 0.30) return 12;
  if (internalDensity >= 0.20) return 8;
  if (internalDensity >= 0.12) return 4;
  return 0;
}

// ── NEW SIGNAL: Multisyllabic word ratio ─────────────────────────────────────
// High ratio of 3+ syllable words = technical density = flow signal
// JID: soliloquies, fabricate, indicted, Dominique, cinnamon, experience
function multisyllabicWordRatio(verse: string): number {
  const words = verse.toLowerCase().match(/[a-z']+/g) ?? [];
  if (words.length === 0) return 0;
  const multiSyllWords = words.filter(w => {
    const syls = (w.match(/[aeiouy]+/g) ?? []).length;
    return syls >= 3;
  }).length;
  const ratio = multiSyllWords / words.length;
  // 0.05 = baseline, 0.10 = solid, 0.15+ = elite technical density
  if (ratio >= 0.15) return 10;
  if (ratio >= 0.10) return 7;
  if (ratio >= 0.05) return 3;
  return 0;
}

// ── NEW SIGNAL: Rhythm pocket tightness ──────────────────────────────────────
// Measures how tightly bars cluster around a consistent syllable target.
// JID locks into 12-16 syl/bar with controlled bursts — that's pocket.
// Different from CV: rewards consistency within the groove, not just variation.
function rhythmPocketScore(syllCounts: number[]): number {
  if (syllCounts.length < 8) return 0; // Need enough bars to establish a pocket
  const cv = cadenceVariation(syllCounts);
  // Pocket requires SOME variation — pure monotone (CV < 8%) is NOT pocket, it's stiff
  if (cv < 8) return 0;
  const med = [...syllCounts].sort((a, b) => a - b)[Math.floor(syllCounts.length / 2)];
  // How many lines fall within ±4 syllables of the median (the pocket zone)
  const inPocket = syllCounts.filter(s => Math.abs(s - med) <= 4).length;
  const pocketRatio = inPocket / syllCounts.length;
  // 70%+ in pocket WITH variation = groove lock
  if (pocketRatio >= 0.75) return 10;
  if (pocketRatio >= 0.60) return 6;
  if (pocketRatio >= 0.45) return 3;
  return 0;
}

// ── NEW SIGNAL: Phonetic echo density ────────────────────────────────────────
// Near-repeat sounds within 3-4 words = rhythmic echo technique
// "feelin good feelin great", "freak it freak it", "I like to cheat I bought"
function phoneticEchoDensity(lines: string[]): number {
  let echoCount = 0;
  for (const line of lines) {
    const words = line.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length >= 3);
    for (let i = 0; i < words.length - 1; i++) {
      // Exact repeat within 3 words
      for (let j = i + 1; j <= Math.min(i + 3, words.length - 1); j++) {
        if (words[i] === words[j]) { echoCount += 2; break; }
        // Partial phonetic match: same first 3 chars (alliterative echo)
        if (words[i].slice(0, 3) === words[j].slice(0, 3) && words[i] !== words[j]) {
          echoCount += 1; break;
        }
        // Ending echo: last 3 chars match (rhyme echo within line)
        if (words[i].length >= 4 && words[j].length >= 4 &&
            words[i].slice(-3) === words[j].slice(-3)) {
          echoCount += 1; break;
        }
      }
    }
  }
  const perLine = lines.length > 0 ? echoCount / lines.length : 0;
  // 0.5/line = light, 1.5/line = solid, 3+/line = elite echo rapper
  if (perLine >= 3.0) return 10;
  if (perLine >= 1.5) return 7;
  if (perLine >= 0.5) return 3;
  return 0;
}

function scoreFlow(verse: string, measured: MeasuredMetrics): { score: number; evidence: string[] } {
  const lines = getLines(verse);
  if (lines.length === 0) return { score: 20, evidence: ["No lines to analyze"] };

  const syllCounts = lineSyllableCounts(lines);
  const cv = cadenceVariation(syllCounts);
  const avgSyll = mean(syllCounts);

  // ── Dimension 1: Cadence pocket (max 30 pts) ─────────────────────────────
  let cadenceScore = 0;
  if (cv < 5) cadenceScore = 6;
  else if (cv < 10) cadenceScore = 12;
  else if (cv <= 20) cadenceScore = 18 + (cv - 10) * (7 / 10);   // 18–25
  else if (cv <= 40) cadenceScore = 25 + (cv - 20) * (5 / 20);   // 25–30 sweet spot
  else if (cv <= 55) cadenceScore = 30 - (cv - 40) * (10 / 15);  // 30–20 getting choppy
  else cadenceScore = Math.max(6, 20 - (cv - 55) * 0.7);
  if (avgSyll >= 8 && avgSyll <= 20) cadenceScore = Math.min(cadenceScore + 3, 30);
  else if (avgSyll < 5) cadenceScore = Math.max(cadenceScore - 5, 0);

  // ── Dimension 2: Percussive attack (max 15 pts) ──────────────────────────
  const percussiveScore = Math.round(percussiveAttackScore(verse, lines) * 0.75);

  // ── Dimension 3: Internal assonance (max 15 pts) ─────────────────────────
  const assonanceScore = Math.round(internalAssonanceScore(lines) * 0.75);

  // ── Dimension 4: Phrase symmetry / anaphora (max 10 pts) ────────────────
  const symmetryScore = Math.round(phraseSymmetryScore(lines) * 0.5);

  // ── Dimension 5: Multisyllabic rhyme chains (max 10 pts) ────────────────
  const chains = multisyllabicRhymeChains(lines);
  const chainScore = Math.min(chains * 3, 10);

  // ── NEW Dimension 6: Rhyme density flow bonus (max 12 pts) ───────────────
  const rhymeDensityBonus = rhymeDensityFlowBonus(lines, measured);

  // ── NEW Dimension 7: Multisyllabic word ratio (max 10 pts) ───────────────
  const multiSyllScore = multisyllabicWordRatio(verse);

  // ── NEW Dimension 8: Rhythm pocket tightness (max 10 pts) ───────────────
  const pocketScore = rhythmPocketScore(syllCounts);

  // ── NEW Dimension 9: Phonetic echo density (max 10 pts) ─────────────────
  const echoScore = phoneticEchoDensity(lines);

  // ── Total ────────────────────────────────────────────────────────────────
  // Max theoretical = 30+15+15+10+10+12+10+10+10 = 122
  // A great verse realistically hits ~75-85 raw. Scale so 80 raw → ~88 score.
  // Formula: score = raw * (95/90) but cap at 95.
  // This means: 45 raw → 47, 65 raw → 68, 80 raw → 84, 90 raw → 95
  const raw = cadenceScore + percussiveScore + assonanceScore + symmetryScore +
              chainScore + rhymeDensityBonus + multiSyllScore + pocketScore + echoScore;
  const score = clamp(Math.round(raw * (95 / 90)));

  const evidence = [
    `${lines.length} lines · avg ${avgSyll.toFixed(1)} syl/line`,
    `Cadence: ${cadenceScore.toFixed(0)}/30 (CV ${cv.toFixed(1)}% — ${cv < 10 ? "monotone" : cv <= 40 ? "groove" : cv <= 55 ? "variable" : "choppy"})`,
    `Rhyme density bonus: ${rhymeDensityBonus}/12 · Pocket tightness: ${pocketScore}/10`,
    `Multisyllabic words: ${multiSyllScore}/10 · Phonetic echo: ${echoScore}/10`,
    `Assonance: ${assonanceScore.toFixed(0)}/15 · Chains: ${chainScore}/10 · Symmetry: ${symmetryScore}/10`,
  ];

  return { score, evidence };
}

function scoreRhyming(verse: string, measured: MeasuredMetrics): { score: number; evidence: string[] } {
  const lines = getLines(verse);
  const syllCounts = lineSyllableCounts(lines);
  const { count: endRhymes, pairs } = detectEndRhymes(lines);
  const internalRhymes = detectInternalRhymes(lines);
  const multiSyll = multisyllabicRhymes(lines);
  const chainLen = longestRhymeChain(lines);
  const totalWords = lineWordCounts(lines).reduce((s, n) => s + n, 0);
  const rhymeDensity = totalWords > 0 ? (endRhymes + internalRhymes) / totalWords : 0;

  // Base: end rhyme density (ideal ~0.15–0.3). Capped at 50 — density alone can't win.
  let base = Math.min(50, rhymeDensity * 180);
  // Internal rhyme bonus — capped hard. 151 internal rhymes ≠ 100. Elite is ~30+.
  const internalBonus = Math.min(20, internalRhymes * 0.6);
  // Multisyllabic bonus — up to 15 pts
  const multiBonus = Math.min(15, multiSyll * 5);
  // Chain bonus — up to 10 pts
  const chainBonus = Math.min(10, (chainLen - 1) * 3);
  // Repeated sounds — up to 8 pts
  const soundBonus = Math.min(8, measured.repeatedSounds * 0.5);
  // End rhyme quality — bonus for consistent end rhymes across lines
  const endRhymeBonus = Math.min(12, endRhymes * 1.2);

  // STRUCTURAL: polysyllabic rhyme pairs (presidents/represent, womb/tomb across lines)
  // These are the hardest rhymes to execute and signal elite technical command
  const structural = analyzeStructuralLyricism(verse, lines);
  const polyRhymeBonus = Math.min(15, structural.polysyllabicRhymePairs * 6); // each pair = 6pts, max 15
  // Within-line rhyme architecture bonus (already measured structurally)
  const internalArchBonus = Math.min(12, structural.internalRhymePairs * 0.8);

  // Scale so true elite (100) requires exceptional across ALL dimensions
  const raw = base + internalBonus + multiBonus + chainBonus + soundBonus + endRhymeBonus + polyRhymeBonus + internalArchBonus;
  // Max possible ≈ 50+20+15+10+8+12+15+12 = 142 → scale to 95 ceiling
  const score = clamp(Math.round((raw / 142) * 95 * 10) / 10);

  const evidence = [
    `${endRhymes} end rhyme${endRhymes !== 1 ? "s" : ""} detected across ${lines.length} lines`,
    `~${internalRhymes} internal rhyme candidate${internalRhymes !== 1 ? "s" : ""}`,
    `${multiSyll} multisyllabic rhyme pattern${multiSyll !== 1 ? "s" : ""} detected`,
    `Polysyllabic rhyme pairs: ${structural.polysyllabicRhymePairs} (3+ syllable words rhyming)`,
    `Within-line rhyme pairs: ${structural.internalRhymePairs} (e.g. womb/tomb, wire/desire)`,
    `Longest rhyme chain: ${chainLen} consecutive line${chainLen !== 1 ? "s" : ""}`,
    `Estimated rhyme density: ${(rhymeDensity * 100).toFixed(1)}%`,
    `Repeated sound count: ${measured.repeatedSounds}`,
  ];

  return { score, evidence };
}

function scoreWordplay(verse: string): { score: number; evidence: string[] } {
  const indicators = countWordplayIndicators(verse);
  const lines = getLines(verse);
  const lineCount = lines.length;

  // --- Component 1: simile/metaphor/doubles/callbacks (rhetorical foundation) ---
  const density = indicators.total / Math.max(1, lineCount);
  const rhetoricalBase = clamp(density * 15);
  const variety = [
    indicators.similes > 0,
    indicators.metaphors > 0,
    indicators.doublesCount > 0,
    indicators.callbacks > 0,
  ].filter(Boolean).length;
  const varietyBonus = variety * 5;

  // --- Component 2: assonance chains (sound-level wordplay) ---
  const assonanceScore = internalAssonanceScore(lines); // 0-20

  // --- Component 3: anaphora / phrase symmetry ---
  const anaphora = phraseSymmetryScore(lines); // 0-20

  // --- Component 4: alliteration density ---
  const allitWords = (verse.match(/\b([bcdfghjklmnpqrstvwxyz])\w*\s+\1\w*/gi) ?? []).length;
  const allitScore = Math.min(allitWords * 4, 12);

  // --- Component 5: conceptual density ---
  // Dense concept words (beast, womb, tomb, wisdom, ritual, presume) = layered meaning
  // Non-linear scale: density >= 8 gets an elite multiplier (Nas/Rakim/Mos Def territory)
  const rawConcept = indicators.conceptualDensity;
  const conceptScore = rawConcept >= 10
    ? clamp(30 + (rawConcept - 10) * 3)   // 10 hits = 30, 15 hits = 45, 20 hits = 60
    : clamp(rawConcept * 2.5);             // < 10 hits: 1pt = 2.5, 8 hits = 20

  // --- Component 6: cultural/geographic specificity ---
  // Real places, institutions, figures = grounded, non-generic worldplay
  const culturalScore = clamp(Math.min(indicators.culturalSpecificity, 8) * 3.0); // max 24

  // --- Component 7: contrast / juxtaposition ---
  // "womb to tomb", "beast rise like yeast" = duality IS wordplay at elite level
  const contrastScore = clamp(indicators.contrastScore * 15); // max ~30

  // --- Component 8: philosophical compression ---
  // "from X to Y" constructions, extended similes = dense packing of meaning
  const compressionScore = clamp(indicators.compressionScore * 7); // max ~28

  // --- Component 9 (STRUCTURAL): internal rhyme architecture ---
  // Measures craft the keyword scanner can't see:
  // - internalRhymePairs: words within the same line that rhyme (womb/tomb, wire/desire/conspire)
  // - crossLineEchoClusters: same sound recurring 3+ times across the whole verse (intentional architecture)
  // - complexEchoLines: single lines with 2+ distinct rhyme groups (double-cluster technique)
  const structural = analyzeStructuralLyricism(verse, lines);
  const internalRhymeScore = clamp(structural.internalRhymePairs * 3.0); // 16 pairs = 48pts — core Nas-style signal
  const crossEchoScore = clamp(structural.crossLineEchoClusters * 5);    // 6 clusters = 30pts
  const complexLineScore = clamp(structural.complexEchoLines * 8);        // each complex line = 8pts
  // Polysyllabic end-rhyme chain: JID/Kendrick-style technical end-rhyme complexity
  // "rhyme well/swell/excel/defy hell/die well", "focus/psychosis/corpus/Rigamortis"
  // These are wordplay achievements even though they're end rhymes, not internal
  const polyEndRhymeScore = clamp(structural.polysyllabicRhymePairs * 4); // 15 pairs = 60pts

  // Weighted combine — structural signals anchor the score for technically elite verses
  // Calibrated: Verbal Intercourse (conceptDensity=15, internalRhyme=16) → WP≈71
  //             Rigamortus (polyEndRhyme=15, crossEcho=8, compression=6) → WP≈58
  const raw =
    rhetoricalBase * 0.04 +
    varietyBonus * 0.60 +
    assonanceScore * 0.05 +
    anaphora * 0.04 +
    allitScore * 0.02 +
    conceptScore * 0.30 +          // conceptual density — Nas/Rakim dominant signal
    culturalScore * 0.06 +         // named specificity
    contrastScore * 0.05 +         // duality
    compressionScore * 0.07 +      // ↑ compression — JID signal (6 hits)
    internalRhymeScore * 0.26 +    // within-line rhyme architecture (Nas primary)
    crossEchoScore * 0.14 +        // ↑ cross-verse sound design (JID has 8 clusters vs Verbal's 6)
    complexLineScore * 0.04 +      // double-cluster lines
    polyEndRhymeScore * 0.11 +     // ↑ polysyllabic end-rhyme chain (JID: 15 pairs = 60pts)
    Math.min(25, indicators.total * 1.5);  // cap at 25 (Verbal=23 indicators)

  const score = clamp(Math.round(raw));

  const evidence = [
    `~${indicators.similes} simile/comparison indicator${indicators.similes !== 1 ? "s" : ""} detected`,
    `~${indicators.metaphors} metaphor structure${indicators.metaphors !== 1 ? "s" : ""} detected`,
    `~${indicators.doublesCount} double-meaning / layered language term${indicators.doublesCount !== 1 ? "s" : ""} detected`,
    `Conceptual density: ${indicators.conceptualDensity} abstract/philosophical concept word${indicators.conceptualDensity !== 1 ? "s" : ""} detected`,
    `Cultural specificity: ${indicators.culturalSpecificity} named reference${indicators.culturalSpecificity !== 1 ? "s" : ""} (places, people, institutions)`,
    `Contrast / juxtaposition: ${indicators.contrastScore} duality construct${indicators.contrastScore !== 1 ? "s" : ""} detected`,
    `Philosophical compression: ${indicators.compressionScore} dense construction${indicators.compressionScore !== 1 ? "s" : ""} detected`,
    `Within-line rhyme pairs: ${structural.internalRhymePairs} (e.g. womb/tomb, wire/desire/conspire)`,
    `Cross-verse sound clusters: ${structural.crossLineEchoClusters} distinct sounds recurring 3+ times`,
    `Complex echo lines: ${structural.complexEchoLines} (lines with 2+ internal rhyme groups)`,
    `Assonance: ${assonanceScore.toFixed(1)}/20 · Anaphora: ${anaphora.toFixed(1)}/20 · Alliteration: ${allitScore.toFixed(1)}/12`,
    `Device variety: ${variety} of 4 rhetorical categories represented`,
  ];

  return { score, evidence };
}

function scoreStorytelling(verse: string): { score: number; evidence: string[] } {
  const lines = getLines(verse);
  const analysis = analyzeStorytelling(verse, lines);

  // Transitions show progression (narrative glue)
  const transitionScore = clamp(analysis.transitions * 5);
  // Pronoun consistency shows POV clarity (first person locked in = coherent)
  const pronounScore = clamp(analysis.pronounConsistency * 20);
  // Emotional arc — feeling words = emotional investment
  const emotionalScore = clamp(analysis.emotionalArc * 3);
  // Verse length (longer verse = more room for story)
  const lengthScore = analysis.lineCount >= 12 ? 15 : analysis.lineCount >= 8 ? 10 : 5;

  // NEW: Scene detail — specific concrete nouns ground the verse in a real world
  // Nas: rikers, bus, weed, gun, beast, cycle. Each one paints a picture.
  const sceneScore = clamp(Math.min(analysis.sceneDetail, 14) * 3.5); // ↑ 12→14 cap, 2.5→3.5 multiplier

  // NEW: Thematic anchoring — ritual/presume/legendary = intentional thematic structure
  // Regex now captures Nas-style recurrence: ritual×2, womb/tomb, beast/yeast/east
  const thematicScore = clamp(Math.min(analysis.thematicAnchoring, 10) * 3); // ↑ cap 6→10 (Verbal has 17 hits)

  // NEW: Character presence — other people exist = world is populated
  const characterScore = clamp(Math.min(analysis.characterPresence, 5) * 2); // max 10

  // STRUCTURAL: polysyllabic word density as deliberate diction signal
  // A rapper who chooses "nonchalant", "ritual", "unpredictable", "presidents"
  // is operating at a different cognitive level — that IS storytelling craft.
  const structural = analyzeStructuralLyricism(verse, lines);
  const polyDictScore = clamp(Math.min(structural.polysyllabicWordCount, 15) * 3.0); // ↑ 2.0→3.0, max 45

  // Cross-line sound architecture also signals intentional narrative construction:
  // a verse where the same sounds echo across lines has been architecturally designed
  const soundArchScore = clamp(structural.crossLineEchoClusters * 3); // ↓ 4→3 (less dominant in storytelling)

  // ── Narrative Cohesion Multiplier ──────────────────────────────────────────
  // Stream-of-consciousness verses (Cappadonna/Winter Warz, Busta/early work)
  // have vivid imagery but NO sustained arc — they topic-hop every 2-3 lines.
  // Narrative verses (Verbal Intercourse, Stan, I Used to Love H.E.R., Dear Mama)
  // maintain a single subject/situation across the whole verse.
  //
  // narrativeCohesion ranges 0→1. We use it to scale scene + thematic scores:
  // a verse that scene-hops deserves scene credit in WORDPLAY, not storytelling.
  // Uncohesive verses still get a small floor so abstract-philosophy verses
  // (Rakim-style) aren't killed by this — pure abstraction has low pivot count.
  const cohesion = analysis.narrativeCohesion ?? 0.5; // 0=stream-of-consc, 1=tight arc
  // Scale the imagery-based signals: full credit only when cohesion is high
  // Floor at 0.4 so abstract/philosophical verses (low named-ref density) aren't penalized
  const cohesionScale = Math.max(0.4, cohesion);

  // Calibrated so Nas/Verbal Intercourse (scene=11, thematic=10+, polyDict=13) → Story≈62
  // Winter Warz (scene=12, thematic=7, cohesion≈0.1) → Story≈48-52 (stream-of-consciousness)
  const raw =
    transitionScore * 0.07 +
    pronounScore * 0.07 +
    emotionalScore * 0.11 +
    lengthScore * 0.05 +
    (sceneScore * cohesionScale) * 0.27 +   // imagery only earns storytelling credit when coherent
    (thematicScore * cohesionScale) * 0.20 + // thematic anchoring gated by arc cohesion
    characterScore * 0.07 +
    polyDictScore * 0.12 +
    soundArchScore * 0.05 +
    32;                                      // base floor

  const score = clamp(Math.round(raw));

  const pivotPct = Math.round((analysis.pivotRatio ?? 0) * 100);
  const cohesionLabel = cohesion >= 0.75 ? "tight narrative arc"
    : cohesion >= 0.45 ? "moderate arc"
    : "stream-of-consciousness (high topic-pivot rate)";

  const evidence = [
    `${analysis.transitions} narrative transition word${analysis.transitions !== 1 ? "s" : ""} detected`,
    `Pronoun / POV consistency: ${(analysis.pronounConsistency * 100).toFixed(0)}%`,
    `${analysis.emotionalArc} emotional arc indicator${analysis.emotionalArc !== 1 ? "s" : ""} detected`,
    `Scene detail: ${analysis.sceneDetail} concrete image${analysis.sceneDetail !== 1 ? "s" : ""} (places, objects, actions)`,
    `Thematic anchoring: ${analysis.thematicAnchoring} recurring theme marker${analysis.thematicAnchoring !== 1 ? "s" : ""}`,
    `Narrative cohesion: ${cohesionLabel} (${pivotPct}% of lines introduce a new reference pivot)`,
    `Character presence: ${analysis.characterPresence} reference${analysis.characterPresence !== 1 ? "s" : ""} to other people/entities`,
    `Deliberate diction: ${structural.polysyllabicWordCount} polysyllabic word${structural.polysyllabicWordCount !== 1 ? "s" : ""} (3+ syllables)`,
    `Sound architecture: ${structural.crossLineEchoClusters} recurring sound cluster${structural.crossLineEchoClusters !== 1 ? "s" : ""} across verse`,
    `Verse length: ${analysis.lineCount} lines`,
  ];

  return { score, evidence };
}

function scorePunchlines(verse: string): { score: number; evidence: string[] } {
  const lines = getLines(verse);
  const syllCounts = lineSyllableCounts(lines);
  const { count, density, setupPayoffPairs, contrastPunches, assertionPunches } = detectPunchlines(lines, syllCounts);
  const wordplay = countWordplayIndicators(verse);
  const structural = analyzeStructuralLyricism(verse, lines);

  // Classic setup/payoff structure (long line → short punchy landing)
  const structureScore = clamp(setupPayoffPairs * 12);
  // Wordplay contribution — punchlines live and die by layered language
  const wordplayContrib = clamp(wordplay.total * 2.5);
  // Contrast punches — "but", "yet", "still", "nah" = pivot = reveal
  const contrastBonus = clamp(Math.min(contrastPunches, 6) * 4);
  // Assertion punches — "I am", "I ain't" = declarative power
  const assertionBonus = clamp(Math.min(assertionPunches, 5) * 3);
  // Conceptual density — dense bars hit harder as punchlines
  const conceptBonus = clamp(Math.min(wordplay.conceptualDensity, 6) * 2);

  // STRUCTURAL: within-line rhyme as punchline delivery mechanism
  // "wire/desire/conspire", "womb/tomb", "beast/yeast/east" = the rhyme architecture
  // IS the punchline in this style of lyricism. These lines land because of sound.
  const soundPunchScore = clamp(structural.internalRhymePairs * 4.0);  // ↑ 3→4.0 per pair: 16 pairs = 64pts
  // Cross-line echo as callback punchline: a sound that recurs = intentional payoff
  const echoPayoffScore = clamp(structural.crossLineEchoClusters * 4); // 6 clusters = 24pts
  // Polysyllabic rhyme pairs as the ultimate punchline tech
  const polyPunchScore = clamp(structural.polysyllabicRhymePairs * 8); // each = 8pts

  // Calibrated so Verbal Intercourse (16 internalRhymePairs, conceptDensity=15) → Punch≈69
  // density capped at 0.7 so chorus-heavy verses don't inflate via repetition alone
  const score = clamp(
    structureScore * 0.07 +
    clamp(Math.min(density, 0.7) * 50) * 0.06 +  // ↓ density capped; less weight
    wordplayContrib * 0.09 +
    Math.min(contrastBonus, 16) * 0.04 +          // ↓ contrast capped at 4 punches * 4pts
    assertionBonus * 0.04 +
    conceptBonus * 0.12 +          // ↑ dense bars = dense punchlines
    soundPunchScore * 0.28 +       // within-line rhyme-as-punchline (Nas-style)
    echoPayoffScore * 0.11 +       // cross-line callback payoffs
    polyPunchScore * 0.12 +        // ↑ polysyllabic end-rhyme pairs = hardest punch (JID: 15 pairs)
    36                             // base floor
  );

  const evidence = [
    `~${setupPayoffPairs} setup/payoff structural pattern${setupPayoffPairs !== 1 ? "s" : ""} detected`,
    `Punch density: ${(density * 100).toFixed(0)}% of lines contain punchline structure`,
    `Within-line rhyme punches: ${structural.internalRhymePairs} (rhyme architecture as delivery)`,
    `Cross-verse echo payoffs: ${structural.crossLineEchoClusters} recurring sounds (callback punchlines)`,
    `Contrast/pivot lines: ${contrastPunches} | Assertion punches: ${assertionPunches}`,
    `Conceptual density: ${wordplay.conceptualDensity} dense bars`,
    `Estimated punchline count: ~${count}`,
  ];

  return { score, evidence };
}

// ─── Build Full Analysis ──────────────────────────────────────────────────────

function analyzeVerse(artistName: string, songName: string, verse: string, weights: typeof DEFAULT_WEIGHTS): ArtistResult {
  const measured = measureVerse(verse);
  const lines = getLines(verse);
  const syllCounts = lineSyllableCounts(lines);
  const wordplay = countWordplayIndicators(verse);
  const storytelling = analyzeStorytelling(verse, lines);
  const punchlines = detectPunchlines(lines, syllCounts);

  const judged: JudgedMetrics = {
    flowQuality: scoreFlow(verse, measured).score,
    wordplay: scoreWordplay(verse).score,
    storytelling: scoreStorytelling(verse).score,
    punchlines: scorePunchlines(verse).score,
    originality: clamp(wordplay.total * 4 + measured.internalRhymes * 3),
    setupPayoff: clamp(punchlines.setupPayoffPairs * 15 + 25),
    thematicProgression: clamp(storytelling.transitions * 7 + 30),
  };

  const flowResult = scoreFlow(verse, measured);
  const rhymeResult = scoreRhyming(verse, measured);
  const wordplayResult = scoreWordplay(verse);
  const storyResult = scoreStorytelling(verse);
  const punchResult = scorePunchlines(verse);

  const scores: ScoreBreakdown = {
    flow: flowResult.score,
    wordplay: wordplayResult.score,
    storytelling: storyResult.score,
    rhyming: rhymeResult.score,
    punchlines: punchResult.score,
    overall:
      flowResult.score * weights.flow +
      wordplayResult.score * weights.wordplay +
      storyResult.score * weights.storytelling +
      rhymeResult.score * weights.rhyming +
      punchResult.score * weights.punchlines,
  };

  return {
    artistName,
    songName,
    verse,
    scores,
    analysis: { measured, judged },
  };
}

// ─── Build Category Score Objects ─────────────────────────────────────────────

function buildCategories(
  verseA: string,
  verseB: string,
  resultA: ArtistResult,
  resultB: ArtistResult,
  weights: typeof DEFAULT_WEIGHTS
): CategoryScore[] {
  const linesA = getLines(verseA);
  const linesB = getLines(verseB);
  const measuredA = resultA.analysis.measured;
  const measuredB = resultB.analysis.measured;

  const flowA = scoreFlow(verseA, measuredA);
  const flowB = scoreFlow(verseB, measuredB);

  const rhymeA = scoreRhyming(verseA, measuredA);
  const rhymeB = scoreRhyming(verseB, measuredB);

  const wpA = scoreWordplay(verseA);
  const wpB = scoreWordplay(verseB);

  const stA = scoreStorytelling(verseA);
  const stB = scoreStorytelling(verseB);

  const plA = scorePunchlines(verseA);
  const plB = scorePunchlines(verseB);

  const diff = (a: number, b: number) => {
    if (Math.abs(a - b) < 3) return "Very close";
    return a > b ? `${resultA.artistName} edges ahead` : `${resultB.artistName} edges ahead`;
  };

  return [
    {
      name: "Flow",
      scoreA: flowA.score,
      scoreB: flowB.score,
      weight: weights.flow,
      evidence: { artistA: flowA.evidence, artistB: flowB.evidence },
      reasoning: diff(flowA.score, flowB.score),
    },
    {
      name: "Wordplay",
      scoreA: wpA.score,
      scoreB: wpB.score,
      weight: weights.wordplay,
      evidence: { artistA: wpA.evidence, artistB: wpB.evidence },
      reasoning: diff(wpA.score, wpB.score),
    },
    {
      name: "Storytelling",
      scoreA: stA.score,
      scoreB: stB.score,
      weight: weights.storytelling,
      evidence: { artistA: stA.evidence, artistB: stB.evidence },
      reasoning: diff(stA.score, stB.score),
    },
    {
      name: "Rhyming",
      scoreA: rhymeA.score,
      scoreB: rhymeB.score,
      weight: weights.rhyming,
      evidence: { artistA: rhymeA.evidence, artistB: rhymeB.evidence },
      reasoning: diff(rhymeA.score, rhymeB.score),
    },
    {
      name: "Punchlines",
      scoreA: plA.score,
      scoreB: plB.score,
      weight: weights.punchlines,
      evidence: { artistA: plA.evidence, artistB: plB.evidence },
      reasoning: diff(plA.score, plB.score),
    },
  ];
}

// ─── Generate Explanation ────────────────────────────────────────────────────

function buildExplanation(
  result: Pick<RhymeMathResult, "artistA" | "artistB" | "winner" | "winnerName" | "confidence" | "categories">
): { explanation: string; whyTheyWon: string } {
  const { artistA, artistB, winner, winnerName, confidence, categories } = result;
  const diff = Math.abs(artistA.scores.overall - artistB.scores.overall);
  const margin = diff < 3 ? "razor-thin margin" : diff < 8 ? "narrow margin" : diff < 15 ? "clear margin" : "decisive margin";

  const loserName = winner === "A" ? artistB.artistName : artistA.artistName;

  const bestCatWinner = categories.reduce((best, c) => {
    const scoreW = winner === "A" ? c.scoreA : c.scoreB;
    const bestScore = winner === "A" ? best.scoreA : best.scoreB;
    return scoreW > bestScore ? c : best;
  });

  const explanation =
    winner === "TIE"
      ? `RhymeMath scored this matchup as a TIE — ${artistA.artistName} and ${artistB.artistName} were virtually inseparable across all five categories. Both verses demonstrated comparable technical craft and creative execution.`
      : `${winnerName} takes this matchup by a ${margin} — ${artistA.scores.overall.toFixed(1)} vs ${artistB.scores.overall.toFixed(1)}. RhymeMath confidence: ${confidence.toFixed(0)}%.`;

  const whyTheyWon =
    winner === "TIE"
      ? `Both artists matched each other step-for-step. No single verse dominated enough to declare a clear winner.`
      : `${winnerName} led in ${bestCatWinner.name} (${winner === "A" ? bestCatWinner.scoreA.toFixed(1) : bestCatWinner.scoreB.toFixed(1)} vs ${winner === "A" ? bestCatWinner.scoreB.toFixed(1) : bestCatWinner.scoreA.toFixed(1)}) — the category that put them over the top. While ${loserName} showed strength, ${winnerName}'s advantage in the weighted categories was decisive.`;

  return { explanation, whyTheyWon };
}

// ─── Main Export: scoreComparison() ──────────────────────────────────────────

export function scoreComparison(req: CompareRequest & { weights?: { flow: number; wordplay: number; storytelling: number; rhyming: number; punchlines: number } }): RhymeMathResult {
  const resultId = uuidv4();

  // Resolve weights — each call gets its own immutable weights object (no module-level mutation)
  let activeWeights: typeof DEFAULT_WEIGHTS;
  if (req.weights) {
    const raw = req.weights;
    const total = raw.flow + raw.wordplay + raw.storytelling + raw.rhyming + raw.punchlines;
    const safeTotal = total > 0 ? total : 100;
    activeWeights = {
      flow: raw.flow / safeTotal,
      wordplay: raw.wordplay / safeTotal,
      storytelling: raw.storytelling / safeTotal,
      rhyming: raw.rhyming / safeTotal,
      punchlines: raw.punchlines / safeTotal,
    };
  } else {
    activeWeights = DEFAULT_WEIGHTS;
  }

  const resultA = analyzeVerse(req.artistA, req.songA, req.verseA, activeWeights);
  const resultB = analyzeVerse(req.artistB, req.songB, req.verseB, activeWeights);

  const categories = buildCategories(req.verseA, req.verseB, resultA, resultB, activeWeights);

  const scoreDiff = Math.abs(resultA.scores.overall - resultB.scores.overall);

  let winner: "A" | "B" | "TIE";
  let winnerName: string;

  if (scoreDiff < 1.5) {
    winner = "TIE";
    winnerName = "TIE";
  } else if (resultA.scores.overall > resultB.scores.overall) {
    winner = "A";
    winnerName = req.artistA;
  } else {
    winner = "B";
    winnerName = req.artistB;
  }

  // Confidence: higher diff = more confident; max 95 (we never claim perfect)
  const confidence = clamp(50 + scoreDiff * 3);

  const partial = { artistA: resultA, artistB: resultB, winner, winnerName, confidence, categories };
  const { explanation, whyTheyWon } = buildExplanation(partial);

  // Annotate both verses for the visual breakdown on the results page
  const annotationA = annotateVerse(req.verseA);
  const annotationB = annotateVerse(req.verseB);

  return {
    resultId,
    artistA: resultA,
    artistB: resultB,
    winner,
    winnerName,
    confidence,
    categories,
    explanation,
    whyTheyWon,
    scoreDiff,
    annotationA,
    annotationB,
  };
}

// ─── Solo Analysis: analyzeVerseSolo() ───────────────────────────────────────
// Scores a single verse with full breakdown. No winner declared.

export function analyzeVerseSolo(req: {
  artistName: string;
  songName: string;
  verseLabel?: string;
  verse: string;
  weights?: { flow: number; wordplay: number; storytelling: number; rhyming: number; punchlines: number };
}): SoloAnalysisResult {
  const resultId = uuidv4();

  let activeWeights: typeof DEFAULT_WEIGHTS;
  if (req.weights) {
    const raw = req.weights;
    const total = raw.flow + raw.wordplay + raw.storytelling + raw.rhyming + raw.punchlines;
    const safeTotal = total > 0 ? total : 100;
    activeWeights = {
      flow: raw.flow / safeTotal,
      wordplay: raw.wordplay / safeTotal,
      storytelling: raw.storytelling / safeTotal,
      rhyming: raw.rhyming / safeTotal,
      punchlines: raw.punchlines / safeTotal,
    };
  } else {
    activeWeights = DEFAULT_WEIGHTS;
  }

  const result = analyzeVerse(req.artistName, req.songName, req.verse, activeWeights);
  const annotation = annotateVerse(req.verse);

  // Build solo categories (no opponent — scores shown as absolutes)
  const categories: CategoryScore[] = [
    {
      name: "Flow",
      scoreA: result.scores.flow,
      scoreB: 0,
      weight: activeWeights.flow,
      evidence: { artistA: [], artistB: [] },
      reasoning: `Flow scored ${result.scores.flow.toFixed(1)}/100 based on cadence consistency, percussive attack, internal assonance, phrase symmetry, and multisyllabic chains.`,
    },
    {
      name: "Wordplay",
      scoreA: result.scores.wordplay,
      scoreB: 0,
      weight: activeWeights.wordplay,
      evidence: { artistA: [], artistB: [] },
      reasoning: `Wordplay scored ${result.scores.wordplay.toFixed(1)}/100 based on metaphors, similes, double meanings, and layered language detected in the verse.`,
    },
    {
      name: "Storytelling",
      scoreA: result.scores.storytelling,
      scoreB: 0,
      weight: activeWeights.storytelling,
      evidence: { artistA: [], artistB: [] },
      reasoning: `Storytelling scored ${result.scores.storytelling.toFixed(1)}/100 based on narrative arc, thematic coherence, and emotional progression.`,
    },
    {
      name: "Rhyming",
      scoreA: result.scores.rhyming,
      scoreB: 0,
      weight: activeWeights.rhyming,
      evidence: { artistA: [], artistB: [] },
      reasoning: `Rhyming scored ${result.scores.rhyming.toFixed(1)}/100 — end rhymes: ${result.analysis.measured.endRhymes}, internal rhymes: ${result.analysis.measured.internalRhymes}, rhyme density: ${(result.analysis.measured.rhymeDensity * 100).toFixed(1)}%.`,
    },
    {
      name: "Punchlines",
      scoreA: result.scores.punchlines,
      scoreB: 0,
      weight: activeWeights.punchlines,
      evidence: { artistA: [], artistB: [] },
      reasoning: `Punchlines scored ${result.scores.punchlines.toFixed(1)}/100 based on setup/payoff density, contrast, and surprise.`,
    },
  ];

  const overall = result.scores.overall;
  const grade =
    overall >= 90 ? "all-time elite" :
    overall >= 80 ? "exceptional" :
    overall >= 70 ? "strong" :
    overall >= 60 ? "solid" :
    overall >= 50 ? "average" : "below average";

  const explanation = `RhymeMath scores ${req.artistName}'s verse on "${req.songName}" at ${overall.toFixed(1)}/100 — ${grade}. ` +
    `Flow: ${result.scores.flow.toFixed(1)} | Wordplay: ${result.scores.wordplay.toFixed(1)} | ` +
    `Storytelling: ${result.scores.storytelling.toFixed(1)} | Rhyming: ${result.scores.rhyming.toFixed(1)} | ` +
    `Punchlines: ${result.scores.punchlines.toFixed(1)}.`;

  return {
    resultId,
    artistName: req.artistName,
    songName: req.songName,
    verseLabel: req.verseLabel,
    verse: req.verse,
    scores: result.scores,
    analysis: result.analysis,
    categories,
    explanation,
    scoringMode: req.weights ? "custom" : "standard",
    customWeights: req.weights ?? null,
    annotation,
  } as any;
}
