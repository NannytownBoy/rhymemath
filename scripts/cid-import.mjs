/**
 * cid-import.mjs
 * Loads v5.4 CID data into Railway Postgres following the import contract exactly.
 *
 * Import order (per contract):
 *   4. cultural_records  ← from v5_4_mined_refs.csv (when available)
 *   5. aliases           ← from v5_4_alias_additions.csv (when available)
 *   6. semantic_relationships ← v5_4_relationships.json
 *   7. entendre_candidates    ← v5_4_entendres.csv
 *   8. punchline_patterns     ← v5_4_punchlines.json
 *   9. candidate_queue        ← v5_4_candidates.json (insert_review_only — NEVER scores)
 *
 * CONTRACT ENFORCEMENT:
 *   - Only rows with review_status = 'approved' are eligible for scoring queries.
 *   - candidate_queue rows are NEVER auto-promoted. Human curator must manually
 *     INSERT into cid_cultural_records to promote a candidate.
 *   - Full lyrics are never stored in this system.
 *
 * Run: DATABASE_URL="..." node scripts/cid-import.mjs [--dir /path/to/files]
 */

import pg from 'pg';
import fs from 'fs';
import { parse as csvParse } from 'csv-parse/sync';
import path from 'path';
import { fileURLToPath } from 'url';

// Allow --dir override, default to the uploaded attachments path
const args = process.argv.slice(2);
const dirIdx = args.indexOf('--dir');
const DATA_DIR = dirIdx >= 0
  ? args[dirIdx + 1]
  : '/home/user/workspace/uploaded_attachments/3e94eb5d2e25486c834b8e879bd4c102';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const log = { records: 0, aliases: 0, relationships: 0, entendres: 0, punchlines: 0, candidates: 0, errors: [] };

