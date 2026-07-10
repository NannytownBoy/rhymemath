/**
 * lyric-miner.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * PH Labs Cultural Intelligence Index — Lyric Miner
 *
 * Pulls lyrics from Genius, analyzes them for cultural signals, and outputs
 * a v5.4-formatted CSV ready for cid-import.mjs.
 *
 * WHAT IT DETECTS:
 *   - Proper nouns (brands, places, people, crews, labels)
 *   - Slang / alias candidates (non-dictionary words used as nouns)
 *   - Luxury markers (known brand cross-reference)
 *   - Geographic references (city, borough, block, hood)
 *   - Repeated anchor phrases (3+ occurrences = strong signal)
 *   - Double meaning candidates (same word in multiple semantic contexts)
 *
 * OUTPUT:
 *   Two CSV files in --outdir:
 *     ph_cie_records_YYYY-MM-DD.csv   → cid_cultural_records rows (high conf → approved)
 *     ph_cie_aliases_YYYY-MM-DD.csv   → cid_aliases rows (slang → canonical)
 *
 * USAGE:
 *   # Mine a single song by Genius URL:
 *   GENIUS_TOKEN="..." node scripts/lyric-miner.mjs --url "https://genius.com/Ghostface-killah-..." --artist "Ghostface Killah"
 *
 *   # Mine all top songs for an artist:
 *   GENIUS_TOKEN="..." node scripts/lyric-miner.mjs --artist "Ghostface Killah" --songs 10
 *
 *   # Mine from a local lyrics .txt file (one verse per line, blank line between verses):
 *   GENIUS_TOKEN="..." node scripts/lyric-miner.mjs --file /path/to/lyrics.txt --artist "Cam'ron"
 *
 *   # Custom output directory:
 *   GENIUS_TOKEN="..." node scripts/lyric-miner.mjs --artist "Jay-Z" --songs 15 --outdir ~/Desktop/cid_exports
 *
 * THEN IMPORT:
 *   DATABASE_URL="..." node scripts/cid-import.mjs --dir ~/Desktop/cid_exports
 *   DATABASE_URL="..." node scripts/cid-rescore.mjs --force
 * ─────────────────────────────────────────────────────────────────────────────
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import pg from "pg";
const { Pool } = pg;

// ── AI enrichment via OpenAI (optional — set OPENAI_API_KEY to enable) ────────
const AI_ENABLED = !!process.env.OPENAI_API_KEY;

async function openAIPost(payload) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Enriches a batch of mined candidate terms with AI-generated context.
 * Returns a map of term → { definition, category, confidence, sensitivity }
 * Falls back to original values if AI is unavailable or fails.
 */
