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
const DOUBLE_MEANING = [/\b(bang|grind|burn|drop|run|blow|move|heat|fire|ice|flow|wave|break|cut|kill|murder|body|bars|cage|trap|drill|wave|piece|cross|bar|crown|throne|cold|iron|chain|hook|bridge|verse|fly|raw|hard|sharp|deep|heat|light|ghost|chosen|frozen|brick|stone|free|bound|blind|dead|live)\b/gi];
const CALLBACK_MARKERS = [/\b(again|back|return|revisit|remember|recall)\b/gi];
// Repeated phrase detection: same phrase appearing 2+ times in a verse = intentional callback
// This is handled dynamically in countWordplayIndicators via repeated line detection

// ── Conceptual density: abstract/philosophical compression ──────────────────
// Words that signal layered meaning: duality, cycles, systems, existence
const CONCEPTUAL_DENSITY = [
  // Nas/Rakim style: cosmic, systemic, philosophical compression
  /\b(womb|tomb|cycle|beast|rise|yeast|seed|stampede|conquer|peace|savage|wisdom|system|imprisoned|ritual|presume|unpredictable|nonchalant|salute|prophet|legacy|prophecy|vessel|metaphysical|consciousness|paradigm|eternal|mortal|transcend|sovereign|divine|chaos|balance|struggle|liberation|oppression|revolution|evolution|illusion|reality|truth|spirit|soul|flesh|blood|fire|light|dark|shadow|mirror|mask|crown|throne|war|peace|love|death|life|time|fate|god|devil|heaven|hell|earth|world|universe|cosmos)\b/gi,
  // Andre 3000 / Lil Wayne style: emotional realism and narrative weight
  // Words that carry meaning through *concrete human experience*, not abstraction
  /\b(grown|grow up|growing up|died|dying|dead|alive|gone|found|lost|born|due|pregnant|needle|addiction|overdose|wrong|right|ago|back then|remember|forgot|changed|same|hurt|help|saved|failed|left|stayed|waited|hoped|wished|prayed|cried|laughed|smiled|scarred|healed|broken|fixed|fell|stood|stood up|gave up|kept going|kept on|moved on|came back|left behind|never came|never showed|never knew|never said|never told|could have|would have|should have|coulda|woulda|shoulda|almost|maybe|what if|if only|too late|too soon|too young|too old|too far)\b/gi,
  // Temporal/narrative compression: time-jump language = deliberate story architecture
  /\b(time went on|years went by|fast forward|looking back|back then|used to|once was|used to be|grew up|got older|got grown|as a kid|as a child|younger days|back in the day|before I knew|before I understood|before it all|before the end)\b/gi,
];

// ── Cultural / geographic specificity ────────────────────────────────────────
// Naming real places, people, institutions = conceptual anchoring
const CULTURAL_SPECIFICITY = [
  /\b(riker|rikers|brooklyn|bronx|harlem|queens|compton|watts|inglewood|chicago|atlanta|detroit|new york|l\.a\.|dc|baltimore|philly|houston|new orleans|mississippi|prison|penitentiary|parole|probation|precinct|corner|block|project|housing|ghetto|hood|trap|streets|avenue|bodega|church|courthouse|jail|cell|yard|visit|commissary)\b/gi,
  /\b(reagan|trump|obama|malcolm|martin|huey|assata|mumia|pac|biggie|jay-z|nas|kendrick|cole|drake|eminem|wu-tang|rakim|big pun|big l|slick rick|krs|mobb deep|gang starr|tribe called quest|boot camp|terror squad)\b/gi,
];

// ── Contrast / juxtaposition (powerful rhetorical device) ────────────────────
const CONTRAST_PATTERNS = [
  /\b(but|yet|while|though|although|however|still|instead|rather|despite|even though|on the other hand)\b.*\b(peace|war|love|hate|life|death|rich|poor|free|trapped|rise|fall|win|lose|real|fake|strong|weak)\b/gi,
  /\b(womb to (the )?tomb|life (and|to) death|rise (and|to) fall|heaven (and|to) hell|day (and|to) night|black (and|to) white)\b/gi,
];

