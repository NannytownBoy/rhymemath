/**
 * cid-auto-mine.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * PH Labs CID — Automated Mining Bot
 *
 * Runs on a schedule (via Railway cron or manual trigger) to automatically
 * mine lyrics from the pre-approved artist list, enrich with AI context,
 * import new records into Railway, and rescore all analyses.
 *
 * PROPRIETARY — PH Labs internal tool. Do not distribute.
 *
 * USAGE (manual trigger):
 *   GENIUS_TOKEN="..." OPENAI_API_KEY="..." DATABASE_URL="..." \
 *     node scripts/cid-auto-mine.mjs
 *
 *   # Dry run (mine + enrich but don't import):
 *   GENIUS_TOKEN="..." OPENAI_API_KEY="..." DATABASE_URL="..." \
 *     node scripts/cid-auto-mine.mjs --dry-run
 *
 *   # Override songs per artist:
 *   ... node scripts/cid-auto-mine.mjs --songs 20
 *
 * SCHEDULE:
 *   Designed to run every 3 days via Railway cron.
 *   Each run only mines artists that haven't been mined in the last 3 days
 *   (tracked in cid_sync_log) so no redundant work.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import https from "https";
import pg from "pg";

const { Pool } = pg;

// ── CLI flags ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN   = args.includes("--dry-run");
const SONGS_PER = parseInt(args[args.indexOf("--songs") + 1] || "8", 10);

// ── Pre-approved artist list ──────────────────────────────────────────────────
// Add artists here to include them in auto-mining.
// Priority order — most culturally dense first.
// "songs" overrides SONGS_PER for that specific artist.
const APPROVED_ARTISTS = [
  // Wu-Tang / Staten Island universe
  { name: "Ghostface Killah",    songs: 20,  priority: 1 },
  { name: "Raekwon",             songs: 20,  priority: 1 },
  { name: "GZA",                 songs: 20,  priority: 1 },
  { name: "Method Man",          songs: 20,  priority: 1 },
  { name: "Inspectah Deck",      songs: 20,  priority: 1 },

  // Dipset / Harlem universe
  { name: "Cam'ron",             songs: 20,  priority: 1 },
  { name: "Juelz Santana",       songs: 12,  priority: 2 },
  { name: "Jim Jones",           songs: 12,  priority: 2 },

  // Griselda / Buffalo universe
  { name: "Westside Gunn",       songs: 20,  priority: 1 },
  { name: "Mach-Hommy",          songs: 20,  priority: 1 },
  { name: "Conway the Machine",  songs: 20,  priority: 1 },
  { name: "Benny the Butcher",   songs: 12,  priority: 2 },

  // Atlanta universe
  { name: "Andre 3000",          songs: 20,  priority: 1 },
  { name: "Big Boi",             songs: 12,  priority: 2, artistId: 318 },
  { name: "Gucci Mane",          songs: 12,  priority: 2 },
  { name: "Young Jeezy",         songs: 12,  priority: 2, artistId: 67, geniusName: "Jeezy" },

  // NYC / Jay-Z universe
  { name: "Kanye West",          songs: 20,  priority: 1 },
  { name: "Nas",                 songs: 20,  priority: 1 },
  { name: "AZ",                  songs: 12,  priority: 2 },
  { name: "Foxy Brown",          songs: 6,  priority: 3 },

  // Philly universe
  { name: "Beanie Sigel",        songs: 12,  priority: 2 },
  { name: "Freeway",             songs: 6,  priority: 3 },
  { name: "Black Thought",       songs: 20,  priority: 1 },

  // West Coast
  { name: "Kendrick Lamar",      songs: 20,  priority: 1 },
  { name: "Nipsey Hussle",       songs: 12,  priority: 2 },
  { name: "Dom Kennedy",         songs: 6,  priority: 3 },

  // Individual icons
  { name: "Big L",               songs: 20,  priority: 1 },
  { name: "Big Pun",             songs: 20,  priority: 1 },
  { name: "MF DOOM",             songs: 20,  priority: 1, artistId: 70 },
  { name: "Lupe Fiasco",         songs: 12,  priority: 2 },
  { name: "Vince Staples",       songs: 12,  priority: 2 },
  { name: "JID",                 songs: 12,  priority: 2 },

  // ── Wave 2 ────────────────────────────────────────────────────────────────

  // NYC legends (more catalog depth)
  { name: "Notorious B.I.G.",    songs: 20,  priority: 1, artistId: 10617 },
  { name: "Jay-Z",               songs: 20,  priority: 1, artistId: 2 },
  { name: "Eminem",              songs: 20,  priority: 1 },
  { name: "DMX",                 songs: 12,  priority: 2 },
  { name: "Jadakiss",            songs: 12,  priority: 2 },
  { name: "Styles P",            songs: 12,  priority: 2 },
  { name: "Sheek Louch",         songs: 6,  priority: 3 },

  // Brooklyn underground
  { name: "Buckshot",            songs: 6,  priority: 3 },

  // West Coast expansion
  { name: "Snoop Dogg",          songs: 12,  priority: 2 },
  { name: "Ice Cube",            songs: 20,  priority: 1 },
  { name: "E-40",                songs: 6,  priority: 3 },
  { name: "Too $hort",           songs: 6,  priority: 3 },
  { name: "ScHoolboy Q",         songs: 12,  priority: 2 },
  { name: "Ab-Soul",             songs: 12,  priority: 2 },
  { name: "Jay Rock",            songs: 6,  priority: 3 },

  // Houston / Dirty South
  { name: "UGK",                 songs: 12,  priority: 2 },
  { name: "Z-Ro",                songs: 6,  priority: 3 },
  { name: "Scarface",            songs: 20,  priority: 1 },
  { name: "T.I.",                songs: 12,  priority: 2 },
  { name: "2 Chainz",            songs: 6,  priority: 3 },
  { name: "21 Savage",           songs: 6,  priority: 3 },

  // Detroit / Midwest
  { name: "Royce da 5'9\"",       songs: 20,  priority: 1 },
  { name: "Big Sean",            songs: 6,  priority: 3 },
  { name: "Childish Gambino",    songs: 6,  priority: 3 },

  // New school / current
  { name: "Pusha T",             songs: 20,  priority: 1 },
  { name: "Freddie Gibbs",       songs: 20,  priority: 1 },
  { name: "Boldy James",         songs: 12,  priority: 2 },
  { name: "Ransom",              songs: 12,  priority: 2 },
  { name: "Roc Marciano",        songs: 12,  priority: 2 },
  { name: "Ka",                  songs: 12,  priority: 2 },
  { name: "billy woods",         songs: 12,  priority: 2 },
  { name: "JPEGMAFIA",           songs: 6,  priority: 3 },
  { name: "Danny Brown",         songs: 12,  priority: 2 },
  { name: "Open Mike Eagle",     songs: 6,  priority: 3 },
  { name: "Oddisee",             songs: 6,  priority: 3 },

  // Golden era / boom bap
  { name: "KRS-One",             songs: 20,  priority: 1 },
  { name: "Big Daddy Kane",      songs: 20,  priority: 1 },
  { name: "Slick Rick",          songs: 20,  priority: 1 },
  { name: "LL Cool J",           songs: 12,  priority: 2 },
  { name: "EPMD",                songs: 12,  priority: 2 },
  { name: "Gang Starr",          songs: 20,  priority: 1 },
  { name: "Guru",                songs: 12,  priority: 2 },
  { name: "Common",              songs: 20,  priority: 1 },
  { name: "Yasiin Bey",          songs: 20,  priority: 1 },
  { name: "Dead Prez",           songs: 12,  priority: 2 },
  { name: "Mobb Deep",           songs: 20,  priority: 1 },
  { name: "Prodigy",             songs: 20,  priority: 1 },
  { name: "Havoc",               songs: 12,  priority: 2 },
  { name: "Noreaga",             songs: 6,  priority: 3 },
  { name: "Big Noyd",            songs: 6,  priority: 3 },
  { name: "Cormega",             songs: 12,  priority: 2 },
  { name: "Nature",              songs: 6,  priority: 3 },

  // ── Wave 3 ────────────────────────────────────────────────────────────────

  // NYC / East Coast depth
  { name: "Rakim",               songs: 20, priority: 1 },
  { name: "Big L",               songs: 20, priority: 1 },
  { name: "Big Pun",             songs: 20, priority: 1 },
  { name: "Fat Joe",             songs: 12,  priority: 2 },
  { name: "Kool G Rap",          songs: 20,  priority: 1 },
  { name: "Queensbridge",        songs: 12,  priority: 2 },
  { name: "Tragedy Khadafi",     songs: 12,  priority: 2 },
  { name: "Capone-N-Noreaga",    songs: 12,  priority: 2 },
  { name: "Heltah Skeltah",      songs: 12,  priority: 2 },
  { name: "Smif-N-Wessun",       songs: 12,  priority: 2 },
  { name: "Black Moon",          songs: 12,  priority: 2 },
  { name: "Masta Ace",           songs: 12,  priority: 2 },
  { name: "O.C.",                songs: 12,  priority: 2 },
  { name: "Chino XL",            songs: 12,  priority: 2 },
  { name: "Saigon",              songs: 12,  priority: 2 },
  { name: "Papoose",             songs: 12,  priority: 2 },
  { name: "Joell Ortiz",         songs: 12,  priority: 2 },

  // LOX / Yonkers
  { name: "Jadakiss",            songs: 12,  priority: 2 },

  // Dipset depth
  { name: "Hell Rell",           songs: 6,  priority: 3 },
  { name: "Jha Jha",             songs: 4,  priority: 3 },

  // Roc-A-Fella era
  { name: "Beanie Sigel",        songs: 12,  priority: 2 },
  { name: "Memphis Bleek",       songs: 6,  priority: 3 },
  { name: "Peedi Crakk",         songs: 6,  priority: 3 },

  // Bad Boy era
  { name: "Lil Kim",             songs: 12,  priority: 2 },
  { name: "Ma$e",                songs: 6,  priority: 3 },
  { name: "Black Rob",           songs: 6,  priority: 3 },

  // Death Row / West Coast golden era
  { name: "2Pac",                songs: 20, priority: 1 },
  { name: "Dr. Dre",             songs: 20,  priority: 1 },
  { name: "Kurupt",              songs: 12,  priority: 2 },
  { name: "Daz Dillinger",       songs: 6,  priority: 3 },
  { name: "Xzibit",              songs: 12,  priority: 2 },
  { name: "Tha Dogg Pound",      songs: 12,  priority: 2 },
  { name: "MC Eiht",             songs: 12,  priority: 2 },
  { name: "Spice 1",             songs: 12,  priority: 2 },
  { name: "Brotha Lynch Hung",   songs: 12,  priority: 2 },

  // Bay Area
  { name: "Richie Rich",         songs: 6,  priority: 3 },
  { name: "San Quinn",           songs: 6,  priority: 3 },
  { name: "Equipto",             songs: 6,  priority: 3 },

  // Houston depth
  { name: "Bun B",               songs: 20,  priority: 1 },
  { name: "Pimp C",              songs: 20,  priority: 1 },
  { name: "Slim Thug",           songs: 12,  priority: 2 },
  { name: "Paul Wall",           songs: 6,  priority: 3 },
  { name: "Chamillionaire",      songs: 12,  priority: 2 },
  { name: "Trae the Truth",      songs: 12,  priority: 2 },
  { name: "Big Moe",             songs: 6,  priority: 3 },

  // New Orleans
  { name: "Juvenile",            songs: 12,  priority: 2 },
  { name: "Lil Wayne",           songs: 20, priority: 1 },
  { name: "Birdman",             songs: 6,  priority: 3 },
  { name: "Turk",                songs: 6,  priority: 3 },

  // Atlanta depth
  { name: "Ludacris",            songs: 12,  priority: 2 },
  { name: "Lil Jon",             songs: 6,  priority: 3 },
  { name: "Crime Mob",           songs: 6,  priority: 3 },
  { name: "Killer Mike",         songs: 20,  priority: 1 },
  { name: "El-P",                songs: 20,  priority: 1 },
  { name: "Future",              songs: 12,  priority: 2 },
  { name: "Young Thug",          songs: 12,  priority: 2 },
  { name: "Quavo",               songs: 6,  priority: 3 },
  { name: "Offset",              songs: 6,  priority: 3 },
  { name: "Takeoff",             songs: 6,  priority: 3 },
  { name: "Lil Baby",            songs: 12,  priority: 2 },
  { name: "Gunna",               songs: 6,  priority: 3 },
  { name: "Playboi Carti",       songs: 6,  priority: 3 },

  // Chicago
  { name: "Common",              songs: 20,  priority: 1 },
  { name: "Chance the Rapper",   songs: 12,  priority: 2 },
  { name: "Saba",                songs: 12,  priority: 2 },
  { name: "Noname",              songs: 12,  priority: 2 },
  { name: "Mick Jenkins",        songs: 12,  priority: 2 },
  { name: "G Herbo",             songs: 12,  priority: 2 },
  { name: "Polo G",              songs: 6,  priority: 3 },
  { name: "Lil Durk",            songs: 6,  priority: 3 },

  // Detroit depth
  { name: "Big Proof",           songs: 12,  priority: 2 },
  { name: "Elzhi",               songs: 12,  priority: 2 },
  { name: "Black Milk",          songs: 12,  priority: 2 },
  { name: "Guilty Simpson",      songs: 6,  priority: 3 },
  { name: "Dej Loaf",            songs: 6,  priority: 3 },

  // Midwest / other regions
  { name: "Tech N9ne",           songs: 12,  priority: 2 },
  { name: "Brotha Lynch Hung",   songs: 12,  priority: 2 },
  { name: "Rittz",               songs: 6,  priority: 3 },
  { name: "Atmosphere",          songs: 12,  priority: 2 },
  { name: "Brother Ali",         songs: 12,  priority: 2 },

  // UK rap / grime (crossover artists)
  { name: "Giggs",               songs: 6,  priority: 3 },
  { name: "Skepta",              songs: 6,  priority: 3 },
  { name: "Stormzy",             songs: 6,  priority: 3 },

  // Women in rap
  { name: "Nicki Minaj",         songs: 12,  priority: 2 },
  { name: "Cardi B",             songs: 6,  priority: 3 },
  { name: "Rapsody",             songs: 12,  priority: 2 },
  { name: "Jean Grae",           songs: 12,  priority: 2 },
  { name: "Bahamadia",           songs: 12,  priority: 2 },
  { name: "MC Lyte",             songs: 20,  priority: 1 },
  { name: "Queen Latifah",       songs: 12,  priority: 2 },

  // Conscious / underground
  { name: "Talib Kweli",         songs: 20,  priority: 1 },
  { name: "Immortal Technique",  songs: 20,  priority: 1 },
  { name: "Killer Mike",         songs: 20,  priority: 1 },
  { name: "Aesop Rock",          songs: 12,  priority: 2 },
  { name: "Eyedea",              songs: 12,  priority: 2 },
  { name: "Slug",                songs: 6,  priority: 3 },
  { name: "Sage Francis",        songs: 6,  priority: 3 },
  { name: "Sole",                songs: 6,  priority: 3 },

  // Griselda depth
  { name: "Armani Caesar",       songs: 12,  priority: 2 },
  { name: "Rome Streetz",        songs: 12,  priority: 2 },
  { name: "Stove God Cooks",     songs: 12,  priority: 2 },

  // ── 10k push additions ────────────────────────────────────────────────────
  // Technical elite (calibration anchors — should score high)
  { name: "Pharoahe Monch",       songs: 20,  priority: 1 },
  { name: "Canibus",              songs: 20,  priority: 1 },
  { name: "Organized Konfusion",  songs: 12,  priority: 2 },
  { name: "KXNG Crooked",         songs: 20,  priority: 1 },
  { name: "Vinnie Paz",           songs: 12,  priority: 2 },
  { name: "Immortal Technique",   songs: 12,  priority: 2 },
  { name: "Heem",                 songs: 6,  priority: 3 },
  { name: "Elcamino",             songs: 6,  priority: 3 },
  { name: "Ransom",               songs: 12,  priority: 2 },
  { name: "Rapsody",              songs: 12,  priority: 2 },
  { name: "Cordae",               songs: 12,  priority: 2 },
  { name: "Lauryn Hill",          songs: 20,  priority: 1 },
  { name: "Queen Latifah",        songs: 12,  priority: 2 },
  { name: "MC Lyte",              songs: 12,  priority: 2 },
  { name: "Noname",               songs: 12,  priority: 2 },
  { name: "Saba",                 songs: 12,  priority: 2 },
  { name: "Mick Jenkins",         songs: 12,  priority: 2 },
  { name: "Tierra Whack",         songs: 12,  priority: 2 },
  // Mid-tier contrast (should score 60-72 — needed for suppression calibration)
  { name: "Lil Baby",             songs: 12,  priority: 2 },
  { name: "NBA YoungBoy",         songs: 12,  priority: 2 },
  { name: "Fivio Foreign",        songs: 6,  priority: 3 },
  { name: "Sheff G",              songs: 6,  priority: 3 },
  { name: "Plies",                songs: 6,  priority: 3 },
  { name: "Yo Gotti",             songs: 6,  priority: 3 },
  { name: "Boosie Badazz",        songs: 6,  priority: 3 },
  { name: "EST Gee",              songs: 6,  priority: 3 },
  { name: "Jack Harlow",          songs: 6,  priority: 3 },
  { name: "Nicki Minaj",          songs: 12,  priority: 2 },
  { name: "Cardi B",              songs: 6,  priority: 3 },
  { name: "Smino",                songs: 6,  priority: 3 },
  { name: "Aminé",                songs: 6,  priority: 3 },
  { name: "Injury Reserve",       songs: 6,  priority: 3 },
];

// ── Genius API ────────────────────────────────────────────────────────────────
function geniusGet(endpoint) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.genius.com",
      path: endpoint,
      headers: { Authorization: `Bearer ${process.env.GENIUS_TOKEN}` },
    };
    https.get(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`Genius parse failed`)); }
      });
    }).on("error", reject);
  });
}

async function searchArtistId(name) {
  const res = await geniusGet(`/search?q=${encodeURIComponent(name)}`);
  const hits = res.response?.hits || [];
  for (const hit of hits) {
    const a = hit.result?.primary_artist;
    if (a && a.name.toLowerCase().includes(name.toLowerCase().split(" ")[0])) return a.id;
  }
  return hits[0]?.result?.primary_artist?.id || null;
}

async function getTopSongs(artistId, count) {
  const res = await geniusGet(`/artists/${artistId}/songs?sort=popularity&per_page=${count}`);
  return res.response?.songs || [];
}

function fetchLyricsPage(url) {
  return new Promise((resolve) => {
    const urlObj = new URL(url);
    https.get({ hostname: urlObj.hostname, path: urlObj.pathname,
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "text/html" }
    }, (res) => {
      let html = "";
      res.on("data", chunk => html += chunk);
      res.on("end", () => {
        const matches = [...html.matchAll(/data-lyrics-container[^>]*>([\s\S]*?)<\/div>/g)];
        if (!matches.length) { resolve(""); return; }
        let lyrics = matches.map(m => m[1]).join("\n");
        lyrics = lyrics.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "");
        lyrics = lyrics.replace(/&amp;/g,"&").replace(/&#x27;/g,"'").replace(/&quot;/g,'"');
        resolve(lyrics.trim());
      });
    }).on("error", () => resolve(""));
  });
}

// ── Run lyric-miner as subprocess for each artist ────────────────────────────
function runMiner(artistName, songCount, outDir, { artistId, geniusName } = {}) {
  const env = {
    ...process.env,
    GENIUS_TOKEN: process.env.GENIUS_TOKEN,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
    // API_BASE tells the miner where to send scoring requests
    // Falls back to Railway production URL if not explicitly set
    API_BASE: process.env.API_BASE || "https://rhymemath-production.up.railway.app",
  };

  // Build flags — use artistId to bypass Genius name search when provided
  // geniusName overrides the search string (for name mismatches like Young Jeezy → Jeezy)
  const parts = ["node", "scripts/lyric-miner.mjs"];
  if (artistId) {
    parts.push("--artist-id", String(artistId));
    // Still need --artist for canonical name used in DB writes
    parts.push("--artist", `"${artistName}"`);
  } else if (geniusName) {
    parts.push("--artist", `"${geniusName}"`);
  } else {
    parts.push("--artist", `"${artistName}"`);
  }
  parts.push("--songs", String(songCount));
  parts.push("--outdir", `"${outDir}"`);
  parts.push("--analyze");  // score and write every verse to analyses table

  const cmd = parts.join(" ");

  try {
    // 10 min timeout — 12 songs × 4 sections × ~3s scoring + fetch time
    const output = execSync(cmd, { env, encoding: "utf8", timeout: 600000 });
    return { success: true, output };
  } catch (e) {
    return { success: false, output: e.message };
  }
}

// ── Run cid-import as subprocess ─────────────────────────────────────────────
function runImport(dir) {
  try {
    const output = execSync(
      `node scripts/cid-import.mjs --dir "${dir}"`,
      { env: process.env, encoding: "utf8", timeout: 60000 }
    );
    return { success: true, output };
  } catch (e) {
    return { success: false, output: e.message };
  }
}

// ── Run cid-rescore ───────────────────────────────────────────────────────────
function runRescore() {
  try {
    const output = execSync(
      `node scripts/cid-rescore.mjs --force`,
      { env: process.env, encoding: "utf8", timeout: 120000 }
    );
    return { success: true, output };
  } catch (e) {
    return { success: false, output: e.message };
  }
}

// ── Check last mine date from cid_sync_log ───────────────────────────────────
async function getLastMinedArtists(pool, daysBack = 3) {
  try {
    const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
    const res = await pool.query(
      `SELECT source_ref FROM cid_sync_log
       WHERE sync_type = 'lyric_mine' AND started_at > $1`,
      [cutoff]
    );
    return new Set(res.rows.map(r => r.source_ref?.toLowerCase()));
  } catch {
    return new Set();
  }
}

async function logMine(pool, artistName, status, newRecords) {
  try {
    await pool.query(
      `INSERT INTO cid_sync_log (sync_type, source_ref, status, records_added, started_at, completed_at)
       VALUES ('lyric_mine', $1, $2, $3, NOW(), NOW())`,
      [artistName, status, newRecords]
    );
  } catch { /* non-fatal */ }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n╔═══════════════════════════════════════════════════╗`);
  console.log(`║  PH Labs CID Auto-Mine Bot                        ║`);
  console.log(`║  ${new Date().toISOString().replace("T"," ").slice(0,19).padEnd(47)}║`);
  console.log(`║  ${DRY_RUN ? "DRY RUN — no DB writes".padEnd(47) : "LIVE RUN — writing to Railway".padEnd(47)}║`);
  console.log(`╚═══════════════════════════════════════════════════╝\n`);

  if (!process.env.GENIUS_TOKEN) {
    console.error("Error: GENIUS_TOKEN env var required.");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  // Cooldown: skip artists mined recently
  // CONTINUOUS=1  → bypass entirely (same as COOLDOWN_DAYS=0)
  // COOLDOWN_DAYS  → override default 3-day window
  // FORCE_ALL=1   → explicit bypass flag
  const CONTINUOUS = process.env.CONTINUOUS === '1';
  const COOLDOWN_DAYS = CONTINUOUS ? 0 : parseFloat(process.env.COOLDOWN_DAYS ?? '3');
  const FORCE_ALL = process.env.FORCE_ALL === '1' || COOLDOWN_DAYS === 0 || CONTINUOUS;

  let artists;
  if (FORCE_ALL) {
    artists = APPROVED_ARTISTS.sort((a, b) => a.priority - b.priority);
    console.log(`Artists to mine this run: ${artists.length} (FORCE_ALL — cooldown bypassed)\n`);
  } else {
    const recentlyMined = await getLastMinedArtists(pool, COOLDOWN_DAYS);
    artists = APPROVED_ARTISTS
      .sort((a, b) => a.priority - b.priority)
      .filter(a => !recentlyMined.has(a.name.toLowerCase()));
    console.log(`Artists to mine this run: ${artists.length} (${APPROVED_ARTISTS.length - artists.length} skipped, cooldown ${COOLDOWN_DAYS}d)\n`);
  }

  const tmpBase = `/tmp/cid_automine_${Date.now()}`;
  fs.mkdirSync(tmpBase, { recursive: true });

  let totalNewRecords = 0;
  let artistsProcessed = 0;

  for (const artist of artists) {
    const songs = artist.songs || SONGS_PER;
    const outDir = path.join(tmpBase, artist.name.replace(/[^a-z0-9]/gi, "_"));
    fs.mkdirSync(outDir, { recursive: true });

    process.stdout.write(`\n[${++artistsProcessed}/${artists.length}] ${artist.name} (${songs} songs)... `);

    const mineResult = runMiner(artist.name, songs, outDir, { artistId: artist.artistId, geniusName: artist.geniusName });
    if (!mineResult.success) {
      console.log(`FAILED — ${mineResult.output.slice(0, 80)}`);
      await logMine(pool, artist.name, "error", 0);
      continue;
    }

    // Count records in output CSV
    const recordsFile = path.join(outDir, "v5_4_mined_refs.csv");
    let newRecordCount = 0;
    if (fs.existsSync(recordsFile)) {
      const lines = fs.readFileSync(recordsFile, "utf8").split("\n").filter(Boolean);
      newRecordCount = Math.max(0, lines.length - 1); // subtract header
    }

    console.log(`${newRecordCount} new records`);

    if (!DRY_RUN && newRecordCount > 0) {
      const importResult = runImport(outDir);
      if (!importResult.success) {
        console.log(`  Import failed: ${importResult.output.slice(0, 100)}`);
        await logMine(pool, artist.name, "import_error", 0);
        continue;
      }
      totalNewRecords += newRecordCount;
    }

    // Import figures extracted by lyric-miner
    const figuresFile = path.join(outDir, "v5_4_figures.json");
    if (!DRY_RUN && fs.existsSync(figuresFile)) {
      try {
        const rawFigs = JSON.parse(fs.readFileSync(figuresFile, "utf8"));
        let figCount = 0;
        for (const fig of rawFigs) {
          if (!fig.figure_name) continue;
          // Upsert as candidate (never auto-approve miner output)
          await pool.query(`
            INSERT INTO cid_figures
              (figure_name, figure_type, domains, cultural_context, scandal_summary, era, source, review_status)
            VALUES ($1,$2,$3,$4,$5,$6,'miner','candidate')
            ON CONFLICT (figure_name) DO NOTHING
          `, [
            fig.figure_name.trim(),
            fig.figure_type || 'person',
            JSON.stringify(fig.domains || []),
            fig.cultural_context || null,
            fig.scandal_summary || null,
            fig.era || null,
          ]);
          figCount++;
        }
        if (figCount > 0) console.log(`  ➕ ${figCount} figure candidate(s) queued for CID review`);
      } catch (e) {
        console.warn(`  figures import skipped: ${e.message}`);
      }
    }

    await logMine(pool, artist.name, DRY_RUN ? "dry_run" : "success", newRecordCount);

    // Brief pause between artists
    await new Promise(r => setTimeout(r, 1500));
  }

  // Rescore after all imports
  if (!DRY_RUN && totalNewRecords > 0) {
    // Clear CID cache on Railway so new entendres/punchlines fire immediately
    try {
      const apiBase = process.env.API_BASE || "http://localhost:5000";
      const cacheRes = await fetch(`${apiBase}/api/cid/cache-clear`, { method: 'POST' });
      console.log(`\nCID cache cleared: ${cacheRes.ok ? 'OK' : 'failed'}`);
    } catch { console.log('\nCID cache-clear skipped (non-fatal)'); }

    console.log(`\nRescoring all analyses with ${totalNewRecords} new CID records...`);
    const rescoreResult = runRescore();
    if (rescoreResult.success) {
      console.log("Rescore complete.");
    } else {
      console.log(`Rescore failed: ${rescoreResult.output.slice(0, 100)}`);
    }
  }

  // Cleanup temp files
  try { fs.rmSync(tmpBase, { recursive: true }); } catch {}

  console.log(`\n─────────────────────────────────────────────────────`);
  console.log(`  Auto-mine complete`);
  console.log(`  Artists processed: ${artistsProcessed}`);
  console.log(`  New records added: ${DRY_RUN ? "(dry run)" : totalNewRecords}`);
  console.log(`  Next run: in ~3 days (or trigger manually)`);
  console.log(`─────────────────────────────────────────────────────\n`);

  await pool.end();
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