async function enrichWithAI(candidates, artistName) {
  if (!AI_ENABLED || !candidates.length) return {};

  // Batch up to 30 terms per AI call to minimize API usage
  const batches = [];
  for (let i = 0; i < candidates.length; i += 30) {
    batches.push(candidates.slice(i, i + 30));
  }

  const enriched = {};

  for (const batch of batches) {
    const termList = batch.map((t, i) => `${i + 1}. "${t}"`).join("\n");
    const prompt = `You are a hip-hop cultural analyst for a proprietary music intelligence system.

Artist context: ${artistName}

For each term below, provide a brief cultural definition as it is used in hip-hop lyrics — specifically how ${artistName} or artists in their circle use it. Focus on the cultural meaning, not the dictionary meaning. If it has multiple meanings in rap context, note the primary one.

Return ONLY a JSON array with this structure (no markdown, no explanation):
[{
  "term": "the term",
  "definition": "concise cultural definition (max 15 words)",
  "category": one of: luxury/place/slang/weapon/drug/money/person/crew/brand/food/automotive/spiritual/metaphor/street",
  "confidence": integer 3-5 (5=very well known, 4=commonly used, 3=context-dependent),
  "sensitivity": one of: low/medium/high
}]

Terms to enrich:
${termList}`;

    try {
      const res = await openAIPost({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 2000,
      });

      const content = res.choices?.[0]?.message?.content || "";
      // Strip any accidental markdown fences
      const clean = content.replace(/```json?/gi, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(clean);
      for (const item of parsed) {
        if (item.term) enriched[item.term.toLowerCase()] = item;
      }
      // Respect rate limits
      await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      console.warn(`  [AI] Enrichment batch failed (non-fatal): ${e.message}`);
    }
  }

  return enriched;
}

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };
const hasFlag = (flag) => args.includes(flag);

const GENIUS_TOKEN  = process.env.GENIUS_TOKEN;
const ARTIST_NAME   = getArg("--artist");
const ARTIST_ID_ARG = getArg("--artist-id");  // bypass search, use known Genius ID directly
const SONG_URL      = getArg("--url");
const LOCAL_FILE    = getArg("--file");
const SONG_COUNT    = parseInt(getArg("--songs") || "10", 10);
const OUT_DIR       = getArg("--outdir") || process.cwd();
const ANALYZE       = hasFlag("--analyze"); // write scored analyses directly to DB
const DRY_RUN       = hasFlag("--dry-run");
const DATABASE_URL  = process.env.DATABASE_URL;
const API_BASE      = process.env.API_BASE || "http://localhost:5000";

if (!ARTIST_NAME) {
  console.error("Usage: GENIUS_TOKEN=... node scripts/lyric-miner.mjs --artist \"Ghostface Killah\" [--songs 10] [--url ...] [--file ...] [--outdir ...]");
  process.exit(1);
}

// ── Canonical artist name map — ensures DB always gets the correct spelling ──
const CANONICAL_ARTIST_NAMES = {
  'notorious b.i.g.':      'Notorious B.I.G.',
  'notorious big':         'Notorious B.I.G.',
  'biggie':                'Notorious B.I.G.',
  'biggie smalls':         'Notorious B.I.G.',
  'mf doom':               'MF DOOM',
  'jid':                   'JID',
  'ab-soul':               'Ab-Soul',
  'ab soul':               'Ab-Soul',
  'el-p':                  'El-P',
  'el p':                  'El-P',
  'ghostface':             'Ghostface Killah',
  'ghostface killah':      'Ghostface Killah',
  'big pun':               'Big Pun',
  'yasiin bey':            'Yasiin Bey',
  'mos def':               'Yasiin Bey',
  'your old droog':        'Your Old Droog',
  'joell ortiz':           'Joell Ortiz',
  'joel ortiz':            'Joell Ortiz',
  'kool g rap':            'Kool G Rap',
  'canibus':               'Canibus',
  'pharoahe monch':        'Pharoahe Monch',
  'homeboy sandman':       'Homeboy Sandman',
  'mach-hommy':            'Mach-Hommy',
  'j. cole':               'J. Cole',
  'j cole':                'J. Cole',
  'kendrick lamar':        'Kendrick Lamar',
  'black thought':         'Black Thought',
  'jay-z':                 'JAY-Z',
  'jay z':                 'JAY-Z',
  'posdnuos':              'Posdnuos',
  'posdnous':              'Posdnuos',
  'dead prez':             'Dead Prez',
  'danny brown':           'Danny Brown',
  'styles p':              'Styles P',
  'mozzy':                 'Mozzy',
  'cam\'ron':              "Cam'ron",
  'camron':                "Cam'ron",
  'young jeezy':           'Young Jeezy',
  'jeezy':                 'Young Jeezy',
  'big boi':               'Big Boi',
  'beanie sigel':          'Beanie Sigel',
  'talib kweli':           'Talib Kweli',
  'nas':                   'Nas',
  'andre 3000':            'Andre 3000',
  'kanye west':            'Kanye West',
  // Wave 2 additions
  'royce da 5\'9"':         'Royce da 5\'9"',
  'royce da 59':           'Royce da 5\'9"',
  'royce':                 'Royce da 5\'9"',
  'krs-one':               'KRS-One',
  'krs one':               'KRS-One',
  'boogie down productions': 'KRS-One',
  'big daddy kane':        'Big Daddy Kane',
  'slick rick':            'Slick Rick',
  'll cool j':             'LL Cool J',
  'll cool j':             'LL Cool J',
  'epmd':                  'EPMD',
  'gang starr':            'Gang Starr',
  'guru':                  'Guru',
  'mobb deep':             'Mobb Deep',
  'prodigy':               'Prodigy',
  'havoc':                 'Havoc',
  'noreaga':               'Noreaga',
  'n.o.r.e.':              'Noreaga',
  'nore':                  'Noreaga',
  'big noyd':              'Big Noyd',
  'cormega':               'Cormega',
  'ice cube':              'Ice Cube',
  'schoolboy q':           'ScHoolboy Q',
  'schoolboy':             'ScHoolboy Q',
  'ugk':                   'UGK',
  'scarface':              'Scarface',
  'z-ro':                  'Z-Ro',
  'z ro':                  'Z-Ro',
  't.i.':                  'T.I.',
  'ti':                    'T.I.',
  '2 chainz':              '2 Chainz',
  '21 savage':             '21 Savage',
  'big sean':              'Big Sean',
  'childish gambino':      'Childish Gambino',
  'donald glover':         'Childish Gambino',
  'pusha t':               'Pusha T',
  'pusha-t':               'Pusha T',
  'boldy james':           'Boldy James',
  'roc marciano':          'Roc Marciano',
  'jpegmafia':             'JPEGMAFIA',
  'billy woods':           'billy woods',
  'open mike eagle':       'Open Mike Eagle',
  'oddisee':               'Oddisee',
  'snoop dogg':            'Snoop Dogg',
  'snoop doggy dogg':      'Snoop Dogg',
  'e-40':                  'E-40',
  'e 40':                  'E-40',
  'too short':             'Too $hort',
  'too $hort':             'Too $hort',
  'dmx':                   'DMX',
  'jadakiss':              'Jadakiss',
  'sheek louch':           'Sheek Louch',
  'buckshot':              'Buckshot',
  'dead prez':             'Dead Prez',
  'killer mike':           'Killer Mike',
  'common':                'Common',
};

// Normalize the incoming artist name before anything touches the DB
const artist = CANONICAL_ARTIST_NAMES[ARTIST_NAME.trim().toLowerCase()] || ARTIST_NAME.trim();

if (!GENIUS_TOKEN && !LOCAL_FILE) {
  console.error("Error: GENIUS_TOKEN env var required unless using --file mode.");
  process.exit(1);
}

// ── Known CID terms to skip (already in DB — no duplicates) ─────────────────
const EXISTING_CID = new Set([
  "fully","out of bounds","long beach","bebe's kids","burner","91 freeway","bool",
  "olde english 800","forty ounce","real p","rollie","rolex","benz","quarter m",
  "whip","wifebeater","pen","homie debt","real nigga records","run it up","section",
  "gold bottle gang","lil whoadie","pawn shop","no dome","hustlers","energy",
  "jay worthy","los angeles","b-legit","bay area","independent bosses",
  "debt-free flex","strain","mozzy","payroll giovanni","money phone",
  "gossip versus goals","neck","chain","old me","realness","goals","bigger chain",
  "litty","section culture","regional network flex","benz on the wrist",
  "west coast rap geography","automotive flex","jewelry flex",
  // Aliases
  "oe","rollie","benz","whip","burner","fully","91","la","the bay","whoadie",
  "pen","no dome","quarter m","real p","bool","nelas","boldy","smittys",
  "b-legit","payroll","mozzy","jay worthy","section","chain",
]);

// ── Vocabulary reference lists ───────────────────────────────────────────────

const LUXURY_BRANDS = new Set([
  "gucci","louis","lv","fendi","prada","versace","armani","burberry","balenciaga",
  "givenchy","off-white","supreme","bape","stone island","moncler","hermès","hermes",
  "saint laurent","ysl","bottega","dior","celine","mcm","goyard","moynat",
  "patek","ap","audemars","richard mille","jacob","jacob & co","chopard",
  "ferrari","lambo","lamborghini","porsche","maybach","bentley","rolls","rolls-royce",
  "aston","maserati","bugatti","escalade","phantom","ghost","wraith","cullinan",
  "christian louboutin","louboutin","red bottoms","giuseppe","zanotti",
  "timberland","timbs","air force","jordan","yeezys","yeezy","new balance",
  "amiri","rhude","chrome hearts","fear of god","fog","palm angels",
  "ace of spades","armand de brignac","cristal","dom pérignon","dom p",
  "hennessy","henny","rémy","remy martin","dusse","d'ussé","ciroc","belvedere",
]);

const GEO_MARKERS = new Set([
  // NYC
  "harlem","marcy","bedford-stuyvesant","bed-stuy","brownsville","flatbush",
  "crown heights","east new york","south bronx","queensbridge","hollis",
  "compton","inglewood","watts","crenshaw","leimert park","south central",
  "brooklyn","the bronx","queens","staten island","shaolin",
  // ATL
  "bankhead","decatur","college park","zone 6","zone 3","east atlanta","buckhead",
  // Chicago
  "chiraq","englewood","roseland","south side","79th","63rd",
  // Detroit
  "flint","8 mile","7 mile","delray",
  // Houston
  "fifth ward","third ward","slab","screwed up","h-town",
  // Philly
  "north philly","west philly","south philly","germantown",
  // Pittsburgh / Buffalo
  "griselda","buffalo","716",
  // General
  "the projects","the pj","bricks","the hood","the block","the ave",
  "uptown","downtown","the 6","tdot","toronto",
]);

const STREET_LEXICON = new Set([
  // Weapons
  "stick","pipe","banger","ratchet","hammer","heater","iron","toast","tre pound",
  "four fifth","four-fifth","nina","deuce deuce","mac","choppa","chop","drac","draco",
  // Drugs
  "brick","ki","key","bird","work","hard","soft","crack","raw","base","cook up",
  "dutch","backwood","blunt","spliff","reefer","gas","loud","pack","zips","zona",
  // Money
  "bread","gwop","guap","cake","paper","racks","bands","m","milli","stacks","blue faces",
  "blue faces","dead presidents","c-notes","knots","knot",
  // Status
  "iced out","froze","dripped","draped","glossy","fresh","clean","steez","swag",
  "on sight","on site","slide","spin","twirl","step","move different",
  // People
  "shorty","shawty","homie","homey","cuz","fam","gang","opps","opp","jakes",
  "boys","12","five-o","po-po","alphabet boys","feds","fiends","junkies",
]);

const COMMON_WORDS = new Set([
  "the","a","an","and","or","but","in","on","at","to","for","of","with","by",
  "from","up","about","into","through","during","before","after","above","below",
  "between","out","off","over","under","again","then","once","here","there",
  "when","where","why","how","all","both","each","few","more","most","other",
  "some","such","no","not","only","same","than","too","very","just","because",
  "as","until","while","although","though","since","unless","whether","if",
  "this","that","these","those","i","me","my","myself","we","our","ours",
  "you","your","yours","he","his","him","she","her","hers","it","its","they",
  "them","their","what","which","who","whom","got","get","got","like","said",
  "know","time","been","have","will","would","could","should","may","might",
  "must","shall","gonna","gotta","wanna","tryna","ima","imma","nigga","niggas",
  "yeah","yea","ay","aye","oh","ah","uh","um","man","bro","real","talk",
  "make","take","come","go","see","think","feel","tell","put","need","want",
  "way","day","back","look","give","use","work","first","long","last","never",
  "always","still","even","well","also","now","right","down","thing","things",
]);

// ── Section detection (for analyze-and-store) ───────────────────────────────
const SECTION_PATTERNS = [
  { re: /^\[?verse\s*1\]?/i, label: "verse_1", index: 1 },
  { re: /^\[?verse\s*2\]?/i, label: "verse_2", index: 2 },
  { re: /^\[?verse\s*3\]?/i, label: "verse_3", index: 3 },
  { re: /^\[?verse\s*4\]?/i, label: "verse_4", index: 4 },
  { re: /^\[?verse\]?/i,     label: "verse_1", index: 1 },
  { re: /^\[?(?:hook|chorus)\]?/i, label: "hook", index: null },
  { re: /^\[?bridge\]?/i,    label: "bridge", index: null },
  { re: /^\[?intro\]?/i,     label: "intro",  index: null },
  { re: /^\[?outro\]?/i,     label: "outro",  index: null },
  { re: /^\[?interlude\]?/i, label: "interlude", index: null },
  { re: /^\[?pre[\s-]?(?:hook|chorus)\]?/i, label: "pre_hook", index: null },
];

function splitLyricsIntoSections(rawLyrics) {
  const lines = rawLyrics.split(/\r?\n/);
  const sections = [];
  let current = null;
  let autoIdx = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    let header = null;
    for (const { re, label, index } of SECTION_PATTERNS) {
      if (re.test(trimmed)) { header = { label, index }; break; }
    }
    if (header) {
      if (current && current.lines.filter(l => l.trim()).length > 0) sections.push(current);
      current = { label: header.label, index: header.index, lines: [] };
    } else if (trimmed) {
      if (!current) { autoIdx++; current = { label: `verse_${autoIdx}`, index: autoIdx, lines: [] }; }
      current.lines.push(line);
    }
  }
  if (current && current.lines.filter(l => l.trim()).length > 0) sections.push(current);
  if (!sections.length && rawLyrics.trim()) {
    sections.push({ label: "unknown", index: null, lines: rawLyrics.split(/\r?\n/).filter(l => l.trim()) });
  }
  return sections
    .map(s => ({ ...s, text: s.lines.filter(l => l.trim()).join("\n") }))
    .filter(s => s.text.length > 10 && s.lines.filter(l => l.trim()).length >= 2);
}

function hashVerse(text) {
  const normalized = text.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

async function analyzeAndStoreInline({ artist, title, lyrics, source, sourceId, dryRun }) {
  if (!DATABASE_URL) return [];
  const pool = new Pool({ connectionString: DATABASE_URL });
  const sections = splitLyricsIntoSections(lyrics);
  const results = [];

  for (const { label, text } of sections) {
    const hash = hashVerse(text);

    // Duplicate check — skip if this exact verse text was already scored
    const dup = await pool.query("SELECT id FROM analyses WHERE text_hash = $1 LIMIT 1", [hash]);
    if (dup.rows.length > 0) { results.push({ status: "skip", label }); continue; }

    if (dryRun) { results.push({ status: "dry-run", label }); continue; }

    // POST to /api/analyze — the server handles scoring + DB persistence
    // Response shape: { scores: { overall, flow, wordplay, storytelling, rhyming, punchlines }, ... }
    let scored = null;
    try {
      const res = await fetch(`${API_BASE}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artistName: artist, songName: title, verse: text, verseLabel: label }),
      });
      if (res.ok) {
        const json = await res.json();
        // Server returns { scores: { overall, flow, ... }, resultId, ... }
        // Confirm it's a valid scoring response (not an HTML error page)
        if (json && json.scores && typeof json.scores.overall === "number") {
          scored = json;
        }
      }
    } catch (_) {}

    if (!scored) {
      results.push({ status: "flag", label });
      continue;
    }

    // Server already persisted to DB via saveAnalysis() — just report the score
    results.push({ status: "insert", label, score: scored.scores.overall });
  }

  await pool.end();
  return results;
}