// ── Philosophical compression: dense meaning in few words ────────────────────
// Lines that condense large ideas — "from the womb to the tomb, presume the unpredictable"
const COMPRESSION_MARKERS = [
  /\b(from .{3,20} to .{3,20})\b/gi,       // "from X to Y" constructions
  /\b(\w+ to \w+, \w+)\b/gi,             // compressed triplets
  /\b(the \w+ of \w+)\b/gi,              // "the beast of the street"
  /\b(like a \w+ \w+ \w+)\b/gi,         // extended similes
];

export function countWordplayIndicators(verse: string): {
  similes: number;
  metaphors: number;
  doublesCount: number;
  callbacks: number;
  conceptualDensity: number;
  culturalSpecificity: number;
  contrastScore: number;
  compressionScore: number;
  total: number;
} {
  let similes = 0, metaphors = 0, doublesCount = 0, callbacks = 0;
  let conceptualDensity = 0, culturalSpecificity = 0, contrastScore = 0, compressionScore = 0;

  SIMILE_PATTERNS.forEach((p) => { const m = verse.match(p); similes += m ? m.length : 0; });
  METAPHOR_PATTERNS.forEach((p) => { const m = verse.match(p); metaphors += m ? m.length : 0; });
  DOUBLE_MEANING.forEach((p) => { const m = verse.match(p); doublesCount += m ? m.length : 0; });
  CALLBACK_MARKERS.forEach((p) => { const m = verse.match(p); callbacks += m ? m.length : 0; });
  CONCEPTUAL_DENSITY.forEach((p) => { const m = verse.match(p); conceptualDensity += m ? m.length : 0; });
  CULTURAL_SPECIFICITY.forEach((p) => { const m = verse.match(p); culturalSpecificity += m ? m.length : 0; });
  CONTRAST_PATTERNS.forEach((p) => { const m = verse.match(p); contrastScore += m ? m.length : 0; });
  COMPRESSION_MARKERS.forEach((p) => { const m = verse.match(p); compressionScore += m ? m.length : 0; });

  // Detect repeated phrases as intentional callbacks (e.g. "presume the unpredictable" appearing twice)
  const linesArr = verse.split(/\n/).map(l => l.toLowerCase().trim()).filter(Boolean);
  const phraseCount: Record<string, number> = {};
  for (const line of linesArr) {
    const key = line.replace(/[^a-z ]/g, '').trim();
    if (key.length > 7) phraseCount[key] = (phraseCount[key] ?? 0) + 1; // >7 catches "rigamortis", "the ritual"
  }
  callbacks += Object.values(phraseCount).filter(c => c > 1).length;

  const total = similes + metaphors + doublesCount + callbacks +
    Math.min(conceptualDensity, 8) +          // cap each so one dimension can't dominate
    Math.min(culturalSpecificity, 5) +
    Math.min(contrastScore * 2, 6) +
    Math.min(compressionScore, 4);

  return { similes, metaphors, doublesCount, callbacks, conceptualDensity, culturalSpecificity, contrastScore, compressionScore, total };
}

// ── Storytelling / Coherence ─────────────────────────────────────────────────

const TRANSITION_WORDS = /\b(then|now|before|after|when|while|because|so|but|and|yet|still|meanwhile|finally|first|next|last|suddenly|since|as|though|although|until|unless)\b/gi;
const PRONOUN_CONSISTENCY = /\b(i|me|my|mine|myself|we|our|us)\b/gi;
const EMOTIONAL_WORDS = /\b(love|hate|feel|pain|joy|fear|anger|hope|dream|grieve|win|lose|fight|rise|fall|broken|healed|lost|found|strong|weak|cry|laugh|bleed|breathe|survive|thrive|suffer|triumph|endure|resist|desire|conspire|inspire|aspire|salute|mourn|rage|grief|proud|honor|shame|guilt|regret|yearn|hunger|burn|ache|wound|scar|numb|raw|hollow|driven|haunted|relentless|hungry|restless|fearless|reckless|determined|faithful|loyal|betrayed|abandoned|forgotten|remembered|celebrated|revered|immortal|tired|losing|control|redemption|sinister|divine|psychosis|focused|focus|sickest|illest|killing|dead|dying|crying|trying|grinding|rising|falling|striving|thriving|struggling|hustling|pushing|praying|believing|doubting|breaking|climbing|drowning|floating|fading|glowing|beautiful|beauty|warm|warmth|wonderful|special|precious|sweet|gentle|lonely|alone|empty|miss|missed|missing|proud of|proud|grateful|thankful|heartbroken|heartbreak|devastated|overwhelmed|peaceful|content|blessed|cursed|bitter|melancholy|nostalgic|wistful|tender|vulnerable|raw|fierce|electric|alive|free|trapped|suffocated|liberated|broken down|built up|torn apart|put together)\b/gi;

