/**
 * textAnalysis.ts
 * Deterministic text-analysis utilities for the RhymeMath scoring engine.
 * All functions are pure — they take text, return numbers/strings.
 */

// ── Tokenization ─────────────────────────────────────────────────────────────

// Rough syllable count for a single word
function wordSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length === 0) return 0;
  const count = w.match(/[aeiouy]+/g)?.length ?? 1;
  return Math.max(1, count);
}

// Split a long blob of text into bar-sized chunks using syllable budgeting.
// Target: 8-16 syllables per bar (the natural rap bar range).
// Breaks at punctuation when available, otherwise at syllable budget.
function autoSplitBars(text: string): string[] {
  const TARGET_SYLLABLES = 12; // sweet spot — most rap bars land 8-14
  const MAX_SYLLABLES = 18;    // hard cap before forced break
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const bars: string[] = [];
  let current: string[] = [];
  let currentSyls = 0;

  for (const word of words) {
    const syls = wordSyllables(word);
    const hasPunct = /[,\.!?;]$/.test(word);

    current.push(word);
    currentSyls += syls;

    // Break after punctuation if we're past minimum bar length
    if (hasPunct && currentSyls >= 6) {
      bars.push(current.join(' '));
      current = [];
      currentSyls = 0;
      continue;
    }

    // Break at max syllable budget
    if (currentSyls >= MAX_SYLLABLES) {
      bars.push(current.join(' '));
      current = [];
      currentSyls = 0;
    }
  }

  if (current.length > 0) bars.push(current.join(' '));
  return bars.filter(b => b.trim().length > 0);
}

export function getLines(verse: string): string[] {
  const rawLines = verse
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const result: string[] = [];
  for (const line of rawLines) {
    // If line is short enough to be a real bar, keep it as-is
    if (line.length <= 120) {
      result.push(line);
      continue;
    }
    // Long line = single-block paste — auto-split into bars by syllable budget
    const bars = autoSplitBars(line);
    result.push(...bars);
  }
  return result;
}

