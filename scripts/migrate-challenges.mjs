import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const sql = `
  CREATE TABLE IF NOT EXISTS annotation_challenges (
    id            SERIAL PRIMARY KEY,
    annotation_id INTEGER NOT NULL REFERENCES annotations(id) ON DELETE CASCADE,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason        TEXT NOT NULL,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(annotation_id, user_id)
  );

  -- Index for fast threshold checks
  CREATE INDEX IF NOT EXISTS idx_challenges_annotation
    ON annotation_challenges(annotation_id);

  -- Track mod decision on challenged annotations (reuses annotations.status)
  -- 'challenged' = flagged, pending mod review (added to existing status enum pattern)
  -- No schema change needed — communityRoutes will set status = 'challenged'
`;

try {
  await pool.query(sql);
  console.log('✓ annotation_challenges table created');
} catch (e) {
  console.error('Migration error:', e.message);
} finally {
  await pool.end();
}
