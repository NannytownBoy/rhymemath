import { analyzeVerseSolo, SCORING_VERSION } from "../server/scoring/scoreComparison.js";

const TEST_VERSE = `I used to hustle, now all I do is handle business
Dropped out of school, now I'm teaching them the difference
See I'm from where they cram you in a project building
You grow up quick, the young'uns wearing prison feelings`;

const HOOK_VERSE = `Yeah yeah yeah yeah yeah yeah
Yeah yeah yeah yeah yeah yeah
Yeah yeah yeah yeah yeah yeah
Yeah yeah yeah yeah yeah yeah`;

const FILLER_VERSE = `Uh uh uh yeah yeah ay ay
Uh uh uh yeah yeah ay ay
Uh uh uh yeah yeah ay ay
Uh uh uh yeah yeah ay ay`;

const NAS_VERSE = `I gave you power, held you in my hand
Felt my steel expand, reveal the plan
Command, you understand? I'm in demand
The higher the clock, the higher the fame
Symbols and psalms, I control your arms`;

console.log(`\n=== RhymeMath v6 QA ===`);
console.log(`SCORING_VERSION: ${SCORING_VERSION}\n`);

// ── Suppression test ──────────────────────────────────────────────────────────
const hookResult   = await analyzeVerseSolo({ artistName: "Test", songName: "Hook", verse: HOOK_VERSE, sectionLabel: "hook" });
const fillerResult = await analyzeVerseSolo({ artistName: "Test", songName: "Filler", verse: FILLER_VERSE });
const normalResult = await analyzeVerseSolo({ artistName: "Test", songName: "Verse", verse: TEST_VERSE });

console.log("── Suppression ──────────────────────────────");
const hk = (hookResult as any);
const fl = (fillerResult as any);
const nm = (normalResult as any);

const hookOverall  = hk.scores?.overall ?? 0;
const fillerOverall= fl.scores?.overall ?? 0;
const normalOverall= nm.scores?.overall ?? 0;

console.log(`Hook  : ${hookOverall.toFixed(1)} (≤65?) ${hookOverall <= 65 ? "PASS ✓" : "FAIL ✗"}`);
console.log(`  flags: ${JSON.stringify(hk.suppressionFlags ?? [])}`);
console.log(`Filler: ${fillerOverall.toFixed(1)} (≤68?) ${fillerOverall <= 68 ? "PASS ✓" : "FAIL ✗"}`);
console.log(`  flags: ${JSON.stringify(fl.suppressionFlags ?? [])}`);
console.log(`Normal: ${normalOverall.toFixed(1)} (>50?) ${normalOverall > 50 ? "PASS ✓" : "FAIL ✗"}`);
console.log(`  flags: ${JSON.stringify(nm.suppressionFlags ?? [])}`);

// ── Symmetry test ─────────────────────────────────────────────────────────────
console.log("\n── Symmetry ─────────────────────────────────");
const r1 = await analyzeVerseSolo({ artistName: "A", songName: "S", verse: TEST_VERSE });
const r2 = await analyzeVerseSolo({ artistName: "A", songName: "S", verse: TEST_VERSE });
const sym = JSON.stringify((r1 as any).scores) === JSON.stringify((r2 as any).scores);
console.log(`Identical input → identical scores: ${sym ? "PASS ✓" : "FAIL ✗"}`);
console.log(`scoringVersion: ${(r1 as any).scoringVersion ?? "MISSING ✗"}`);

// ── Conceptual lyricism test ──────────────────────────────────────────────────
console.log("\n── Conceptual Lyricism ──────────────────────");
const nasResult = await analyzeVerseSolo({ artistName: "Nas", songName: "I Gave You Power", verse: NAS_VERSE });
const nas = nasResult as any;
console.log(`Conceptual score: ${nas.conceptualScore ?? "MISSING"} (>15?) ${(nas.conceptualScore ?? 0) > 15 ? "PASS ✓" : "FAIL ✗"}`);
console.log(`Wordplay  : ${nas.scores?.wordplay?.toFixed(1)}`);
console.log(`Storytelling: ${nas.scores?.storytelling?.toFixed(1)}`);

// ── Authority test — hook section should not score above 65 ──────────────────
console.log("\n── Authority (section exclusion) ────────────");
const hookExcluded = hookOverall <= 65;
console.log(`Hook/chorus excluded from elite tier: ${hookExcluded ? "PASS ✓" : "FAIL ✗"}`);

// ── Version consistency ───────────────────────────────────────────────────────
console.log("\n── Version field ─────────────────────────────");
const v1 = (r1 as any).scoringVersion;
const v2 = (r2 as any).scoringVersion;
console.log(`v1: ${v1}, v2: ${v2} — ${v1 === v2 && v1 === "v6.0" ? "PASS ✓" : "FAIL ✗"}`);

console.log("\n=== QA complete ===\n");