export function getWords(text: string): string[] {
  return text.toLowerCase().match(/[a-z']+/g) ?? [];
}

// ── Syllable Approximation ───────────────────────────────────────────────────
// Simple heuristic: count vowel clusters per word.
export function syllableCount(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  const matches = w.match(/[aeiou]+/g);
  let count = matches ? matches.length : 1;
  // Trailing silent 'e'
  if (w.endsWith("e") && w.length > 2) count = Math.max(1, count - 1);
  return Math.max(1, count);
}

export function verseSyllableCount(verse: string): number {
  return getWords(verse).reduce((sum, w) => sum + syllableCount(w), 0);
}

export function lineSyllableCounts(lines: string[]): number[] {
  return lines.map((l) => getWords(l).reduce((s, w) => s + syllableCount(w), 0));
}

// ── Rhyme Detection ──────────────────────────────────────────────────────────

// Extract the final vowel+consonants cluster of a word (rough rhyme key)
// Pronunciation lookup for common irregular words
const RHYME_OVERRIDES: Record<string, string> = {
  through: "oo", do: "oo", to: "oo", two: "oo", who: "oo", you: "oo", true: "oo", blue: "oo", flew: "oo", crew: "oo", knew: "oo", new: "oo", few: "oo", dew: "oo", grew: "oo", brew: "oo", drew: "oo", threw: "oo", blew: "oo", chew: "oo", view: "oo",
  the: "uh", a: "uh",
  time: "ime", rhyme: "ime", crime: "ime", climb: "ime", dime: "ime", lime: "ime", prime: "ime", slime: "ime",
  come: "um", some: "um", from: "um", done: "un", none: "un", one: "un", son: "un", run: "un", gun: "un", sun: "un", fun: "un",
  love: "uv", above: "uv", dove: "uv", shove: "uv", of: "uv",
  live: "iv", give: "iv", have: "av",
  goes: "o", flow: "o", know: "o", show: "o", grow: "o", blow: "o", throw: "o", slow: "o", glow: "o", row: "o", so: "o", no: "o", go: "o", toe: "o", foe: "o", hoe: "o", woe: "o",
  night: "ite", light: "ite", right: "ite", fight: "ite", might: "ite", sight: "ite", tight: "ite", bright: "ite", flight: "ite", slight: "ite",
};

export function rhymeKey(word: string): string {
  const clean = word.toLowerCase().replace(/[^a-z]/g, "");
  if (clean.length === 0) return "";

  // Check override table first for irregular pronunciations
  if (RHYME_OVERRIDES[clean]) return RHYME_OVERRIDES[clean];

  let w = clean
    .replace(/ique$/, "eek")   // Dominique
    .replace(/que$/, "k")      // opaque
    .replace(/tion$/, "shun")  // nation
    .replace(/sion$/, "shun"); // vision

  // Strip silent trailing e ONLY when preceded by consonant(s) + vowel + consonant
  // time → tim, late → lat, ride → rid, but free → free (vowel before e, keep it)
  if (/[aeiou][^aeiou]e$/.test(w)) {
    w = w.slice(0, -1); // drop silent e: time→tim, grind keeps (no e)
  }

  // Now extract last vowel cluster + trailing consonants
  const match = w.match(/[aeiou]+[^aeiou]*$/);
  if (!match) return w.slice(-3);
  const tail = match[0];

  // Normalize slant rhyme equivalents
  return tail
    .replace(/ight$|ite$/, "ite")
    .replace(/eight$|ait$|ate$/, "ate")
    .replace(/eak$|eek$/, "eek")
    .replace(/eal$|eel$/, "eel")
    .replace(/eat$|eet$/, "eet")
    .replace(/im$|ym$/, "im")
    .replace(/ool$|ule$/, "ool")
    .replace(/ane$|ain$/, "ane")
    .replace(/ind$|in$/, "in")
    .replace(/ome$|oan$|one$/, "one")
    .replace(/ire$|ier$/, "ire")
    .replace(/ure$|oor$/, "ure")
    .replace(/eed$|ead$/, "eed")
    .replace(/ack$/, "ack")
    .replace(/ound$/, "ound")
    .replace(/ock$/, "ock")
    .replace(/oo$/, "oo")
    .replace(/oe$|o$/, "o");
}

export function lastWordOfLine(line: string): string {
  const words = getWords(line);
  return words[words.length - 1] ?? "";
}

export function detectEndRhymes(lines: string[]): { count: number; pairs: string[][] } {
  const endings = lines.map((l) => rhymeKey(lastWordOfLine(l)));
  const pairs: string[][] = [];
  const seen: Map<string, string[]> = new Map();
  endings.forEach((key, i) => {
    if (key.length < 2) return;
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key)!.push(lines[i]);
  });
  seen.forEach((group) => {
    if (group.length >= 2) pairs.push(group);
  });
  const count = [...seen.values()].filter((g) => g.length >= 2).reduce((s, g) => s + g.length, 0);
  return { count, pairs };
}

// Internal rhymes: same rhyme key appears more than once within a single line
// OR matching rhyme keys across lines that aren't end rhymes
export function detectInternalRhymes(lines: string[]): number {
  let count = 0;

  // Pass 1: within-line repeats (classic internal rhyme)
  for (const line of lines) {
    const words = getWords(line);
    const keys = words.map(rhymeKey).filter((k) => k.length >= 2);
    const freq: Map<string, number> = new Map();
    keys.forEach((k) => freq.set(k, (freq.get(k) ?? 0) + 1));
    freq.forEach((n) => { if (n >= 2) count += n - 1; });
  }

  // Pass 2: cross-line internal rhymes
  // A word in the middle of a line rhymes with a word in the middle of another line
  // This catches JID/Kendrick-style chain rhymes that span multiple bars
  const lineNonEndWords: string[][] = lines.map(line => {
    const words = getWords(line);
    // Exclude the last word (already caught by end rhyme detection)
    return words.slice(0, -1).filter(w => w.length >= 3);
  });

  const crossFreq: Map<string, number> = new Map();
  for (const words of lineNonEndWords) {
    const seen = new Set<string>(); // one count per line per key
    for (const word of words) {
      const key = rhymeKey(word);
      if (key.length >= 2 && !seen.has(key)) {
        crossFreq.set(key, (crossFreq.get(key) ?? 0) + 1);
        seen.add(key);
      }
    }
  }
  // Keys appearing in 2+ different lines = cross-line internal rhyme
  crossFreq.forEach((n) => { if (n >= 2) count += n - 1; });

  return count;
}

// Repeated consonant sounds (alliteration + consonance)
export function detectRepeatedSounds(verse: string): number {
  const words = getWords(verse);
  const initials = words.map((w) => w[0]).filter(Boolean);
  const freq: Map<string, number> = new Map();
  initials.forEach((c) => freq.set(c, (freq.get(c) ?? 0) + 1));
  let score = 0;
  freq.forEach((n) => {
    if (n >= 3) score += n;
  });
  return score;
}

// Multisyllabic rhyme approximation: rhyme key length >= 4 chars = multi
export function multisyllabicRhymes(lines: string[]): number {
  const endings = lines.map((l) => rhymeKey(lastWordOfLine(l)));
  const freq: Map<string, number> = new Map();
  endings.forEach((k) => {
    if (k.length >= 4) freq.set(k, (freq.get(k) ?? 0) + 1);
  });
  return [...freq.values()].filter((n) => n >= 2).length;
}

// Rhyme chain length: longest chain of consecutive lines sharing a rhyme key
export function longestRhymeChain(lines: string[]): number {
  const endings = lines.map((l) => rhymeKey(lastWordOfLine(l)));
  let maxChain = 1;
  let current = 1;
  for (let i = 1; i < endings.length; i++) {
    if (endings[i] === endings[i - 1] && endings[i].length >= 2) {
      current++;
      maxChain = Math.max(maxChain, current);
    } else {
      current = 1;
    }
  }
  return maxChain;
}

// ── Line Length & Flow ───────────────────────────────────────────────────────

export function lineWordCounts(lines: string[]): number[] {
  return lines.map((l) => getWords(l).length);
}

export function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length;
}