// ── Genius API helpers ────────────────────────────────────────────────────────

async function geniusGet(endpoint) {
  const url = `https://api.genius.com${endpoint}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${GENIUS_TOKEN}`,
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Genius API error ${res.status} on ${endpoint}: ${text.slice(0, 150)}`);
  }
  return res.json();
}

// Known artist IDs for artists with special characters or unusual Genius spellings
const KNOWN_ARTIST_IDS = {
  "jay-z": 2, "jayz": 2, "jay z": 2,
  "jay-z (ft.": 2, // partial match guard
};

async function searchArtist(name) {
  // Check known IDs first (handles special chars like JAŸ-Z)
  const nameLower = name.toLowerCase().trim();
  if (KNOWN_ARTIST_IDS[nameLower]) return KNOWN_ARTIST_IDS[nameLower];

  const res = await geniusGet(`/search?q=${encodeURIComponent(name)}`);
  const hits = res.response?.hits || [];

  // Normalize: strip diacritics for comparison
  const normalize = (s) => s.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-z0-9\s-]/g, "").trim();

  const nameNorm = normalize(name);

  // Pass 1: exact normalized match on primary artist
  for (const hit of hits) {
    const a = hit.result?.primary_artist;
    if (a && normalize(a.name) === nameNorm) return a.id;
  }

  // Pass 2: partial normalized match on primary artist
  for (const hit of hits) {
    const a = hit.result?.primary_artist;
    if (a && normalize(a.name).includes(nameNorm)) return a.id;
  }

  // Pass 3: check all primary_artists array
  for (const hit of hits) {
    const artists = hit.result?.primary_artists || [];
    for (const a of artists) {
      if (normalize(a.name).includes(nameNorm)) return a.id;
    }
  }

  // Pass 4: check featured artists
  for (const hit of hits) {
    const featured = hit.result?.featured_artists || [];
    for (const a of featured) {
      if (normalize(a.name).includes(nameNorm)) return a.id;
    }
  }

  // Pass 5: normalized artist_names string
  for (const hit of hits) {
    const artistNames = hit.result?.artist_names || "";
    if (normalize(artistNames).includes(nameNorm)) {
      return hit.result?.primary_artist?.id || null;
    }
  }

  return null;
}

async function getArtistSongs(artistId, perPage = 20) {
  // Fetch extra songs to account for filtering out features/collabs
  const fetchCount = Math.min(perPage * 3, 50);
  let page = 1;
  let collected = [];

  while (collected.length < perPage) {
    const res = await geniusGet(`/artists/${artistId}/songs?sort=popularity&per_page=20&page=${page}`);
    const songs = res.response?.songs || [];
    if (!songs.length) break;

    // Only keep songs where the target artist is THE primary artist (not just a feature/sample)
    for (const song of songs) {
      const primaryId = song.primary_artist?.id;
      const allPrimaryIds = (song.primary_artists || []).map(a => a.id);
      // Strict: must be the sole or a co-primary artist, not just tagged
      const isPrimary = primaryId === artistId || allPrimaryIds.includes(artistId);
      // Extra guard: if primary_artist is someone else entirely, skip
      const someoneElseIsPrimary = primaryId && primaryId !== artistId && !allPrimaryIds.includes(artistId);
      if (isPrimary && !someoneElseIsPrimary) collected.push(song);
      if (collected.length >= perPage) break;
    }
    page++;
    if (page > 5) break; // max 5 pages
  }

  // Fallback: if strict filter got nothing, return all songs from page 1
  if (!collected.length) {
    const res = await geniusGet(`/artists/${artistId}/songs?sort=popularity&per_page=${perPage}&page=1`);
    return res.response?.songs || [];
  }

  return collected;
}

async function getSongById(songId) {
  const res = await geniusGet(`/songs/${songId}`);
  return res.response?.song || null;
}

async function getSongByUrl(url) {
  // Extract song path and search for it
  const slug = url.split("genius.com/")[1]?.replace(/-lyrics$/, "").replace(/-/g, " ");
  if (!slug) return null;
  const res = await geniusGet(`/search?q=${encodeURIComponent(slug)}`);
  const hits = res.response?.hits || [];
  return hits[0]?.result || null;
}

// Fetch actual lyrics text via the Genius page (API doesn't return full lyrics)
async function fetchLyricsFromPage(url) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    const html = await res.text();
    // Extract text between data-lyrics-container divs
    const matches = [...html.matchAll(/data-lyrics-container[^>]*>([\s\S]*?)<\/div>/g)];
    if (!matches.length) return "";
    let lyrics = matches.map(m => m[1]).join("\n");
    // Strip HTML tags
    lyrics = lyrics.replace(/<br\s*\/?>/gi, "\n");
    lyrics = lyrics.replace(/<[^>]+>/g, "");
    // Decode HTML entities
    lyrics = lyrics.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'");
    return lyrics.trim();
  } catch (e) {
    return "";
  }
}

// ── Text analysis ─────────────────────────────────────────────────────────────

function tokenize(text) {
  return text.toLowerCase()
    .replace(/[^\w\s'-]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 1);
}

function extractProperNouns(text) {
  // Capitalized words/phrases not at line start
  const results = new Set();
  const lines = text.split("\n");
  for (const line of lines) {
    const words = line.split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      // Skip first word of line (always capitalized)
      if (i === 0) continue;
      if (/^[A-Z][a-z]/.test(w) && w.length > 2) {
        // Check for multi-word proper noun
        let phrase = w;
        let j = i + 1;
        while (j < words.length && /^[A-Z][a-z]/.test(words[j])) {
          phrase += " " + words[j];
          j++;
        }
        const clean = phrase.replace(/[^a-zA-Z0-9\s'-]/g, "").trim();
        if (clean.length > 2 && !COMMON_WORDS.has(clean.toLowerCase())) {
          results.add(clean);
        }
      }
    }
  }
  return results;
}

function extractLuxuryRefs(tokens) {
  const hits = new Set();
  for (const token of tokens) {
    if (LUXURY_BRANDS.has(token)) hits.add(token);
  }
  // Check bigrams/trigrams
  for (let i = 0; i < tokens.length - 1; i++) {
    const bi = `${tokens[i]} ${tokens[i+1]}`;
    if (LUXURY_BRANDS.has(bi)) hits.add(bi);
  }
  return hits;
}

function extractGeoRefs(tokens, text) {
  const hits = new Set();
  const lower = text.toLowerCase();
  for (const geo of GEO_MARKERS) {
    if (lower.includes(geo)) hits.add(geo);
  }
  return hits;
}

function extractStreetLexicon(tokens, text) {
  const hits = new Set();
  const lower = text.toLowerCase();
  for (const term of STREET_LEXICON) {
    if (term.includes(" ")) {
      if (lower.includes(term)) hits.add(term);
    } else {
      const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (re.test(lower)) hits.add(term);
    }
  }
  return hits;
}

function extractRepeatedPhrases(texts) {
  // Find 2-4 word phrases that appear 3+ times across the corpus
  const phraseCount = {};
  for (const text of texts) {
    const words = tokenize(text);
    for (let n = 2; n <= 4; n++) {
      for (let i = 0; i <= words.length - n; i++) {
        const phrase = words.slice(i, i + n).join(" ");
        if (phrase.split(" ").every(w => !COMMON_WORDS.has(w) && w.length > 2)) {
          phraseCount[phrase] = (phraseCount[phrase] || 0) + 1;
        }
      }
    }
  }
  return Object.entries(phraseCount)
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .map(([phrase]) => phrase);
}

// ── CID candidate builder ─────────────────────────────────────────────────────

let recCounter = 1000; // Start above existing records to avoid conflicts
let aliasCounter = 100;

function newRecId() { return `REC54_M${String(recCounter++).padStart(4, "0")}`; }
function newAliasId() { return `ALS54_M${String(aliasCounter++).padStart(4, "0")}`; }

const TODAY = new Date().toISOString().split("T")[0];
const SOURCE_ID = "SRC_5_4_MINER";

function buildRecord({ term, definition, category, confidence, reviewStatus, shortAnchor }) {
  return {
    record_id: newRecId(),
    term: term,
    canonical_meaning: definition || "",
    category_primary: category || "slang",
    category_secondary: "",
    domains: category || "slang",
    era: "2000s-present",
    region: "",
    confidence: confidence || 3,
    review_status: reviewStatus || (confidence >= 4 ? "approved" : "needs_review"),
    status: "active",
    source_id: SOURCE_ID,
    risk_flag: "low",
    sensitivity_tag: "contextual",
    display_label: term,
    short_anchor: shortAnchor || "",
    notes: `Mined by lyric-miner.mjs on ${TODAY}`,
    owner: "PH Labs Curator",
    last_reviewed_at: TODAY,
    approved_by: confidence >= 4 ? "PH Labs Curator" : "",
  };
}

function buildAlias({ aliasText, canonicalRecordId, aliasType, confidence }) {
  return {
    alias_id: newAliasId(),
    alias_text: aliasText,
    canonical_record_id: canonicalRecordId,
    alias_type: aliasType || "slang",
    confidence: confidence || 3,
    review_status: confidence >= 4 ? "approved" : "needs_review",
    status: "active",
    source_id: SOURCE_ID,
    risk_flag: "low",
    sensitivity_tag: "contextual",
    display_label: aliasText,
    notes: `Mined by lyric-miner.mjs on ${TODAY}`,
    owner: "PH Labs Curator",
    last_reviewed_at: TODAY,
    approved_by: confidence >= 4 ? "PH Labs Curator" : "",
  };
}

// ── CSV writer ────────────────────────────────────────────────────────────────

function toCSVRow(obj) {
  return Object.values(obj).map(v => {
    const s = String(v ?? "");
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",");
}

function writeCSV(filepath, rows) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]).join(",");
  const lines = [headers, ...rows.map(toCSVRow)].join("\n");
  fs.writeFileSync(filepath, lines, "utf8");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function mineText(text, songTitle, artistName) {
  const tokens = tokenize(text);
  const records = [];
  const aliases = [];
  const seen = new Set([...EXISTING_CID]);
  const pendingTerms = []; // collect all raw candidates for AI batch enrichment

  const addIfNew = (term, defaultMeta) => {
    const key = term.toLowerCase().trim();
    if (!key || key.length < 2 || seen.has(key) || COMMON_WORDS.has(key)) return;
    seen.add(key);
    pendingTerms.push({ term, ...defaultMeta });
  };

  // Luxury brands
  for (const brand of extractLuxuryRefs(tokens)) {
    addIfNew(brand, { definition: `Luxury brand — status marker`, category: "luxury", confidence: 5, reviewStatus: "approved" });
  }

  // Geographic references
  for (const geo of extractGeoRefs(tokens, text)) {
    addIfNew(geo, { definition: `Geographic reference`, category: "place", confidence: 4, reviewStatus: "approved" });
  }

  // Street lexicon
  for (const term of extractStreetLexicon(tokens, text)) {
    addIfNew(term, { definition: `Street/slang term`, category: "slang", confidence: 3, reviewStatus: "needs_review" });
  }

  // Proper nouns
  for (const noun of extractProperNouns(text)) {
    addIfNew(noun, { definition: `Proper noun in: ${songTitle}`, category: "entity", confidence: 3, reviewStatus: "needs_review" });
  }

  // ── AI enrichment ──────────────────────────────────────────────────
  // Only enrich terms that aren't already high-confidence (luxury/geo are fine as-is)
  const toEnrich = pendingTerms
    .filter(t => t.confidence < 5)
    .map(t => t.term);

  const aiContext = await enrichWithAI(toEnrich, artistName || "this artist");

  // Build final records, applying AI context where available
  for (const pending of pendingTerms) {
    const ai = aiContext[pending.term.toLowerCase()];
    const rec = buildRecord({
      term: pending.term,
      definition:   ai?.definition  || pending.definition,
      category:     ai?.category    || pending.category,
      confidence:   ai?.confidence  || pending.confidence,
      reviewStatus: pending.reviewStatus,
      shortAnchor:  "",
    });
    // Apply AI sensitivity if provided
    if (ai?.sensitivity === "high") {
      rec.risk_flag = "high";
      rec.review_status = "needs_review"; // always force review on high sensitivity
    }
    records.push(rec);
  }

  // ── AI entendre + punchline + figures extraction (same song text, zero extra API cost) ──
  const [{ entendres, punchlines }, figures] = await Promise.all([
    extractWordplayFromText(text, songTitle, artistName || "this artist"),
    extractFiguresFromText(text, songTitle, artistName || "this artist"),
  ]);

  return { records, aliases, entendres, punchlines, figures };
}

// ── Entendre + punchline extractor (one AI call per song) ────────────────────
let entendreCounter = 1000;
let punchlineCounter = 1000;
function newEntendreId() { return `ENT_M${String(entendreCounter++).padStart(5, "0")}`; }
function newPunchlineId() { return `PCH_M${String(punchlineCounter++).padStart(5, "0")}`; }

async function extractWordplayFromText(text, songTitle, artistName) {
  if (!AI_ENABLED || !text || text.length < 50) return { entendres: [], punchlines: [] };

  // Truncate to ~2000 chars — enough for the AI to find wordplay without burning tokens
  const snippet = text.slice(0, 2000);

  const prompt = `You are a hip-hop linguistics analyst for a music intelligence system called RhymeMath.

Song: "${songTitle}" by ${artistName}

Analyze these lyrics for:
1. DOUBLE/TRIPLE MEANINGS — words or phrases that carry 2+ simultaneous meanings (entendres)
2. PUNCHLINES — setup→payoff structures where one line pays off another

Return ONLY this JSON (no markdown, no explanation):
{
  "entendres": [
    {
      "term": "the word or short phrase with multiple meanings",
      "anchor": "the full line or fragment it appears in",
      "interpretation_1": "first meaning",
      "interpretation_2": "second meaning",
      "interpretation_3": "third meaning if any, else empty string",
      "domains": "comma-separated: money;luxury;violence;slang;sports;place;music_industry;street;body;food;automotive;spiritual;philosophy",
      "strength_estimate": integer 1-5,
      "confidence": integer 3-5
    }
  ],
  "punchlines": [
    {
      "setup_anchor": "the setup line or phrase",
      "payoff_anchor": "the payoff line or phrase",
      "mechanism": "1 sentence — how the wordplay works",
      "punchline_type": one of: "double_entendre|numeric_flip|status_undercut|contrast_punchline|cultural_reference_payoff|image_compression|character_read|opening_misdirection|luxury_humble_contrast|ethos_contrast|callback_payoff|metaphor_flip",
      "detected_domains": "comma-separated domain tags",
      "strength_estimate": integer 1-5,
      "confidence": integer 3-5
    }
  ]
}

Rules:
- Only flag REAL double meanings — not everything is an entendre. Quality over quantity.
- Punchlines need a clear setup AND payoff. Bars that just sound good don't count.
- If you find nothing, return empty arrays.
- Max 8 entendres and 6 punchlines per song.

Lyrics:
${snippet}`;

  try {
    const res = await openAIPost({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 1800,
    });
    const content = res.choices?.[0]?.message?.content || "";
    const clean = content.replace(/```json?/gi, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(clean);

    const entendres = (parsed.entendres || []).map(e => ({
      entendre_id:      newEntendreId(),
      anchor:           e.anchor || "",
      short_anchor:     (e.anchor || "").slice(0, 80),
      term:             e.term || "",
      interpretation_1: e.interpretation_1 || "",
      interpretation_2: e.interpretation_2 || "",
      interpretation_3: e.interpretation_3 || "",
      domains:          e.domains || "",
      strength_estimate: e.strength_estimate || 3,
      confidence:       e.confidence || 3,
      category_primary: "double_entendre",
      review_status:    e.confidence >= 4 ? "approved" : "needs_review",
      status:           "active",
      source_id:        SOURCE_ID,
      risk_flag:        "low",
      sensitivity_tag:  "contextual",
      display_label:    e.term || "",
      notes:            `Extracted from "${songTitle}" by lyric-miner on ${TODAY}`,
      owner:            "PH Labs Curator",
      last_reviewed_at: TODAY,
      approved_by:      e.confidence >= 4 ? "PH Labs Curator" : "",
    }));

    const punchlines = (parsed.punchlines || []).map(p => ({
      punchline_id:     newPunchlineId(),
      setup_anchor:     p.setup_anchor || "",
      short_anchor:     (p.setup_anchor || "").slice(0, 80),
      payoff_anchor:    p.payoff_anchor || "",
      mechanism:        p.mechanism || "",
      detected_domains: p.detected_domains || "",
      punchline_type:   p.punchline_type || "contrast_punchline",
      strength_estimate: p.strength_estimate || 3,
      confidence:       p.confidence || 3,
      category_primary: "punchline_context",
      review_status:    p.confidence >= 4 ? "approved" : "needs_review",
      status:           "active",
      source_id:        SOURCE_ID,
      risk_flag:        "low",
      sensitivity_tag:  "contextual",
      display_label:    `${(p.setup_anchor || "").slice(0,40)} → ${(p.payoff_anchor || "").slice(0,40)}`,
      notes:            `Extracted from "${songTitle}" by lyric-miner on ${TODAY}`,
      owner:            "PH Labs Curator",
      last_reviewed_at: TODAY,
      approved_by:      p.confidence >= 4 ? "PH Labs Curator" : "",
    }));

    return { entendres, punchlines };
  } catch (e) {
    console.warn(`  [AI-wordplay] failed (non-fatal): ${e.message}`);
    return { entendres: [], punchlines: [] };
  }
}