// Concrete scene-setting: specific nouns that ground a story in reality
const SCENE_SETTING = /\b(street|block|corner|car|gun|money|prison|jail|cell|court|judge|cops|police|bus|train|plane|house|apartment|room|bed|table|phone|night|morning|summer|winter|city|town|neighborhood|bodega|church|school|hospital|courthouse|project|projects|building|alley|roof|door|window|floor|wall|kitchen|bathroom|bedroom|hallway|park|lot|ave|avenue|boulevard|highway|bridge|tunnel|river|ocean|sky|sun|moon|stars|rain|snow|fire|smoke|blood|tears|sweat|hands|eyes|face|voice|heart|mind|soul|body|arms|legs|feet|rikers|island|womb|tomb|brew|crossfire|picture|wire|altar|stage|throne|crown|kingdom|battlefield|trenches|cemetery|grave|coffin|casket|vault|prison yard|rec room|visitation|courtroom|sentencing|arraignment|parole board|block party|cipher|studio|booth|track|album|tape|cd|vinyl|mic|speaker|crowd|audience|cipher|throne|altar|cross|tv|television|couch|sofa|living room|shadow|mirror|rearview|playground|pigeons|pigeon|storm|prayer|letter|call|conversation|porch|stoop|street corner|hospital room|funeral|coffin lid|headstone|photograph|old photo|memory lane|kitchen table|dinner table|phone call|text message|voice mail|jail cell|holding cell|booking|arraignment|plea|sentencing|visiting room|bus stop|subway|metro|cab|uber|lyft|airport|terminal|gate|boarding|landing|hotel|motel|inn|lobby|elevator|hallway|staircase|rooftop|fire escape|basement|attic|closet|garage|driveway|front yard|backyard|patio|balcony|pool|barbecue|cookout|block party|park bench|swing|slide|jungle gym|ghetto|curb|street light|street lights|stars above|above|arm|needle|arm baby|front row|back of a|two months|slumber|spend the night|under the|in the middle|in spite|light out|lights out|lights out|dark out|out here|out there|right here|right there|up here|down here|below|above|around the corner|next door|upstairs|downstairs|across the street|down the block|around the way|in the hood|in the trap|in the cut|in the back|at the show|at the club|at the function|at the party|in the booth|on stage|on the corner|on the block|on the run|on the road|on the way|on the bus|on the train|in the car|in the truck|in the whip|in the ride|in the back seat|in the front seat|passenger|driver|shotgun|backseat|trunk)\b/gi;

// Thematic anchoring: returning to a central idea = intentional structure
// Expanded to capture Nas/Rakim-style philosophical recurrence:
//   ritual/presume/unpredictable/pinnacle/legendary/invincible = thematic weight words
//   womb/tomb/beast/yeast/east = recurring sonic-thematic clusters
// THEMATIC_ANCHORS: two-pass approach — one regex for abstract/philosophical words,
// one for temporal/narrative arc words. Both signal intentional thematic structure.
const THEMATIC_ANCHORS_ABSTRACT = /\b(cycle|circle|repeat|again|back|return|always|never|forever|still|same|different|change|remain|continue|persist|endure|survive|legacy|generation|inheritance|bloodline|history|memory|future|past|present|ritual|rituals|presume|unpredictable|nonchalant|pinnacle|synonymous|legendary|invincible|inevitable|womb|tomb|yeast|east|beast|unleashed|released|prophecy|prophetic|sovereign|eternal|mortal|transcend|divine|illusion|reality|consciousness)\b/gi;
// Andre 3000 / storytelling style: temporal arc, narrative progression, retrospective framing
const THEMATIC_ANCHORS_TEMPORAL = /\b(time went on|got grown|got older|grew up|one day|two weeks|that day|that night|years later|looking back|used to be|once was|came back|found out|moved on|left behind|by the time|after that|from then on|ever since|since then|back then|as a kid|when I was young|before it all|in the end|at the end|the last time|the first time|shoulda|woulda|coulda|what if|if only|had I known|I remember when|I never knew|I never thought|I never said|I should have|I would have|I could have)\b/gi;

