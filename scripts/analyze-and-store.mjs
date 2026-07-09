/**
 * analyze-and-store.mjs
 * PH Labs RhymeMath v5 — Analyze-and-Store Pipeline
 *
 * Takes a song (artist, title, lyrics, source metadata) and:
 *   1. Splits lyrics into sections (verse_1, hook, bridge, etc.)
 *   2. Deduplicates via SHA-256 text hash
 *   3. Scores each section using the shared server scoring engine
 *   4. Persists to analyses table with full provenance
 *
 * Usage (standalone):
 *   DATABASE_URL="..." node scripts/analyze-and-store.mjs \
 *     --artist "Ghostface Killah" --title "Cherchez LaGhost" \
 *     --file "/path/to/lyrics.txt" --source genius --source-id 12345
 *
 * Importable:
 *   import { analyzeAndStore } from "./analyze-and-store.mjs";
 *   await analyzeAndStore({ artist, title, lyrics, source, sourceId, db });
 */

import pg from "pg";
import crypto from "crypto";
import path from "path";
import fs from "fs";

const { Pool } = pg;

// ── Section detection ─────────────────────────────────────────────────────────

const SECTION_PATTERNS = [
  // Explicit verse markers
  { re: /^\[?verse\s*1\]?/i,    label: "verse_1", index: 1 },
  { re: /^\[?verse\s*2\]?/i,    label: "verse_2", index: 2 },
  { re: /^\[?verse\s*3\]?/i,    label: "verse_3", index: 3 },
  { re: /^\[?verse\s*4\]?/i,    label: "verse_4", index: 4 },
  { re: /^\[?verse\]?/i,        label: "verse_1", index: 1 },
  // Hook / chorus
  { re: /^\[?(?:hook|chorus)\]?/i, label: "hook", index: null },
  // Bridge
  { re: /^\[?bridge\]?/i,       label: "bridge", index: null },
  // Intro / outro
  { re: /^\[?intro\]?/i,        label: "intro", index: null },
  { re: /^\[?outro\]?/i,        label: "outro", index: null },
  { re: /^\[?interlude\]?/i,    label: "interlude", index: null },
  // Pre-hook
  { re: /^\[?pre[\s-]?(?:hook|chorus)\]?/i, label: "pre_hook", index: null },
];

/**
 * Detect section label from a header line.
 * Returns { label, index } or null if not a section header.
 */
function detectSectionHeader(line) {
  const trimmed = line.trim();
  // Must start with [ or be an ALL-CAPS short line or match pattern
  if (!trimmed) return null;
  for (const { re, label, index } of SECTION_PATTERNS) {
    if (re.test(trimmed)) return { label, index };
  }
  return null;
}

/**
 * Split full song lyrics into labeled sections.
 * Returns array of { label, index, lines[] }
 */
function splitIntoSections(rawLyrics) {
  const allLines = rawLyrics.split(/\r?\n/);
  const sections = [];
  let current = null;
  let autoVerseCount = 0;

  for (const line of allLines) {
    const header = detectSectionHeader(line);
    if (header) {
      if (current && current.lines.length > 0) sections.push(current);
      current = { label: header.label, index: header.index, lines: [] };
    } else if (line.trim()) {
      if (!current) {
        // No header yet — auto-label as first verse
        autoVerseCount++;
        current = { label: `verse_${autoVerseCount}`, index: autoVerseCount, lines: [] };
      }
      current.lines.push(line);
    } else {
      // Blank line — could be section break without header
      if (current && current.lines.length > 0) {
        // Check if next non-blank line looks like a new verse (heuristic: 2+ blank lines = new section)
        current.lines.push(""); // preserve internal blank lines within section
      }
    }
  }

  if (current && current.lines.filter(l => l.trim()).length > 0) {
    sections.push(current);
  }

  // If no sections were detected, treat entire lyrics as one unknown section
  if (!sections.length && rawLyrics.trim()) {
    const lines = rawLyrics.split(/\r?\n/).filter(l => l.trim());
    sections.push({ label: "unknown", index: null, lines });
  }

  // Clean up: remove trailing blank lines from each section
  return sections.map(s => ({
    ...s,
    lines: s.lines.filter((l, i, arr) => {
      if (l.trim()) return true;
      // Keep internal blanks but strip trailing
      return arr.slice(i + 1).some(ll => ll.trim());
    }),
    text: s.lines.filter(l => l.trim()).join("\n"),
  })).filter(s => s.text.trim().length > 10 && s.lines.filter(l => l.trim()).length >= 2);
}

// ── Text normalization + hashing ──────────────────────────────────────────────

function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "") // strip punctuation
    .replace(/\s+/g, " ")
    .trim();
}

function hashText(text) {
  return crypto.createHash("sha256").update(normalizeText(text)).digest("hex");
}

// ── Scoring via server-side engine ────────────────────────────────────────────
// Import the compiled server scoring functions
// We call the REST API endpoint so we don't need to re-import TS from mjs