// ── Real-world figures extractor (runs in parallel with wordplay, zero extra net cost) ──
async function extractFiguresFromText(text, songTitle, artistName) {
  try {
    const prompt = `You are a hip-hop cultural analyst. Read these lyrics and identify any references to real-world NAMED people, events, or brands that a rap listener would recognize as a cultural reference (not general nouns).

Return ONLY a JSON array. Each item:
{
  "figure_name": "exact name as written in lyrics",
  "figure_type": "person" | "event" | "place" | "brand" | "scandal",
  "domains": ["religion"|"politics"|"sports"|"music"|"crime"|"entertainment"|"media"|"business"],
  "era": "e.g. 2020s or 1990s-2000s",
  "cultural_context": "1-2 sentences: why this name appears in rap and what it signals",
  "scandal_summary": "if this person/event has a controversy that rappers reference, describe it briefly",
  "example_lyric": "the exact line or phrase from the lyrics"
}

Rules:
- Only include NAMED real people/events (not generic terms like 'the president')
- Exclude the artist themselves and their obvious collaborators
- Exclude fictional characters
- Minimum confidence: you must be >80% sure this is an intentional cultural reference
- Return [] if no qualifying figures found
- Do NOT wrap in markdown or code blocks

Song: "${songTitle}" by ${artistName}

Lyrics:
${text.slice(0, 3000)}`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 800,
      }),
    });
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content?.trim() ?? "[]";
    const parsed = JSON.parse(raw.replace(/^```json|```$/g, "").trim());
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(f => f.figure_name && f.figure_name.length >= 2);
  } catch (e) {
    console.warn(`  [AI-figures] failed (non-fatal): ${e.message}`);
    return [];
  }
}

