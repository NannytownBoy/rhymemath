#!/usr/bin/env node
/**
 * seed-canon.mjs
 * RhymeMath v6 — Canon calibration anchors
 *
 * Seeds cid_canon_examples with the 30 canonical reference examples
 * specified verbatim in the scoring system overhaul spec.
 *
 * PURPOSE: QA, calibration, and annotation priority only.
 * These records DO NOT create artist bonuses, score inflation, or
 * penalties against non-canon artists.
 *
 * Run: node scripts/seed-canon.mjs
 */

import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || (() => { throw new Error("DATABASE_URL env var is required — set it before running this script"); })(),
});

const CANON_EXAMPLES = [
  // ── Flow ────────────────────────────────────────────────────────────────────
  {
    artist: "The Notorious B.I.G.",
    song: "Hypnotize",
    category: "flow",
    section_label: "verse_1",
    notes: "Exemplar of effortless syllabic compression with cadence variation. Multi-syllabic rhymes land on beat with rhythmic inevitability. No wasted breath.",
  },
  {
    artist: "JID",
    song: "Off Da Zoinkys",
    category: "flow",
    section_label: "verse_1",
    notes: "Elite machine-gun triplet flow with breath control. Rapid-fire cadence shifts that stay musical. Demonstrates flow complexity without sacrificing precision.",
  },
  {
    artist: "Freddie Gibbs",
    song: "Gold Feet (feat. JID)",
    category: "flow",
    section_label: "verse_1",
    notes: "Gibbs's relaxed drawl over intricate rhythmic placement. Economy of movement — every syllable has weight and intentional beat relationship.",
  },
  {
    artist: "Jay-Z",
    song: "Jigga What Jigga Who",
    category: "flow",
    section_label: "verse_1",
    notes: "Aggressive flow with punishing on-beat delivery. Demonstrates how a consistent, propulsive flow style creates momentum across a full verse.",
  },
  {
    artist: "Nas",
    song: "Verbal Intercourse",
    category: "flow",
    section_label: "verse_1",
    notes: "Laid-back, conversational delivery that hides extraordinary rhythmic precision. Cadence builds narrative tension across the verse structure.",
  },

  // ── Rhyme Craft ─────────────────────────────────────────────────────────────
  {
    artist: "MF DOOM",
    song: "Accordion",
    category: "rhyme_craft",
    section_label: "verse_1",
    notes: "Internal rhyme density beyond any contemporary peer. Multi-syllabic rhyme chains connect across non-adjacent lines. Rhyme scheme functions as a structural skeleton.",
  },
  {
    artist: "Lupe Fiasco",
    song: "Mural",
    category: "rhyme_craft",
    section_label: "verse_1",
    notes: "Sustained 9-minute verse with zero rhyme fatigue. Layered multi-syllabic patterns sustain freshness. Demonstrates scope without sacrificing scheme coherence.",
  },
  {
    artist: "Rakim",
    song: "Follow the Leader",
    category: "rhyme_craft",
    section_label: "verse_1",
    notes: "Foundational text for internal rhyme placement in hip-hop. Rhymes within the bar, not just at the end. The blueprint for technical rhyme construction.",
  },
  {
    artist: "Ka",
    song: "Mourn at Night",
    category: "rhyme_craft",
    section_label: "verse_1",
    notes: "Minimalist rhyme architecture. Every near-rhyme and slant rhyme is intentional. Proves that precision beats volume — sparse rhyme placement with maximum resonance.",
  },
  {
    artist: "Prodigy",
    song: "Keep It Thoro",
    category: "rhyme_craft",
    section_label: "verse_1",
    notes: "Brutally efficient end-rhyme chains with internal support. Rhyme choices reinforce the menacing tone — scheme and content are inseparable.",
  },

  // ── Wordplay ────────────────────────────────────────────────────────────────
  {
    artist: "Lupe Fiasco",
    song: "Mural",
    category: "wordplay",
    section_label: "verse_1",
    notes: "Dense double-entendre stacking with cultural and political reference layers. Each bar operates on multiple simultaneous meanings. Wordplay as political commentary.",
  },
  {
    artist: "Nas",
    song: "Verbal Intercourse",
    category: "wordplay",
    section_label: "verse_1",
    notes: "The title itself is the thesis — the verse delivers on linguistic intimacy as metaphor. Layered street/spirituality duality throughout.",
  },
  {
    artist: "Jay-Z",
    song: "Devil in a New Dress (feat. Kanye West)",
    category: "wordplay",
    section_label: "verse_2",
    notes: "HOVA's verse on this record is a masterclass in subtle double-meaning and cultural reference density. Each line payoffs two readings without signposting either.",
  },
  {
    artist: "MF DOOM",
    song: "Accordion",
    category: "wordplay",
    section_label: "verse_1",
    notes: "Comic-book referencing, food metaphors, and villain mythology merge into coherent wordplay systems. The humor and the density are simultaneously present.",
  },
  {
    artist: "Roc Marciano",
    song: "76",
    category: "wordplay",
    section_label: "verse_1",
    notes: "Luxury-trap imagery as extended metaphor. Street realism encoded in highbrow cultural reference. Compression density: 3-4 images per bar.",
  },

  // ── Storytelling ─────────────────────────────────────────────────────────────
  {
    artist: "Slick Rick",
    song: "Children's Story",
    category: "storytelling",
    section_label: "verse_1",
    notes: "The canonical narrative rap reference. Third-person omniscient with cinematic scene-setting. Character, conflict, consequence arc fully realized in under 3 minutes.",
  },
  {
    artist: "Nas",
    song: "I Gave You Power",
    category: "storytelling",
    section_label: "verse_1",
    notes: "Sustained first-person perspective from a non-human narrator (a gun). Concept fully maintained from open to close without breaking frame. Allegorical mastery.",
  },
  {
    artist: "Eminem",
    song: "Stan",
    category: "storytelling",
    section_label: "verse_3",
    notes: "Eminem's responding verse completes an epistolary narrative arc. Dramatic irony (listener knows the car/trunk outcome) creates unbearable tension. Multi-verse story with thematic payoff.",
  },
  {
    artist: "Ghostface Killah",
    song: "Shakey Dog",
    category: "storytelling",
    section_label: "verse_1",
    notes: "Extended 6-minute heist narrative with ensemble cast. Street novel in rap form. Dialogue, scene transitions, and character interiority all present. Pacing control is elite.",
  },
  {
    artist: "Scarface",
    song: "I Seen a Man Die",
    category: "storytelling",
    section_label: "verse_1",
    notes: "Existential reflection on mortality from a street witness POV. Emotional authenticity without melodrama. Shows storytelling through specificity and restraint.",
  },

  // ── Punchlines ────────────────────────────────────────────────────────────
  {
    artist: "Fabolous",
    song: "Breathe",
    category: "punchlines",
    section_label: "verse_1",
    notes: "Each bar is a self-contained punchline. Setup is economical (half-bar) and payoff lands on the second half. Bar-for-bar density without filler transitions.",
  },
  {
    artist: "Lloyd Banks",
    song: "Victory (feat. Eminem, 50 Cent) — Lloyd Banks verse",
    category: "punchlines",
    section_label: "verse_2",
    notes: "Classic G-Unit punchline rap with multi-layered cultural references in the setup. Consistent wit throughout without recycled schemes. 2004 mixtape era peak.",
  },
  {
    artist: "Cassidy",
    song: "I'm a Hustla (Battle-era freestyle)",
    category: "punchlines",
    section_label: "verse_1",
    notes: "Battle rap punchline architecture at its apex. The adversarial setup forces maximum payoff efficiency. Direct address creates immediacy that studio tracks rarely match.",
  },
  {
    artist: "Jadakiss",
    song: "We Gonna Make It (feat. Styles P)",
    category: "punchlines",
    section_label: "verse_1",
    notes: "Jadakiss's gravel-delivery punchline style. Simile-heavy with street credibility backing each comparison. Laugh-to-nod ratio at elite level.",
  },
  {
    artist: "Big L",
    song: "98 Freestyle",
    category: "punchlines",
    section_label: "verse_1",
    notes: "Harlem overlay punchline style. Vulgar humor and deadly precision co-exist. A-side/B-side bar structure: setup is a normal bar, punchline flips it. Flawless ratio.",
  },

  // ── Conceptual Lyricism ──────────────────────────────────────────────────
  {
    artist: "Nas",
    song: "I Gave You Power",
    category: "conceptual",
    section_label: "verse_1",
    notes: "Sustained first-person inanimate narrator (gun). Symbolism maintained from first word to last. Concept never breaks. The conceit IS the politics — no hand-holding.",
  },
  {
    artist: "Nas",
    song: "Take It in Blood",
    category: "conceptual",
    section_label: "verse_1",
    notes: "Abstract worldview encoded in specific street imagery. Blood covenant as both literal and philosophical contract. Abstraction serves the street narrative, not the reverse.",
  },
  {
    artist: "Yasiin Bey",
    song: "Lord Lord Lord (feat. Talib Kweli, Wale)",
    category: "conceptual",
    section_label: "verse_1",
    notes: "Mos Def's verse weaves Quranic reference, Black American experience, and personal confession into unified thematic space. Spiritual abstraction grounded in the physical.",
  },
  {
    artist: "Ka",
    song: "Mourn at Night",
    category: "conceptual",
    section_label: "verse_1",
    notes: "Philosophical density per syllable rivals any Golden Age verse. Greco-Roman mythology, samurai ethics, and Bed-Stuy street life form a single image system. No wasted abstraction.",
  },
  {
    artist: "Kendrick Lamar",
    song: "FEAR.",
    category: "conceptual",
    section_label: "verse_3",
    notes: "Three ages of fear mapped across three verses — childhood, adulthood, scripture. Thematic architecture is the point. The verse is the concept. Conceptual lyricism at stadium scale.",
  },
];

async function run() {
  console.log("Seeding cid_canon_examples...");

  // Wipe existing and re-seed cleanly (idempotent)
  await pool.query("DELETE FROM cid_canon_examples");
  console.log("  Cleared existing canon examples");

  let inserted = 0;
  for (const ex of CANON_EXAMPLES) {
    await pool.query(
      `INSERT INTO cid_canon_examples (artist, song, category, section_label, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [ex.artist, ex.song, ex.category, ex.section_label, ex.notes]
    );
    inserted++;
    console.log(`  ✓ [${ex.category.padEnd(12)}] ${ex.artist} — "${ex.song}"`);
  }

  const counts = await pool.query(
    `SELECT category, COUNT(*) as n FROM cid_canon_examples GROUP BY category ORDER BY category`
  );
  console.log("\nCanon seeded:");
  for (const row of counts.rows) {
    console.log(`  ${row.category.padEnd(20)} ${row.n} examples`);
  }
  console.log(`\nTotal: ${inserted} canon examples`);

  await pool.end();
}

run().catch(e => { console.error(e); process.exit(1); });
