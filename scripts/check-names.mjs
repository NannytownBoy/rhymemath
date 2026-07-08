import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const { rows } = await pool.query(`SELECT id, artist_name, song_name, score_overall FROM analyses ORDER BY artist_name, song_name`);

const kendrick = rows.filter(r => r.artist_name.toLowerCase().includes('kendrick'));
const jid = rows.filter(r => r.artist_name.toLowerCase() === 'jid');
const mach = rows.filter(r => r.artist_name.toLowerCase().includes('mach'));

console.log('\nKENDRICK:');
kendrick.forEach(r => console.log(`  [${r.id}] "${r.song_name}" — ${r.score_overall}`));
console.log('\nJID:');
jid.forEach(r => console.log(`  [${r.id}] name="${r.artist_name}" song="${r.song_name}"`));
console.log('\nMACH:');
mach.forEach(r => console.log(`  [${r.id}] name="${r.artist_name}" song="${r.song_name}"`));

await pool.end();
