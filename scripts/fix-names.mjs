import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

console.log('🔧  RhymeMath name + duplicate fix...\n');

// 1. Fix "Jid" → "JID" (row 65)
await pool.query(`UPDATE analyses SET artist_name = 'JID' WHERE id = 65`);
console.log('✅  Fixed: Jid → JID (row 65)');

// 2. Fix "Mach-hommy" → "Mach-Hommy" (row 75)
await pool.query(`UPDATE analyses SET artist_name = 'Mach-Hommy' WHERE id = 75`);
console.log('✅  Fixed: Mach-hommy → Mach-Hommy (row 75)');

// 3. Remove duplicate JID Gold Feet "(corrected)" — keep row 7 (original), delete row 10
await pool.query(`DELETE FROM analyses WHERE id = 10`);
console.log('✅  Removed: JID "Gold Feet (corrected)" duplicate (row 10)');

// 4. Remove duplicate Kendrick "Wats Wrong?" — keep row 41 "What's Wrong", delete row 43
await pool.query(`DELETE FROM analyses WHERE id = 43`);
console.log('✅  Removed: Kendrick "Wats Wrong?" duplicate (row 43, keeping "What\'s Wrong" row 41)');

// 5. Also fix the artist slug in any related threads/comments if they reference old names
// (threads link by resultId which is the row id, so no slug fix needed)

console.log('\n✅  All fixes applied.');
await pool.end();
