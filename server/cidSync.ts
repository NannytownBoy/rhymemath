/**
 * cidSync.ts
 * Scheduled CID v5.4 sync — fetches updated data from Google Sheet CSV export
 * and upserts into the Railway Postgres CID tables.
 *
 * CONTRACT:
 *   - Only imports V5.4 sheets (workbook_control importable=yes)
 *   - candidate_queue: insert_review_only — NEVER auto-promotes to canonical tables
 *   - Clears cidLookup cache after successful sync so scoring engine picks up new data
 *   - Runs every 24h in production (attached to integrity scheduler)
 *
 * To enable Google Sheet sync:
 *   Set env vars CID_SHEET_ID and CID_SHEET_GID_MAP in Railway.
 *   CID_SHEET_GID_MAP is a JSON map of sheet_name → gid number, e.g.:
 *   {"V5_4_Entendres":"0","V5_4_Punchlines":"123456","V5_4_Candidates":"789"}
 */

import { Pool } from "pg";
import { clearCIDCache } from "./scoring/cidLookup";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

const SHEET_ID = process.env.CID_SHEET_ID;
const GID_MAP: Record<string, string> = process.env.CID_SHEET_GID_MAP
  ? JSON.parse(process.env.CID_SHEET_GID_MAP)
  : {};

function sheetCSVUrl(gid: string) {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
}

async function fetchCSV(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  return lines.slice(1).map(line => {
    // Simple CSV parse — handles quoted fields
    const vals: string[] = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    vals.push(cur.trim());
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']));
  });
}

function int(v: string | undefined) { const n = parseInt(v ?? ''); return isNaN(n) ? null : n; }
function str(v: string | undefined) { return v || null; }

export async function runCIDSync(): Promise<{ synced: boolean; counts: Record<string, number>; error?: string }> {
  if (!SHEET_ID || Object.keys(GID_MAP).length === 0) {
    // No Google Sheet configured — silent no-op
    return { synced: false, counts: {}, error: 'CID_SHEET_ID or CID_SHEET_GID_MAP not configured' };
  }

  const counts: Record<string, number> = { entendres: 0, punchlines: 0, candidates: 0 };

  try {
    // ── Entendres ────────────────────────────────────────────────────────────
    if (GID_MAP['V5_4_Entendres']) {
      const csv = await fetchCSV(sheetCSVUrl(GID_MAP['V5_4_Entendres']));
      const rows = parseCSV(csv);
      for (const row of rows) {
        if (!row.entendre_id) continue;
        await pool.query(`
          INSERT INTO cid_entendre_candidates
            (entendre_id, anchor, short_anchor, term, interpretation_1, interpretation_2,
             interpretation_3, domains, strength_estimate, confidence, category_primary,
             review_status, status, source_id, risk_flag, sensitivity_tag,
             display_label, notes, owner, last_reviewed_at, approved_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
          ON CONFLICT (entendre_id) DO UPDATE SET
            anchor = EXCLUDED.anchor, term = EXCLUDED.term,
            strength_estimate = EXCLUDED.strength_estimate,
            confidence = EXCLUDED.confidence, review_status = EXCLUDED.review_status
        `, [
          row.entendre_id, row.anchor, str(row.short_anchor), row.term,
          str(row.interpretation_1), str(row.interpretation_2), str(row.interpretation_3),
          str(row.domains), int(row.strength_estimate), int(row.confidence),
          str(row.category_primary), str(row.review_status) || 'needs_review',
          str(row.status) || 'active', str(row.source_id), str(row.risk_flag) || 'low',
          str(row.sensitivity_tag), str(row.display_label), str(row.notes),
          str(row.owner), str(row.last_reviewed_at), str(row.approved_by)
        ]);
        counts.entendres++;
      }
    }

    // ── Punchlines ───────────────────────────────────────────────────────────
    if (GID_MAP['V5_4_Punchlines']) {
      const csv = await fetchCSV(sheetCSVUrl(GID_MAP['V5_4_Punchlines']));
      const rows = parseCSV(csv);
      for (const row of rows) {
        if (!row.punchline_id) continue;
        await pool.query(`
          INSERT INTO cid_punchline_patterns
            (punchline_id, setup_anchor, short_anchor, payoff_anchor, mechanism,
             detected_domains, punchline_type, strength_estimate, confidence,
             category_primary, review_status, status, source_id, risk_flag,
             sensitivity_tag, display_label, notes, owner, last_reviewed_at, approved_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
          ON CONFLICT (punchline_id) DO UPDATE SET
            setup_anchor = EXCLUDED.setup_anchor, mechanism = EXCLUDED.mechanism,
            strength_estimate = EXCLUDED.strength_estimate,
            confidence = EXCLUDED.confidence, review_status = EXCLUDED.review_status
        `, [
          row.punchline_id, row.setup_anchor, str(row.short_anchor), str(row.payoff_anchor),
          str(row.mechanism), str(row.detected_domains), str(row.punchline_type),
          int(row.strength_estimate), int(row.confidence), str(row.category_primary),
          str(row.review_status) || 'needs_review', str(row.status) || 'active',
          str(row.source_id), str(row.risk_flag) || 'low', str(row.sensitivity_tag),
          str(row.display_label), str(row.notes), str(row.owner),
          str(row.last_reviewed_at), str(row.approved_by)
        ]);
        counts.punchlines++;
      }
    }

    // ── Candidates (insert_review_only — NEVER scores) ───────────────────────
    if (GID_MAP['V5_4_Candidates']) {
      const csv = await fetchCSV(sheetCSVUrl(GID_MAP['V5_4_Candidates']));
      const rows = parseCSV(csv);
      for (const row of rows) {
        if (!row.candidate_id) continue;
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
          str(row.likely_category), str(row.short_anchor), str(row.reason_for_review),
          int(row.confidence), str(row.category_primary), str(row.recommended_action),
          str(row.review_status) || 'needs_review', str(row.status) || 'review',
          str(row.source_id), str(row.risk_flag) || 'low', str(row.sensitivity_tag),
          str(row.display_label), str(row.owner), str(row.last_reviewed_at), str(row.approved_by)
        ]);
        counts.candidates++;
      }
    }

    // Log the sync
    await pool.query(`
      INSERT INTO cid_sync_log
        (entendres_upserted, punchlines_upserted, candidates_inserted, source)
      VALUES ($1, $2, $3, 'google_sheet_sync')
    `, [counts.entendres, counts.punchlines, counts.candidates]);

    // Clear the in-memory cache so scoring engine picks up new data immediately
    clearCIDCache();

    console.log(`[CID Sync] ✅ entendres=${counts.entendres} punchlines=${counts.punchlines} candidates=${counts.candidates}`);
    return { synced: true, counts };

  } catch (err: any) {
    console.error('[CID Sync] ❌', err?.message ?? err);
    return { synced: false, counts, error: err?.message };
  }
}

// ── Schedule: runs every 24h alongside integrity check ───────────────────────
const CID_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function startCIDSyncScheduler() {
  if (!SHEET_ID) {
    console.log('[CID Sync] No CID_SHEET_ID configured — sync disabled. Set env var to enable.');
    return;
  }
  // Run immediately on startup, then every 24h
  runCIDSync();
  setInterval(() => runCIDSync(), CID_SYNC_INTERVAL_MS);
  console.log('[CID Sync] Scheduler started — syncing every 24h from Google Sheet.');
}