// Character presence: other people exist in the verse = scene is populated
const CHARACTER_PRESENCE = /\b(they|them|he|she|her|him|his|their|my (son|daughter|mother|father|brother|sister|friend|partner|wife|husband|homie|man|woman|girl|boy|kid|child|baby|grandma|grandpa|uncle|aunt|cousin|enemy|opps|plug|boss|judge|cop|detective|lawyer|doctor|teacher|preacher|pastor|prophet|king|queen)|the (prophet|king|queen|chosen|villain|beast|ghost|omen|demon|angel|god|devil|savior|martyr|soldier|warrior|rebel|outlaw|fugitive|exile|prisoner|convict|criminal|innocent|witness|victim|survivor|legend|icon|giant|titan|coward|traitor|ally|enemy|oppressor|liberator|revolutionary))\b/gi;

export function analyzeStorytelling(verse: string, lines: string[]): {
  transitions: number;
  pronounConsistency: number;
  emotionalArc: number;
  sceneDetail: number;
  thematicAnchoring: number;
  characterPresence: number;
  lineCount: number;
} {
  const transitions = (verse.match(TRANSITION_WORDS) ?? []).length;
  const pronounMatches = (verse.match(PRONOUN_CONSISTENCY) ?? []).length;
  const emotionalMatches = (verse.match(EMOTIONAL_WORDS) ?? []).length;
  const sceneDetail = (verse.match(SCENE_SETTING) ?? []).length;
  const thematicAnchoring = (verse.match(THEMATIC_ANCHORS_ABSTRACT) ?? []).length
    + (verse.match(THEMATIC_ANCHORS_TEMPORAL) ?? []).length;
  let characterPresence = (verse.match(CHARACTER_PRESENCE) ?? []).length;

  // Named character detection: a proper name (Capitalized, 4+ chars, not at sentence start)
  // that appears 2+ times in the verse = the verse is about someone specific (Sasha, etc.)
  const properNameMap: Record<string, number> = {};
  for (const line of lines) {
    const words = line.split(/\s+/);
    for (let i = 1; i < words.length; i++) { // skip first word (always capitalized)
      const w = words[i].replace(/[^a-zA-Z]/g, '');
      if (w.length >= 4 && /^[A-Z]/.test(w) && /^[a-z]/.test(w.slice(1))) {
        properNameMap[w.toLowerCase()] = (properNameMap[w.toLowerCase()] ?? 0) + 1;
      }
    }
  }
  const namedCharacters = Object.values(properNameMap).filter(c => c >= 2).length;
  characterPresence += namedCharacters * 2; // each recurring proper name = strong character presence

  // ── Narrative Cohesion Score ──────────────────────────────────────────────
  // Stream-of-consciousness verses (Winter Warz) hop topics every 2-3 lines:
  // Lebanon Don → Malcolm X → Freddy Krueger → USSR → Method Man's Jeep
  // Narrative verses (Verbal Intercourse, Stan, I Used to Love H.E.R.) maintain
  // a single subject/situation across most of the verse.
  //
  // Signal: measure the ratio of lines with SUSTAINED SUBJECT ANCHOR
  // (first-person present + action on same topic) vs PIVOT LINES
  // (introduces a new proper noun / cultural reference mid-verse).
  //
  // Method:
  //   1. Count distinct "reference pivots": lines that introduce a NEW proper noun,
  //      pop-culture reference, or named entity not seen in the prior line.
  //   2. High pivot density relative to verse length = stream of consciousness.
  //   3. Low pivot density = sustained narrative (one situation, one arc).

  // Detect lines that introduce a cultural/name reference (proper noun mid-line)
  const PIVOT_REFERENCE = /\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?|[A-Z]{2,})\b/g;
  const FILLER_NAMES = new Set(['I', 'My', 'Me', 'We', 'Our', 'The', 'A', 'An', 'This', 'That', 'It', 'Its', 'He', 'She', 'His', 'Her', 'They', 'Their', 'You', 'Your']);
  let pivotCount = 0;
  const seenRefs = new Set<string>();
  for (const line of lines) {
    const words = line.split(/\s+/);
    let linePivoted = false;
    for (let i = 1; i < words.length; i++) { // skip first word (always capitalized)
      const w = words[i].replace(/[^a-zA-Z]/g, '');
      if (w.length >= 3 && /^[A-Z]/.test(w) && !FILLER_NAMES.has(w)) {
        if (!seenRefs.has(w.toLowerCase())) {
          seenRefs.add(w.toLowerCase());
          linePivoted = true;
        }
      }
    }
    if (linePivoted) pivotCount++;
  }

  // pivotRatio: how many lines introduce a new reference vs total lines
  // 0.0 = ultra-focused narrative. 1.0 = every line is a new reference hop.
  const pivotRatio = pivotCount / Math.max(1, lines.length);

  // narrativeCohesion: 0 (stream-of-consciousness) → 1 (tight narrative arc)
  // Tuned so pivot ratio >= 0.65 (Winter Warz style) maps to cohesion ~0.0
  //              pivot ratio <= 0.25 (Verbal Intercourse) maps to cohesion ~1.0
  const narrativeCohesion = Math.max(0, Math.min(1, 1 - (pivotRatio - 0.25) / 0.40));

  return {
    transitions,
    pronounConsistency: Math.min(1, pronounMatches / Math.max(1, lines.length) * 2),
    emotionalArc: emotionalMatches,
    sceneDetail,
    thematicAnchoring,
    characterPresence,
    lineCount: lines.length,
    narrativeCohesion,
    pivotRatio,
  };
}

