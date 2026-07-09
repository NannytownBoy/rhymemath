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
  { name: "Ghostface Killah",    songs: 8,  priority: 1 },
  { name: "Raekwon",             songs: 8,  priority: 1 },
  { name: "GZA",                 songs: 8,  priority: 1 },
  { name: "Method Man",          songs: 8,  priority: 1 },
  { name: "Inspectah Deck",      songs: 8,  priority: 1 },

  // Dipset / Harlem universe
  { name: "Cam'ron",             songs: 8,  priority: 1 },
  { name: "Juelz Santana",       songs: 8,  priority: 2 },
  { name: "Jim Jones",           songs: 8,  priority: 2 },

  // Griselda / Buffalo universe
  { name: "Westside Gunn",       songs: 8,  priority: 1 },
  { name: "Mach-Hommy",          songs: 8,  priority: 1 },
  { name: "Conway the Machine",  songs: 8,  priority: 1 },
  { name: "Benny the Butcher",   songs: 8,  priority: 2 },

  // Atlanta universe
  { name: "Andre 3000",          songs: 8,  priority: 1 },
  { name: "Big Boi",             songs: 8,  priority: 2, artistId: 318 },
  { name: "Gucci Mane",          songs: 8,  priority: 2 },
  { name: "Young Jeezy",         songs: 8,  priority: 2, artistId: 67, geniusName: "Jeezy" },

  // NYC / Jay-Z universe
  { name: "Kanye West",          songs: 8,  priority: 1 },
  { name: "Nas",                 songs: 8,  priority: 1 },
  { name: "AZ",                  songs: 8,  priority: 2 },
  { name: "Foxy Brown",          songs: 6,  priority: 3 },

  // Philly universe
  { name: "Beanie Sigel",        songs: 8,  priority: 2 },
  { name: "Freeway",             songs: 6,  priority: 3 },
  { name: "Black Thought",       songs: 8,  priority: 1 },

  // West Coast
  { name: "Kendrick Lamar",      songs: 8,  priority: 1 },
  { name: "Nipsey Hussle",       songs: 8,  priority: 2 },
  { name: "Dom Kennedy",         songs: 6,  priority: 3 },

  // Individual icons
  { name: "Big L",               songs: 8,  priority: 1 },
  { name: "Big Pun",             songs: 6,  priority: 1 },
  { name: "MF DOOM",             songs: 8,  priority: 1, artistId: 70 },
  { name: "Lupe Fiasco",         songs: 8,  priority: 2 },
  { name: "Vince Staples",       songs: 6,  priority: 2 },
  { name: "JID",                 songs: 6,  priority: 2 },

  // ── Wave 2 ────────────────────────────────────────────────────────────────

  // NYC legends (more catalog depth)
  { name: "Notorious B.I.G.",    songs: 8,  priority: 1, artistId: 10617 },
  { name: "Jay-Z",               songs: 8,  priority: 1, artistId: 2 },
  { name: "Eminem",              songs: 8,  priority: 1 },
  { name: "DMX",                 songs: 8,  priority: 2 },
  { name: "Jadakiss",            songs: 8,  priority: 2 },
  { name: "Styles P",            songs: 6,  priority: 2 },
  { name: "Sheek Louch",         songs: 6,  priority: 3 },

  // Brooklyn underground
  { name: "Buckshot",            songs: 6,  priority: 3 },

  // West Coast expansion
  { name: "Snoop Dogg",          songs: 8,  priority: 2 },
  { name: "Ice Cube",            songs: 8,  priority: 1 },
  { name: "E-40",                songs: 6,  priority: 3 },
  { name: "Too $hort",           songs: 6,  priority: 3 },
  { name: "ScHoolboy Q",         songs: 8,  priority: 2 },
  { name: "Ab-Soul",             songs: 8,  priority: 2 },
  { name: "Jay Rock",            songs: 6,  priority: 3 },

  // Houston / Dirty South
  { name: "UGK",                 songs: 6,  priority: 2 },
  { name: "Z-Ro",                songs: 6,  priority: 3 },
  { name: "Scarface",            songs: 8,  priority: 1 },
  { name: "T.I.",                songs: 8,  priority: 2 },
  { name: "2 Chainz",            songs: 6,  priority: 3 },
  { name: "21 Savage",           songs: 6,  priority: 3 },

  // Detroit / Midwest
  { name: "Royce da 5'9\"",       songs: 8,  priority: 1 },
  { name: "Big Sean",            songs: 6,  priority: 3 },
  { name: "Childish Gambino",    songs: 6,  priority: 3 },

  // New school / current
  { name: "Pusha T",             songs: 8,  priority: 1 },
  { name: "Freddie Gibbs",       songs: 8,  priority: 1 },
  { name: "Boldy James",         songs: 6,  priority: 2 },
  { name: "Ransom",              songs: 6,  priority: 2 },
  { name: "Roc Marciano",        songs: 6,  priority: 2 },
  { name: "Ka",                  songs: 6,  priority: 2 },
  { name: "billy woods",         songs: 6,  priority: 2 },
  { name: "JPEGMAFIA",           songs: 6,  priority: 3 },
  { name: "Danny Brown",         songs: 6,  priority: 2 },
  { name: "Open Mike Eagle",     songs: 6,  priority: 3 },
  { name: "Oddisee",             songs: 6,  priority: 3 },

  // Golden era / boom bap
  { name: "KRS-One",             songs: 8,  priority: 1 },
  { name: "Big Daddy Kane",      songs: 8,  priority: 1 },
  { name: "Slick Rick",          songs: 8,  priority: 1 },
  { name: "LL Cool J",           songs: 6,  priority: 2 },
  { name: "EPMD",                songs: 6,  priority: 2 },
  { name: "Gang Starr",          songs: 8,  priority: 1 },
  { name: "Guru",                songs: 6,  priority: 2 },
  { name: "Common",              songs: 8,  priority: 1 },
  { name: "Yasiin Bey",          songs: 8,  priority: 1 },
  { name: "Dead Prez",           songs: 6,  priority: 2 },
  { name: "Mobb Deep",           songs: 8,  priority: 1 },
  { name: "Prodigy",             songs: 8,  priority: 1 },
  { name: "Havoc",               songs: 6,  priority: 2 },
  { name: "Noreaga",             songs: 6,  priority: 3 },
  { name: "Big Noyd",            songs: 6,  priority: 3 },
  { name: "Cormega",             songs: 6,  priority: 2 },
  { name: "Nature",              songs: 6,  priority: 3 },
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

  // Skip artists mined in the last 3 days
  const recentlyMined = await getLastMinedArtists(pool);
  const artists = APPROVED_ARTISTS
    .sort((a, b) => a.priority - b.priority)
    .filter(a => !recentlyMined.has(a.name.toLowerCase()));

  console.log(`Artists to mine this run: ${artists.length} (${APPROVED_ARTISTS.length - artists.length} skipped, mined recently)\n`);

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

    await logMine(pool, artist.name, DRY_RUN ? "dry_run" : "success", newRecordCount);

    // Brief pause between artists
    await new Promise(r => setTimeout(r, 1500));
  }

  // Rescore after all imports
  if (!DRY_RUN && totalNewRecords > 0) {
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