async function scoreVerseViaAPI(artist, title, verse, sectionLabel) {
  const PORT = process.env.PORT || 5000;
  const BASE = process.env.API_BASE || `http://localhost:${PORT}`;

  try {
    const res = await fetch(`${BASE}/api/solo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        artistName: artist,
        songTitle: title,
        verse,
        verseLabel: sectionLabel || "unknown",
        save: false, // we handle persistence ourselves
      }),
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    return await res.json();
  } catch (e) {
    return null;
  }
}

// ── Core analyze-and-store function ──────────────────────────────────────────

export async function analyzeAndStore({
  artist,
  title,
  lyrics,
  source = "manual",
  sourceId = null,
  db,            // pg Pool instance — caller provides
  scoringVersion = "v5.0",
  dryRun = false,
  verbose = true,
}) {
  const sections = splitIntoSections(lyrics);
  const results = [];

  if (verbose) console.log(`  [A&S] ${artist} — ${title}: ${sections.length} section(s) detected`);

  for (const section of sections) {
    const { label, index, text } = section;
    const hash = hashText(text);

    // ── Duplicate check ──────────────────────────────────────────────────────
    const dupCheck = await db.query(
      "SELECT id, artist_name, song_name, section_label FROM analyses WHERE text_hash = $1 LIMIT 1",
      [hash]
    );
    if (dupCheck.rows.length > 0) {
      const dup = dupCheck.rows[0];
      if (verbose) console.log(`    [skip] ${label} — exact duplicate of: ${dup.artist_name} / ${dup.song_name} (${dup.section_label})`);
      results.push({ status: "skip", label, reason: "duplicate", hash });
      continue;
    }

    // ── Score via API ────────────────────────────────────────────────────────
    const scored = await scoreVerseViaAPI(artist, title, text, label);
    if (!scored) {
      if (verbose) console.log(`    [flag] ${label} — scoring failed, skipping`);
      results.push({ status: "flag", label, reason: "scoring_failed", hash });
      continue;
    }

    if (dryRun) {
      if (verbose) console.log(`    [dry-run] ${label} — score: ${scored.scoreOverall?.toFixed(1) || "?"}`);
      results.push({ status: "dry-run", label, score: scored.scoreOverall, hash });
      continue;
    }

    // ── Persist ──────────────────────────────────────────────────────────────
    const resultId = `${source}-${sourceId || "manual"}-${label}-${hash.slice(0, 8)}`;
    const now = Math.floor(Date.now() / 1000);

    try {
      await db.query(`
        INSERT INTO analyses (
          result_id, artist_name, song_name, verse_label,
          section_label, section_index, text_hash,
          source, source_id, verse,
          scoring_mode, result_json,
          score_overall, score_flow, score_wordplay,
          score_storytelling, score_rhyming, score_punchlines,
          created_at, updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$19
        )
        ON CONFLICT (result_id) DO UPDATE SET
          score_overall = EXCLUDED.score_overall,
          score_flow = EXCLUDED.score_flow,
          score_wordplay = EXCLUDED.score_wordplay,
          score_storytelling = EXCLUDED.score_storytelling,
          score_rhyming = EXCLUDED.score_rhyming,
          score_punchlines = EXCLUDED.score_punchlines,
          result_json = EXCLUDED.result_json,
          updated_at = EXCLUDED.updated_at
      `, [
        resultId,
        artist,
        title,
        label, // verse_label (human-readable)
        label, // section_label (canonical)
        index,
        hash,
        source,
        sourceId ? String(sourceId) : null,
        text,
        `standard-${scoringVersion}`,
        JSON.stringify(scored),
        scored.scoreOverall || 0,
        scored.scoreFlow || 0,
        scored.scoreWordplay || 0,
        scored.scoreStorytelling || 0,
        scored.scoreRhyming || 0,
        scored.scorePunchlines || 0,
        now,
      ]);

      if (verbose) console.log(`    [stored] ${label} (idx:${index ?? "—"}) — score: ${scored.scoreOverall?.toFixed(1) || "?"}`);
      results.push({ status: "insert", label, index, score: scored.scoreOverall, hash, resultId });
    } catch (err) {
      if (verbose) console.error(`    [error] ${label} — ${err.message}`);
      results.push({ status: "error", label, reason: err.message, hash });
    }
  }

  return results;
}

// ── CLI entry point ───────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const getArg = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
  const hasFlag = (f) => args.includes(f);

  const artist   = getArg("--artist");
  const title    = getArg("--title");
  const file     = getArg("--file");
  const source   = getArg("--source") || "manual";
  const sourceId = getArg("--source-id");
  const dryRun   = hasFlag("--dry-run");

  if (!artist || !title || !file) {
    console.error("Usage: DATABASE_URL=... node scripts/analyze-and-store.mjs --artist \"...\" --title \"...\" --file lyrics.txt [--source genius] [--source-id 12345] [--dry-run]");
    process.exit(1);
  }

  const lyrics = fs.readFileSync(file, "utf8");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║  PH Labs Analyze-and-Store v5               ║`);
  console.log(`║  Artist: ${artist.padEnd(34)}║`);
  console.log(`║  Title:  ${title.padEnd(34)}║`);
  console.log(`╚══════════════════════════════════════════════╝\n`);

  const results = await analyzeAndStore({ artist, title, lyrics, source, sourceId, db: pool, dryRun });

  const inserted = results.filter(r => r.status === "insert").length;
  const skipped  = results.filter(r => r.status === "skip").length;
  const flagged  = results.filter(r => r.status === "flag").length;

  console.log(`\n${"─".repeat(50)}`);
  console.log(`  Done.`);
  console.log(`  Inserted:  ${inserted}`);
  console.log(`  Skipped (duplicates): ${skipped}`);
  console.log(`  Flagged:   ${flagged}`);
  console.log(`${"─".repeat(50)}\n`);

  await pool.end();
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