function readJSON(filename) {
  const p = path.join(DATA_DIR, filename);
  if (!fs.existsSync(p)) { console.log(`   ⚠️  Not found: ${filename} (skipping)`); return []; }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function readCSV(filename) {
  const p = path.join(DATA_DIR, filename);
  if (!fs.existsSync(p)) { console.log(`   ⚠️  Not found: ${filename} (skipping)`); return []; }
  return csvParse(fs.readFileSync(p, 'utf8'), { columns: true, skip_empty_lines: true });
}

function int(v) { const n = parseInt(v); return isNaN(n) ? null : n; }
function str(v) { return v || null; }

console.log('🎯  CID v5.4 Import — Following contract order\n');
console.log(`   Data directory: ${DATA_DIR}\n`);

// ── Step 4: cultural_records (V5_4_Mined_Refs) ──────────────────────────────
console.log('Step 4: cultural_records (V5_4_Mined_Refs)...');
const minedRefs = readCSV('v5_4_mined_refs.csv');
for (const row of minedRefs) {
  try {
    await pool.query(`
      INSERT INTO cid_cultural_records
        (record_id, term, canonical_meaning, category_primary, category_secondary,
         domains, era, region, confidence, review_status, status, source_id,
         risk_flag, sensitivity_tag, display_label, notes, owner, last_reviewed_at, approved_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      ON CONFLICT (record_id) DO UPDATE SET
        term = EXCLUDED.term,
        canonical_meaning = EXCLUDED.canonical_meaning,
        category_primary = EXCLUDED.category_primary,
        review_status = EXCLUDED.review_status,
        status = EXCLUDED.status,
        confidence = EXCLUDED.confidence
    `, [
      row.record_id, row.term, str(row.canonical_meaning),
      str(row.category_primary), str(row.category_secondary),
      str(row.domains), str(row.era), str(row.region),
      int(row.confidence), str(row.review_status) || 'needs_review',
      str(row.status) || 'active', str(row.source_id),
      str(row.risk_flag) || 'low', str(row.sensitivity_tag),
      str(row.display_label), str(row.notes), str(row.owner),
      str(row.last_reviewed_at), str(row.approved_by)
    ]);
    log.records++;
  } catch(e) { log.errors.push(`cultural_records ${row.record_id}: ${e.message}`); }
}
console.log(`   ✅  ${log.records} records upserted\n`);

// ── Step 5: aliases (V5_4_Alias_Additions) ──────────────────────────────────
console.log('Step 5: aliases (V5_4_Alias_Additions)...');
const aliases = readCSV('v5_4_alias_additions.csv');
for (const row of aliases) {
  try {
    await pool.query(`
      INSERT INTO cid_aliases
        (alias_id, alias_text, canonical_record_id, alias_type, confidence,
         review_status, status, source_id, risk_flag, sensitivity_tag,
         display_label, notes, owner, last_reviewed_at, approved_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      ON CONFLICT (alias_id) DO UPDATE SET
        alias_text = EXCLUDED.alias_text,
        canonical_record_id = EXCLUDED.canonical_record_id,
        review_status = EXCLUDED.review_status,
        confidence = EXCLUDED.confidence
    `, [
      row.alias_id, row.alias_text, str(row.canonical_record_id),
      str(row.alias_type), int(row.confidence),
      str(row.review_status) || 'needs_review', str(row.status) || 'active',
      str(row.source_id), str(row.risk_flag) || 'low', str(row.sensitivity_tag),
      str(row.display_label), str(row.notes), str(row.owner),
      str(row.last_reviewed_at), str(row.approved_by)
    ]);
    log.aliases++;
  } catch(e) { log.errors.push(`aliases ${row.alias_id}: ${e.message}`); }
}
console.log(`   ✅  ${log.aliases} aliases upserted\n`);

// ── Step 6: semantic_relationships ──────────────────────────────────────────
console.log('Step 6: semantic_relationships...');
const rels = readJSON('v5_4_relationships.json');
for (const row of rels) {
  try {
    await pool.query(`
      INSERT INTO cid_semantic_relationships
        (relationship_id, from_record_id, from_label, relationship_type,
         to_record_id, to_label, confidence, review_status, status, source_id,
         risk_flag, sensitivity_tag, display_label, notes, category_primary,
         owner, last_reviewed_at, approved_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      ON CONFLICT (relationship_id) DO UPDATE SET
        relationship_type = EXCLUDED.relationship_type,
        confidence = EXCLUDED.confidence,
        review_status = EXCLUDED.review_status
    `, [
      row.relationship_id, str(row.from_record_id), str(row.from_label),
      str(row.relationship_type), str(row.to_record_id), str(row.to_label),
      int(row.confidence), str(row.review_status) || 'needs_review',
      str(row.status) || 'active', str(row.source_id),
      str(row.risk_flag) || 'low', str(row.sensitivity_tag),
      str(row.display_label), str(row.notes), str(row.category_primary),
      str(row.owner), str(row.last_reviewed_at), str(row.approved_by)
    ]);
    log.relationships++;
  } catch(e) { log.errors.push(`relationships ${row.relationship_id}: ${e.message}`); }
}
console.log(`   ✅  ${log.relationships} relationships upserted\n`);

// ── Step 7: entendre_candidates ──────────────────────────────────────────────
console.log('Step 7: entendre_candidates...');
const entendres = readCSV('v5_4_entendres.csv');
for (const row of entendres) {
  try {
    await pool.query(`
      INSERT INTO cid_entendre_candidates
        (entendre_id, anchor, short_anchor, term, interpretation_1, interpretation_2,
         interpretation_3, domains, strength_estimate, confidence, category_primary,
         review_status, status, source_id, risk_flag, sensitivity_tag,
         display_label, notes, owner, last_reviewed_at, approved_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
      ON CONFLICT (entendre_id) DO UPDATE SET
        anchor = EXCLUDED.anchor,
        term = EXCLUDED.term,
        strength_estimate = EXCLUDED.strength_estimate,
        confidence = EXCLUDED.confidence,
        review_status = EXCLUDED.review_status
    `, [
      row.entendre_id, row.anchor, str(row.short_anchor), row.term,
      str(row.interpretation_1), str(row.interpretation_2), str(row.interpretation_3),
      str(row.domains), int(row.strength_estimate), int(row.confidence),
      str(row.category_primary), str(row.review_status) || 'needs_review',
      str(row.status) || 'active', str(row.source_id),
      str(row.risk_flag) || 'low', str(row.sensitivity_tag),
      str(row.display_label), str(row.notes), str(row.owner),
      str(row.last_reviewed_at), str(row.approved_by)
    ]);
    log.entendres++;
  } catch(e) { log.errors.push(`entendres ${row.entendre_id}: ${e.message}`); }
}
console.log(`   ✅  ${log.entendres} entendres upserted\n`);

// ── Step 8: punchline_patterns ───────────────────────────────────────────────
console.log('Step 8: punchline_patterns...');
const punchlines = readJSON('v5_4_punchlines.json');
for (const row of punchlines) {
  try {
    await pool.query(`
      INSERT INTO cid_punchline_patterns
        (punchline_id, setup_anchor, short_anchor, payoff_anchor, mechanism,
         detected_domains, punchline_type, strength_estimate, confidence,
         category_primary, review_status, status, source_id, risk_flag,
         sensitivity_tag, display_label, notes, owner, last_reviewed_at, approved_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
      ON CONFLICT (punchline_id) DO UPDATE SET
        setup_anchor = EXCLUDED.setup_anchor,
        mechanism = EXCLUDED.mechanism,
        strength_estimate = EXCLUDED.strength_estimate,
        confidence = EXCLUDED.confidence,
        review_status = EXCLUDED.review_status
    `, [
      row.punchline_id, row.setup_anchor, str(row.short_anchor),
      str(row.payoff_anchor), str(row.mechanism), str(row.detected_domains),
      str(row.punchline_type), int(row.strength_estimate), int(row.confidence),
      str(row.category_primary), str(row.review_status) || 'needs_review',
      str(row.status) || 'active', str(row.source_id),
      str(row.risk_flag) || 'low', str(row.sensitivity_tag),
      str(row.display_label), str(row.notes), str(row.owner),
      str(row.last_reviewed_at), str(row.approved_by)
    ]);
    log.punchlines++;
  } catch(e) { log.errors.push(`punchlines ${row.punchline_id}: ${e.message}`); }
}
console.log(`   ✅  ${log.punchlines} punchlines upserted\n`);

// ── Step 9: candidate_queue (INSERT REVIEW ONLY — never scores) ─────────────
console.log('Step 9: candidate_queue (review-only — NEVER production-scored)...');
const candidates = readJSON('v5_4_candidates.json');
for (const row of candidates) {
  try {
    await pool.query(`
      INSERT INTO cid_candidate_queue
        (candidate_id, candidate_text, candidate_type, likely_category, short_anchor,
         reason_for_review, confidence, category_primary, recommended_action,
         review_status, status, source_id, risk_flag, sensitivity_tag,
         display_label, owner, last_reviewed_at, approved_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      ON CONFLICT (candidate_id) DO NOTHING
    `, [
      row.candidate_id, row.candidate_text, str(row.candidate_type),
      str(row.likely_category), str(row.short_anchor),
      str(row.reason_for_review), int(row.confidence),
      str(row.category_primary), str(row.recommended_action),
      str(row.review_status) || 'needs_review', str(row.status) || 'review',
      str(row.source_id), str(row.risk_flag) || 'low', str(row.sensitivity_tag),
      str(row.display_label), str(row.owner),
      str(row.last_reviewed_at), str(row.approved_by)
    ]);
    log.candidates++;
  } catch(e) { log.errors.push(`candidates ${row.candidate_id}: ${e.message}`); }
}
console.log(`   ✅  ${log.candidates} candidates inserted (review-only, not scored)\n`);

// ── Log this run ─────────────────────────────────────────────────────────────
await pool.query(`
  INSERT INTO cid_sync_log
    (records_upserted, aliases_upserted, relationships_upserted,
     entendres_upserted, punchlines_upserted, candidates_inserted, errors, source)
  VALUES ($1,$2,$3,$4,$5,$6,$7,'manual')
`, [
  log.records, log.aliases, log.relationships,
  log.entendres, log.punchlines, log.candidates,
  log.errors.length > 0 ? log.errors.join('\n') : null
]);

console.log('━'.repeat(60));
console.log('✅  CID v5.4 Import Complete');
console.log(`   cultural_records:      ${log.records}`);
console.log(`   aliases:               ${log.aliases}`);
console.log(`   semantic_relationships: ${log.relationships}`);
console.log(`   entendre_candidates:   ${log.entendres}`);
console.log(`   punchline_patterns:    ${log.punchlines}`);
console.log(`   candidate_queue:       ${log.candidates} (review-only)`);
if (log.errors.length > 0) {
  console.log(`\n⚠️  ${log.errors.length} errors:`);
  log.errors.forEach(e => console.log(`   ${e}`));
}
await pool.end();
