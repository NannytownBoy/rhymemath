// ─── Verse Annotation Engine ──────────────────────────────────────────────────
// Takes a verse string and returns an annotated line-by-line breakdown:
// each line is split into tokens, each token tagged with what was detected.
// Used to render the yellow/pink highlighted verse analysis on the results page.

export type TokenTag =
  | "rhyme-end"        // end rhyme — matches another line's last word
  | "rhyme-internal"   // internal rhyme — matches another word within/across lines
  | "assonance"        // vowel sound repeating in this line
  | "alliteration"     // 3+ words starting with same consonant in this line
  | "punchline"        // line contains a detected punchline pattern
  | "anaphora"         // line starts with a repeated phrase opener
  | "chain"            // part of a multisyllabic rhyme chain
  | "plain";           // no tag

export interface AnnotatedToken {
  word: string;
  tags: TokenTag[];
  chainGroup?: number; // which rhyme chain group (for color grouping)
}

export interface AnnotatedLine {
  raw: string;
  tokens: AnnotatedToken[];
  badges: string[]; // e.g. ["END RHYME", "PUNCHLINE"]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function cleanWord(w: string): string {
  return w.replace(/[^a-zA-Z']/g, "").toLowerCase();
}

// Get the rhyme ending of a word (last 3–5 chars of cleaned word, min 3)
function rhymeEnding(word: string): string {
  const c = cleanWord(word);
  if (c.length <= 3) return c;
  if (c.length <= 5) return c.slice(-3);
  return c.slice(-4);
}

// Vowel phoneme families for assonance detection
const VOWEL_FAMILIES: RegExp[] = [
  /(ight|ite|ive|ine|ire|ile)/i,
  /(ow|oa|old|one|oke|ose|ole)/i,
  /(oo|ew|oom|oon|ool|oot)/i,
  /(ay|ake|ain|ame|ace|ane|ate)/i,
  /(ee|ea|een|eel|eam|eak)/i,
  /(us|ust|un|ug|ump|unk)/i,
  /(ack|ap|at|an|ad|am)/i,
];

function getVowelFamily(word: string): number {
  const c = cleanWord(word);
  for (let i = 0; i < VOWEL_FAMILIES.length; i++) {
    if (VOWEL_FAMILIES[i].test(c)) return i;
  }
  return -1;
}

// Punchline indicators — setup/payoff patterns
const PUNCHLINE_PATTERNS = [
  /\b(cause|because|so|but|and then|that's why|therefore|yet)\b/i,
  /\b(call me|they call|niggas call|you know me as|known as)\b/i,
  /\b(like|as if|imagine)\b.*\b(but|except|unless)\b/i,
  /"[^"]{5,}"/,  // quoted line = punchline delivery
];

function hasPunchlinePattern(line: string): boolean {
  return PUNCHLINE_PATTERNS.some(p => p.test(line));
}

// ── Main Annotator ────────────────────────────────────────────────────────────

export function annotateVerse(verse: string): AnnotatedLine[] {
  const rawLines = verse.split(/\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (rawLines.length === 0) return [];

  // ── Pass 1: collect end words and their rhyme endings across all lines ────
  const endWords = rawLines.map(line => {
    const words = line.split(/\s+/).filter(w => w.length > 0);
    return words[words.length - 1] ?? "";
  });

  // Find which end words share a rhyme ending
  const endRhymeMap: Record<string, number[]> = {};
  endWords.forEach((w, i) => {
    const ending = rhymeEnding(w);
    if (ending.length >= 2) {
      if (!endRhymeMap[ending]) endRhymeMap[ending] = [];
      endRhymeMap[ending].push(i);
    }
  });
  // Only count endings that appear on 2+ lines
  const endRhymeGroups = new Set(
    Object.entries(endRhymeMap)
      .filter(([, lines]) => lines.length >= 2)
      .flatMap(([, lines]) => lines)
  );

  // ── Pass 2: collect ALL word rhyme endings across the whole verse (for internal rhymes) ──
  const allWordEndings: Record<string, Array<{ lineIdx: number; wordIdx: number }>> = {};
  rawLines.forEach((line, li) => {
    line.split(/\s+/).filter(w => w.length > 0).forEach((w, wi) => {
      const ending = rhymeEnding(w);
      if (ending.length >= 3 && cleanWord(w).length >= 4) {
        if (!allWordEndings[ending]) allWordEndings[ending] = [];
        allWordEndings[ending].push({ lineIdx: li, wordIdx: wi });
      }
    });
  });

  // Internal rhymes: endings appearing 2+ times anywhere in the verse
  const internalRhymePositions = new Map<string, number>(); // "lineIdx-wordIdx" -> chainGroup
  let chainGroupCounter = 0;
  const chainGroupMap: Record<string, number> = {};

  Object.entries(allWordEndings).forEach(([ending, positions]) => {
    if (positions.length >= 2) {
      if (chainGroupMap[ending] === undefined) {
        chainGroupMap[ending] = chainGroupCounter++;
      }
      positions.forEach(({ lineIdx, wordIdx }) => {
        internalRhymePositions.set(`${lineIdx}-${wordIdx}`, chainGroupMap[ending]);
      });
    }
  });

  // ── Pass 3: detect anaphora (repeated line openers) ──────────────────────
  const lineOpeners = rawLines.map(line => cleanWord(line.split(/\s+/)[0] ?? ""));
  const openerCounts: Record<string, number> = {};
  lineOpeners.forEach(w => { if (w.length > 1) openerCounts[w] = (openerCounts[w] ?? 0) + 1; });
  const anaphoraWords = new Set(Object.entries(openerCounts).filter(([, c]) => c >= 2).map(([w]) => w));

  // ── Pass 4: build annotated lines ────────────────────────────────────────
  return rawLines.map((line, li) => {
    const words = line.split(/\s+/).filter(w => w.length > 0);
    const badges: string[] = [];

    // Detect assonance in this line
    const vowelFamilyCounts: Record<number, number> = {};
    words.forEach(w => {
      const fam = getVowelFamily(w);
      if (fam >= 0) vowelFamilyCounts[fam] = (vowelFamilyCounts[fam] ?? 0) + 1;
    });
    const hasAssonance = Object.values(vowelFamilyCounts).some(c => c >= 2);

    // Detect alliteration: 3+ words starting with same consonant
    const consonantStarts: Record<string, number> = {};
    words.forEach(w => {
      const first = cleanWord(w)[0];
      if (first && !/[aeiou]/.test(first)) {
        consonantStarts[first] = (consonantStarts[first] ?? 0) + 1;
      }
    });
    const hasAlliteration = Object.values(consonantStarts).some(c => c >= 3);

    // End rhyme on this line?
    const hasEndRhyme = endRhymeGroups.has(li);

    // Punchline?
    const isPunchline = hasPunchlinePattern(line);

    // Anaphora?
    const isAnaphora = anaphoraWords.has(lineOpeners[li]);

    if (hasEndRhyme) badges.push("END RHYME");
    if (hasAssonance) badges.push("ASSONANCE");
    if (hasAlliteration) badges.push("ALLITERATION");
    if (isPunchline) badges.push("PUNCHLINE");
    if (isAnaphora) badges.push("ANAPHORA");

    // Build tokens
    const tokens: AnnotatedToken[] = words.map((word, wi) => {
      const tags: TokenTag[] = [];
      const isLastWord = wi === words.length - 1;
      const posKey = `${li}-${wi}`;

      if (isLastWord && hasEndRhyme) tags.push("rhyme-end");

      const chainGroup = internalRhymePositions.get(posKey);
      if (chainGroup !== undefined) {
        if (isLastWord && hasEndRhyme) {
          tags.push("chain");
        } else {
          tags.push("rhyme-internal");
        }
      }

      if (hasAssonance && getVowelFamily(word) >= 0 && vowelFamilyCounts[getVowelFamily(word)] >= 2) {
        if (!tags.includes("rhyme-end") && !tags.includes("rhyme-internal")) {
          tags.push("assonance");
        }
      }

      if (wi === 0 && isAnaphora) tags.push("anaphora");

      if (isPunchline && wi === words.length - 1 && !tags.includes("rhyme-end")) {
        tags.push("punchline");
      }

      return {
        word,
        tags: tags.length > 0 ? tags : ["plain"],
        chainGroup: chainGroup ?? undefined,
      };
    });

    return { raw: line, tokens, badges };
  });
}