async function main() {
  console.log(`\n╔═══════════════════════════════════════════════════╗`);
  console.log(`║  PH Labs CID Lyric Miner                          ║`);
  console.log(`║  Artist: ${artist.padEnd(40)}║`);
  console.log(`╚═══════════════════════════════════════════════════╝\n`);

  const allRecords = [];
  const allAliases = [];
  const allEntendres = [];
  const allPunchlines = [];
  const allFigures = [];
  const allTexts = [];

  // ── Source: local file ───────────────────────────────────────────────────
  if (LOCAL_FILE) {
    console.log(`Reading local file: ${LOCAL_FILE}`);
    const text = fs.readFileSync(LOCAL_FILE, "utf8");
    allTexts.push(text);
    const { records, aliases, entendres, punchlines, figures } = await mineText(text, path.basename(LOCAL_FILE), artist);
    allRecords.push(...records);
    allAliases.push(...aliases);
    allEntendres.push(...entendres);
    allPunchlines.push(...punchlines);
    allFigures.push(...(figures || []));
    console.log(`  Found ${records.length} candidate records, ${entendres.length} entendres, ${punchlines.length} punchlines, ${(figures||[]).length} figures\n`);
  }

  // ── Source: Genius API ───────────────────────────────────────────────────
  else if (GENIUS_TOKEN) {
    let songs = [];

    if (SONG_URL) {
      console.log(`Fetching song from URL...`);
      const song = await getSongByUrl(SONG_URL);
      if (song) songs = [song];
    } else {
      let artistId;
      if (ARTIST_ID_ARG) {
        artistId = parseInt(ARTIST_ID_ARG, 10);
        console.log(`Using provided artist ID: ${artistId}`);
      } else {
        console.log(`Searching Genius for artist: ${artist}...`);
        artistId = await searchArtist(ARTIST_NAME);
        if (!artistId) { console.error("Artist not found on Genius."); process.exit(1); }
        console.log(`Found artist ID: ${artistId}`);
      }
      songs = await getArtistSongs(artistId, SONG_COUNT);
      console.log(`Found ${songs.length} songs\n`);
    }

    for (const song of songs) {
      const title = song.full_title || song.title;
      process.stdout.write(`  Mining: ${title.substring(0, 60)}... `);
      try {
        const lyricsUrl = song.url;
        const text = await fetchLyricsFromPage(lyricsUrl);
        if (!text || text.length < 50) {
          console.log(`(no lyrics found, skipping)`);
          continue;
        }
        allTexts.push(text);
        const { records, aliases, entendres, punchlines } = await mineText(text, title, artist);
        allRecords.push(...records);
        allAliases.push(...aliases);
        allEntendres.push(...entendres);
        allPunchlines.push(...punchlines);
        process.stdout.write(`+${records.length} rec +${entendres.length} ent +${punchlines.length} pch`);

        // ── Analyze-and-store (opt-in via --analyze flag) ──────────────────
        if (ANALYZE && DATABASE_URL) {
          const stored = await analyzeAndStoreInline({
            artist: artist,
            title: song.title || title,
            lyrics: text,
            source: "genius",
            sourceId: String(song.id || ""),
            dryRun: DRY_RUN,
          });
          const ins = stored.filter(r => r.status === "insert").length;
          const skip = stored.filter(r => r.status === "skip").length;
          process.stdout.write(` | stored:${ins} dup:${skip}`);
        }

        console.log("");
        // Small delay to be respectful of Genius rate limits
        await new Promise(r => setTimeout(r, 800));
      } catch (e) {
        console.log(`(error: ${e.message})`);
      }
    }

    // Cross-corpus repeated phrases
    if (allTexts.length > 1) {
      console.log(`\nAnalyzing repeated phrases across ${allTexts.length} songs...`);
      const repeated = extractRepeatedPhrases(allTexts);
      let phraseCount = 0;
      for (const phrase of repeated.slice(0, 20)) {
        const key = phrase.toLowerCase();
        if (!EXISTING_CID.has(key) && !COMMON_WORDS.has(key)) {
          const rec = buildRecord({
            term: phrase,
            definition: `Repeated phrase across ${artist} corpus`,
            category: "slang",
            confidence: 4,
            reviewStatus: "needs_review",
            shortAnchor: phrase,
          });
          allRecords.push(rec);
          phraseCount++;
        }
      }
      if (phraseCount) console.log(`  +${phraseCount} repeated phrase candidates`);
    }
  }

  // ── Write output ─────────────────────────────────────────────────────────
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const recordsFile  = path.join(OUT_DIR, `v5_4_mined_refs.csv`);
  const aliasesFile  = path.join(OUT_DIR, `v5_4_alias_additions.csv`);
  const entendresFile = path.join(OUT_DIR, `v5_4_entendres.csv`);
  const puchlinesFile = path.join(OUT_DIR, `v5_4_punchlines.json`);

  // Deduplicate records by term
  const uniqueRecords = [];
  const seenTerms = new Set();
  for (const r of allRecords) {
    const key = r.term.toLowerCase();
    if (!seenTerms.has(key)) { seenTerms.add(key); uniqueRecords.push(r); }
  }

  writeCSV(recordsFile, uniqueRecords);
  writeCSV(aliasesFile, allAliases);
  if (allEntendres.length) writeCSV(entendresFile, allEntendres);
  if (allPunchlines.length) fs.writeFileSync(puchlinesFile, JSON.stringify(allPunchlines, null, 2), "utf8");
  const figuresFile = path.join(OUT_DIR, `v5_4_figures.json`);
  if (allFigures.length) fs.writeFileSync(figuresFile, JSON.stringify(allFigures, null, 2), "utf8");

  console.log(`\n─────────────────────────────────────────────────────`);
  console.log(`  Mining complete`);
  console.log(`  Records found:   ${uniqueRecords.length}`);
  console.log(`  Aliases found:   ${allAliases.length}`);
  console.log(`  Entendres found: ${allEntendres.length}`);
  console.log(`  Punchlines found:${allPunchlines.length}`);
  console.log(`  Figures found:   ${allFigures.length}`);
  console.log(`  Output dir:      ${OUT_DIR}`);
  console.log(`─────────────────────────────────────────────────────`);
  console.log(`\nNext steps:`);
  console.log(`  1. Review and clean the CSVs (delete bad rows)`);
  console.log(`  2. DATABASE_URL="..." node scripts/cid-import.mjs --dir "${OUT_DIR}"`);
  console.log(`  3. DATABASE_URL="..." node scripts/cid-rescore.mjs --force\n`);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