export function stddev(values: number[]): number {
  return Math.sqrt(variance(values));
}

// Cadence variation: coefficient of variation of syllable counts per line.
// Low CV = monotone; mid CV (15-40%) = good groove; high CV = chaotic
export function cadenceVariation(syllCounts: number[]): number {
  const m = mean(syllCounts);
  if (m === 0) return 0;
  return (stddev(syllCounts) / m) * 100;
}

// ── Wordplay Indicators ──────────────────────────────────────────────────────

const SIMILE_PATTERNS = [/\blike\b/gi, /\bas\b.*?\bas\b/gi];
const METAPHOR_PATTERNS = [/\b(is|are|am|was|were)\b.*\b(a|an|the)\b/gi];
const DOUBLE_MEANING = [/\b(bang|grind|burn|drop|run|blow|move|heat|fire|ice|flow|wave|break|cut|kill|murder|body|bars|cage|trap|drill|wave)\b/gi];
const CALLBACK_MARKERS = [/\b(again|back|return|revisit|remember|recall)\b/gi];

export function countWordplayIndicators(verse: string): {
  similes: number;
  metaphors: number;
  doublesCount: number;
  callbacks: number;
  total: number;
} {
  let similes = 0, metaphors = 0, doublesCount = 0, callbacks = 0;
  SIMILE_PATTERNS.forEach((p) => { const m = verse.match(p); similes += m ? m.length : 0; });
  METAPHOR_PATTERNS.forEach((p) => { const m = verse.match(p); metaphors += m ? m.length : 0; });
  DOUBLE_MEANING.forEach((p) => { const m = verse.match(p); doublesCount += m ? m.length : 0; });
  CALLBACK_MARKERS.forEach((p) => { const m = verse.match(p); callbacks += m ? m.length : 0; });
  return { similes, metaphors, doublesCount, callbacks, total: similes + metaphors + doublesCount + callbacks };
}

// ── Storytelling / Coherence ─────────────────────────────────────────────────

const TRANSITION_WORDS = /\b(then|now|before|after|when|while|because|so|but|and|yet|still|meanwhile|finally|first|next|last|suddenly|since|as|though|although|until|unless)\b/gi;
const PRONOUN_CONSISTENCY = /\b(i|me|my|mine|myself|we|our|us)\b/gi;
const EMOTIONAL_WORDS = /\b(love|hate|feel|pain|joy|fear|anger|hope|dream|grieve|win|lose|fight|rise|fall|broken|healed|lost|found|strong|weak)\b/gi;

export function analyzeStorytelling(verse: string, lines: string[]): {
  transitions: number;
  pronounConsistency: number;
  emotionalArc: number;
  lineCount: number;
} {
  const transitions = (verse.match(TRANSITION_WORDS) ?? []).length;
  const pronounMatches = (verse.match(PRONOUN_CONSISTENCY) ?? []).length;
  const emotionalMatches = (verse.match(EMOTIONAL_WORDS) ?? []).length;
  return {
    transitions,
    pronounConsistency: Math.min(1, pronounMatches / Math.max(1, lines.length) * 2),
    emotionalArc: emotionalMatches,
    lineCount: lines.length,
  };
}

// ── Punchline Detection ──────────────────────────────────────────────────────

// Punchlines typically end in short, punchy words after a setup.
// Heuristic: lines shorter than average after lines longer than average = setup/payoff
export function detectPunchlines(lines: string[], syllCounts: number[]): {
  count: number;
  density: number;
  setupPayoffPairs: number;
} {
  const avg = mean(syllCounts);
  let setups = 0, payoffs = 0, setupPayoffPairs = 0;
  for (let i = 1; i < lines.length; i++) {
    const prev = syllCounts[i - 1];
    const curr = syllCounts[i];
    if (prev > avg * 1.1 && curr < avg * 0.9) {
      setupPayoffPairs++;
    }
    if (curr > avg * 1.1) setups++;
    if (curr < avg * 0.85) payoffs++;
  }
  const density = (setups + payoffs) / Math.max(1, lines.length);
  return { count: Math.floor((setupPayoffPairs + payoffs) / 2), density, setupPayoffPairs };
}

// ── Normalize to 0–100 ───────────────────────────────────────────────────────

export function normalize(value: number, min: number, max: number): number {
  if (max === min) return 50;
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}

// Clamp a value to [0,100]
export function clamp(v: number): number {
  return Math.max(0, Math.min(100, v));
}