// ── Punchline Detection ──────────────────────────────────────────────────────

// Punchlines: not just short lines after long ones. Also:
// - Lines with strong contrast words (but, yet, though, still = pivot = reveal)
// - Lines ending in a conceptually dense word (death, free, god, real, truth, lies)
// - Lines with "I" + declarative verb (I am, I ain't, I will, I know) = assertion punch
// - Double-meaning landing words (words that can be read two ways)

const PUNCHLINE_CONTRAST = /\b(but|yet|though|still|instead|rather|however|except|unless|until|despite|nah|nope|never|always)\b/gi;
const STRONG_LANDING_WORDS = /\b(god|real|truth|lies|free|trapped|dead|live|win|lose|king|queen|nothing|everything|forever|never|again|alone|together|same|different|now|then|here|gone|rise|fall|peace|war|love|hate|soul|flesh|blood|fire|light|dark|done|still|yet|too|though|right|wrong|last|first|only|always|never)\b\W*$/gim;
const ASSERTION_PUNCH = /\b(i am|i ain'?t|i'?m not|i will|i won'?t|i know|i don'?t|i never|i always|i been|i was|i did|i didn'?t|that'?s|this is|it'?s|they (can'?t|won'?t|don'?t|ain'?t)|we (are|ain'?t|don'?t))\b/gi;

export function detectPunchlines(lines: string[], syllCounts: number[]): {
  count: number;
  density: number;
  setupPayoffPairs: number;
  contrastPunches: number;
  assertionPunches: number;
} {
  const verse = lines.join("\n");
  const avg = mean(syllCounts);
  let setups = 0, payoffs = 0, setupPayoffPairs = 0;

  for (let i = 1; i < lines.length; i++) {
    const prev = syllCounts[i - 1];
    const curr = syllCounts[i];
    // Classic setup/payoff: long line then short line
    if (prev > avg * 1.1 && curr < avg * 0.9) setupPayoffPairs++;
    if (curr > avg * 1.1) setups++;
    if (curr < avg * 0.85) payoffs++;
  }

  // NEW: contrast punches — pivot lines that flip the expectation
  const contrastPunches = (verse.match(PUNCHLINE_CONTRAST) ?? []).length;
  // NEW: assertion punches — declarative "I am / I ain't" landing lines
  const assertionPunches = (verse.match(ASSERTION_PUNCH) ?? []).length;
  // NEW: strong landing words at end of lines
  const strongLandings = (verse.match(STRONG_LANDING_WORDS) ?? []).length;

  const density = (setups + payoffs + contrastPunches) / Math.max(1, lines.length);

  return {
    count: Math.floor((setupPayoffPairs + payoffs + Math.min(contrastPunches, 4) + strongLandings) / 2),
    density,
    setupPayoffPairs,
    contrastPunches,
    assertionPunches,
  };
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

// ── Structural Lyricism Analysis ─────────────────────────────────────────────
// Rules that measure craft signals a keyword scanner can't catch:
//   A. Internal rhyme pairs — within-line word echoes (womb/tomb, wire/desire/conspire)
//   B. Cross-line sound clusters — same rhyme key recurring 3+ times across the verse
//   C. Polysyllabic rhyme pairs — long words rhyming together (presidents/represent)
//   D. Complex echo lines — single lines with 2+ distinct rhyme groups
//   E. Polysyllabic word count — deliberate diction signal

const STOP_WORDS = new Set([
  'the','and','for','but','not','you','with','this','that','from','they','have',
  'was','are','been','will','what','when','who','how','out','all','one','can',
  'had','her','him','his','she','our','your','its','like','just','into','than',
  'then','more','also','some','such','even','each','both','very','only','does',
]);

export function analyzeStructuralLyricism(verse: string, lines: string[]): {
  internalRhymePairs: number;    // A: within-line word-echo pairs (stop-filtered)
  crossLineEchoClusters: number; // B: rhyme keys appearing 3+ times across verse
  polysyllabicRhymePairs: number;// C: 3+ syllable words sharing a rhyme key
  complexEchoLines: number;      // D: lines with 2+ distinct internal rhyme groups
  polysyllabicWordCount: number; // E: total 3+ syllable words in verse
} {
  const allWords = verse.toLowerCase().replace(/[^a-z ]/g, '').split(/\s+/).filter(Boolean);

  // A: Internal rhyme pairs (within-line, stop-filtered, deduplicated)
  let internalRhymePairs = 0;
  for (const line of lines) {
    const words = line.toLowerCase().replace(/[^a-z ]/g, '').split(/\s+/)
      .filter(w => w.length > 3 && !STOP_WORDS.has(w));
    const keys = words.map(w => rhymeKey(w));
    for (let i = 0; i < keys.length; i++)
      for (let j = i + 1; j < keys.length; j++)
        if (keys[i].length >= 2 && keys[i] === keys[j])
          internalRhymePairs++;
  }

  // B: Cross-line sound clusters (rhyme key appearing 3+ times anywhere in verse)
  const allKeyFreq: Record<string, number> = {};
  for (const line of lines) {
    const words = line.toLowerCase().replace(/[^a-z ]/g, '').split(/\s+/)
      .filter(w => w.length > 3 && !STOP_WORDS.has(w));
    words.forEach(w => {
      const k = rhymeKey(w);
      if (k.length >= 2) allKeyFreq[k] = (allKeyFreq[k] ?? 0) + 1;
    });
  }
  const crossLineEchoClusters = Object.values(allKeyFreq).filter(c => c >= 3).length;

  // C: Polysyllabic rhyme pairs — words of 3+ syllables sharing a rhyme key
  const polyWords = allWords.filter(w => syllableCount(w) >= 3);
  const polyKeys = polyWords.map(w => rhymeKey(w));
  let polysyllabicRhymePairs = 0;
  for (let i = 0; i < polyKeys.length; i++)
    for (let j = i + 1; j < polyKeys.length; j++)
      if (polyKeys[i].length >= 2 && polyKeys[i] === polyKeys[j])
        polysyllabicRhymePairs++;

  // D: Complex echo lines — lines with 2+ distinct rhyme groups (≥2 words sharing a key)
  let complexEchoLines = 0;
  for (const line of lines) {
    const words = line.toLowerCase().replace(/[^a-z ]/g, '').split(/\s+/)
      .filter(w => w.length > 3 && !STOP_WORDS.has(w));
    const groups: Record<string, number> = {};
    words.forEach(w => {
      const k = rhymeKey(w);
      if (k.length >= 2) groups[k] = (groups[k] ?? 0) + 1;
    });
    if (Object.values(groups).filter(c => c >= 2).length >= 2) complexEchoLines++;
  }

  // E: Total polysyllabic words (3+ syllables)
  const polysyllabicWordCount = polyWords.length;

  return { internalRhymePairs, crossLineEchoClusters, polysyllabicRhymePairs, complexEchoLines, polysyllabicWordCount };
}
