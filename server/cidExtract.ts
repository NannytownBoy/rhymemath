/**
 * cidExtract.ts
 * Rule-based extraction of CID candidates from annotation explanations.
 * Runs fire-and-forget after annotation submit — never blocks the response.
 *
 * Strategy (Option D — no AI required):
 *   1. annotationType from form → primary CID layer routing
 *   2. Keyword patterns in explanation → secondary routing if type missing
 *   3. Named entity hints (capitalized words) → figure candidates
 *   4. "Also means / double" patterns → entendre candidates
 *   5. Slang indicators ("slang for", "means", "refers to") → cultural record
 */
import pg from "pg";
const { Pool } = pg;

function pool() {
  return new Pool({ connectionString: process.env.DATABASE_URL });
}

// ── Keyword pattern sets ──────────────────────────────────────────────────────
const SLANG_PATTERNS   = /\b(slang for|means|refers to|short for|another word for|term for|code for|used to describe)\b/i;
const DOUBLE_PATTERNS  = /\b(also means|double meaning|double entendre|two meanings|both|simultaneously|on one level|on another level)\b/i;
const FIGURE_PATTERNS  = /\b(referring to|named after|about|alludes? to|nod to|shoutout to|references?)\b/i;
const HISTORICAL_PATTS = /\b(in the \d{4}s?|back in|historically|originated|during the|era|movement|period)\b/i;
const BRAND_PATTERNS   = /\b(brand|company|label|record label|store|chain|fashion|designer|luxury)\b/i;

// Detect capitalized multi-word sequences that look like proper nouns
function extractProperNouns(text: string): string[] {
  const matches = text.match(/\b([A-Z][a-z]+(?: [A-Z][a-z]+){1,3})\b/g) ?? [];
  // Filter out common sentence-start false positives
  const stopWords = new Set(["The", "A", "An", "In", "On", "At", "By", "For", "With", "This", "That", "He", "She"]);
  return [...new Set(matches.filter(m => !stopWords.has(m.split(" ")[0])))];
}

type CIDLayer = "cultural_record" | "alias" | "entendre" | "figure";

interface Candidate {
  layer: CIDLayer;
  term: string;
  canonical?: string;
  meaning: string;
  domains: string[];
  confidence: number;
}

// Domain inference from explanation text
function inferDomains(text: string): string[] {
  const domains: string[] = [];
  if (/\b(drug|heroin|cocaine|crack|dope|fiend|trap|pack|bird|brick|key)\b/i.test(text)) domains.push("drug_culture");
  if (/\b(gun|weapon|blick|glock|stick|iron|heat|banger|piece|strap)\b/i.test(text)) domains.push("street_culture");
  if (/\b(jail|prison|bid|upstate|locked up|federal|penitentiary)\b/i.test(text)) domains.push("street_culture");
  if (/\b(church|pastor|preacher|god|holy|scripture|bible|prayer)\b/i.test(text)) domains.push("religion");
  if (/\b(sport|basketball|football|nba|nfl|game|court|jersey)\b/i.test(text)) domains.push("sports");
  if (/\b(fashion|drip|designer|brand|luxury|icy|chain|jewel)\b/i.test(text)) domains.push("fashion");
  if (/\b(politic|president|mayor|vote|govern|white house|congress)\b/i.test(text)) domains.push("politics");
  if (/\b(film|movie|tv|show|character|actor|director|scene|series)\b/i.test(text)) domains.push("media");
  if (domains.length === 0) domains.push("music");
  return domains;
}

export async function extractCIDFromAnnotation(ann: {
  id: number;
  anchor_text: string;
  meaning: string;
  annotation_type?: string;
}): Promise<void> {
  if (!ann.meaning || ann.meaning.length < 10) return;

  const text = ann.meaning;
  const anchor = ann.anchor_text.trim();
  const type = ann.annotation_type ?? "other";
  const candidates: Candidate[] = [];
  const domains = inferDomains(text);

  // ── Route by annotator-selected type ─────────────────────────────────────
  if (type === "meaning" || type === "other") {
    // Check for slang patterns
    if (SLANG_PATTERNS.test(text)) {
      candidates.push({
        layer: "cultural_record",
        term: anchor,
        meaning: text.slice(0, 300),
        domains,
        confidence: 0.8,
      });
    }
  }

  if (type === "double_meaning" || DOUBLE_PATTERNS.test(text)) {
    candidates.push({
      layer: "entendre",
      term: anchor,
      meaning: text.slice(0, 300),
      domains,
      confidence: 0.85,
    });
  }

  if (type === "cultural_ref" || type === "historical" || FIGURE_PATTERNS.test(text)) {
    // Check for proper nouns as figure references
    const nouns = extractProperNouns(text);
    for (const noun of nouns.slice(0, 3)) {
      candidates.push({
        layer: "figure",
        term: noun,
        meaning: `Referenced in context of "${anchor}": ${text.slice(0, 200)}`,
        domains,
        confidence: 0.72,
      });
    }
    // Also add as cultural record
    if (candidates.length === 0 || type === "historical") {
      candidates.push({
        layer: "cultural_record",
        term: anchor,
        meaning: text.slice(0, 300),
        domains,
        confidence: 0.75,
      });
    }
  }

  if (type === "brand_place" || BRAND_PATTERNS.test(text)) {
    candidates.push({
      layer: "cultural_record",
      term: anchor,
      meaning: text.slice(0, 300),
      domains: ["fashion", "media"],
      confidence: 0.75,
    });
  }

  // ── Fallback: at minimum create a cultural record for any explanation ─────
  if (candidates.length === 0 && text.length >= 20) {
    candidates.push({
      layer: "cultural_record",
      term: anchor,
      meaning: text.slice(0, 300),
      domains,
      confidence: 0.6,
    });
  }

  if (candidates.length === 0) return;

  // ── Persist to extracted_cid column ───────────────────────────────────────
  const p = pool();
  try {
    await p.query(
      `UPDATE annotations SET extracted_cid=$1::jsonb WHERE id=$2`,
      [JSON.stringify(candidates), ann.id]
    );
  } catch { /* non-fatal */ } finally { await p.end(); }
}
