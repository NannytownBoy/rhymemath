/**
 * migrate-cid-figures.mjs
 *
 * Creates cid_figures — real-world people, scandals, and named references
 * that appear in rap lyrics. Solves the "TD Jakes problem":
 * references to public figures / current events that the main CID
 * canonical records don't catch because they're not hip-hop-native terms.
 *
 * SCHEMA DESIGN:
 *   - figure_name: the primary reference string (e.g. "TD Jakes")
 *   - aliases: JSON array of variant spellings / nicknames
 *   - figure_type: person | event | place | brand | scandal
 *   - domains: JSON array (religion, politics, sports, music, crime, media, etc.)
 *   - cultural_context: short plain-English explanation of why this matters in rap
 *   - scandal_summary: the specific controversy if applicable (what makes it a lyrical reference)
 *   - era: decade(s) this reference is culturally relevant (e.g. "2020s", "1990s-2000s")
 *   - source: who added it (miner | community | admin)
 *   - review_status: candidate | approved | rejected
 *   - status: active | inactive
 */

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const sql = `
  CREATE TABLE IF NOT EXISTS cid_figures (
    id               SERIAL PRIMARY KEY,
    figure_name      TEXT NOT NULL,
    aliases          JSONB DEFAULT '[]'::jsonb,
    figure_type      TEXT NOT NULL DEFAULT 'person',
    domains          JSONB DEFAULT '[]'::jsonb,
    cultural_context TEXT,
    scandal_summary  TEXT,
    era              TEXT,
    source           TEXT DEFAULT 'admin',
    review_status    TEXT NOT NULL DEFAULT 'candidate',
    status           TEXT NOT NULL DEFAULT 'active',
    submitted_by     INTEGER REFERENCES users(id),
    reviewed_by      TEXT,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(figure_name)
  );

  CREATE INDEX IF NOT EXISTS idx_figures_status
    ON cid_figures(review_status, status);

  CREATE INDEX IF NOT EXISTS idx_figures_type
    ON cid_figures(figure_type);
`;

const SEED_FIGURES = [
  {
    figure_name: "TD Jakes",
    aliases: ["T.D. Jakes", "Thomas Jakes", "Bishop Jakes"],
    figure_type: "person",
    domains: ["religion", "scandal"],
    cultural_context: "Prominent megachurch pastor whose alleged sexual misconduct allegations (surfaced 2023-2024) became a cultural reference point in rap lyrics for hypocrisy, switching sides (gender/sexual), or religious corruption.",
    scandal_summary: "Diddy trial witness list allegations (2023-2024) sparked widespread social media discussion about TD Jakes attending parties and sexual identity, making him shorthand in rap for 'switching' or exposed hypocrisy.",
    era: "2020s",
    source: "admin",
    review_status: "approved",
  },
  {
    figure_name: "Diddy",
    aliases: ["Puff Daddy", "Puffy", "P. Diddy", "Brother Love", "Sean Combs", "Love"],
    figure_type: "person",
    domains: ["music", "scandal", "crime"],
    cultural_context: "Hip-hop mogul turned cultural cautionary tale. 2024 federal sex trafficking charges and RICO indictment made him a ubiquitous rap reference for power abuse, industry corruption, and betrayal.",
    scandal_summary: "Arrested September 2024 on federal sex trafficking and racketeering charges. 'Freak offs', Cassie lawsuit, and associated party culture became shorthand for label predation and industry darkness.",
    era: "1990s-2020s",
    source: "admin",
    review_status: "approved",
  },
  {
    figure_name: "OJ Simpson",
    aliases: ["OJ", "The Juice", "O.J."],
    figure_type: "person",
    domains: ["sports", "crime", "scandal"],
    cultural_context: "NFL Hall of Famer acquitted of murdering ex-wife Nicole Brown Simpson in the 1995 'Trial of the Century.' The glove, the Bronco chase, and 'if it doesn't fit you must acquit' are permanent rap reference points.",
    scandal_summary: "1994 double murder, 1995 acquittal, 2007 armed robbery conviction. Used in rap as shorthand for getting away with it, racial injustice in the legal system, or wealthy privilege.",
    era: "1990s-2000s",
    source: "admin",
    review_status: "approved",
  },
  {
    figure_name: "Bill Cosby",
    aliases: ["Cosby", "Cliff Huxtable"],
    figure_type: "person",
    domains: ["entertainment", "scandal", "crime"],
    cultural_context: "Beloved TV father figure convicted of sexual assault (2018). Used in rap as the definitive reference for a public figure hiding predatory behavior behind a clean image.",
    scandal_summary: "Dozens of women alleged drugging and rape over decades. 2018 conviction (later overturned on procedural grounds). Symbol of 'The Cosby Effect' — idol revealed as monster.",
    era: "2010s-2020s",
    source: "admin",
    review_status: "approved",
  },
  {
    figure_name: "R. Kelly",
    aliases: ["R Kelly", "Kells", "The Pied Piper"],
    figure_type: "person",
    domains: ["music", "scandal", "crime"],
    cultural_context: "R&B legend convicted of federal sex trafficking (2021). 'I Believe I Can Fly' vs. predatory behavior makes him a go-to rap reference for musical genius corrupted by depravity.",
    scandal_summary: "Convicted on all counts of sex trafficking and racketeering (2021). The industry's open secret for decades. Referenced in rap for hypocrisy, industry enabling, and the cost of proximity to greatness.",
    era: "2000s-2020s",
    source: "admin",
    review_status: "approved",
  },
  {
    figure_name: "George Floyd",
    aliases: ["Floyd"],
    figure_type: "person",
    domains: ["crime", "politics", "social justice"],
    cultural_context: "Black man murdered by Minneapolis police (May 25, 2020), sparking global Black Lives Matter protests. Cited in rap for police brutality, systemic racism, and the cost of Black life in America.",
    scandal_summary: "Derek Chauvin knelt on Floyd's neck for 9 minutes 29 seconds. Video went viral, sparked largest protest movement in US history. Chauvin convicted of murder in 2021.",
    era: "2020s",
    source: "admin",
    review_status: "approved",
  },
  {
    figure_name: "Donald Trump",
    aliases: ["Trump", "45", "DT", "POTUS 45", "The Donald"],
    figure_type: "person",
    domains: ["politics"],
    cultural_context: "45th US President. Referenced in rap continuously since the 1980s for wealth, bravado, and real estate. Post-2016 references center on populism, racial division, Jan 6, and political chaos.",
    scandal_summary: "2 impeachments, 34 felony convictions (2024), Jan 6 Capitol insurrection, and re-election (2024) make him the most referenced political figure in modern rap.",
    era: "1980s-2020s",
    source: "admin",
    review_status: "approved",
  },
  {
    figure_name: "Meek Mill",
    aliases: ["Meek", "Meek Milly"],
    figure_type: "person",
    domains: ["music", "crime", "social justice"],
    cultural_context: "Philadelphia rapper whose long legal battle with Judge Genece Brinkley became a cause célèbre for criminal justice reform. Drake beef (2015) made 'Charged Up' a cultural inflection point.",
    scandal_summary: "Repeatedly reincarcerated over probation technicalities (2017-2018). REFORM Alliance co-founder. Drake diss cycle elevated him to symbol of industry resilience and system overreach.",
    era: "2010s-2020s",
    source: "admin",
    review_status: "approved",
  },
];

try {
  await pool.query(sql);
  console.log('✓ cid_figures table created');

  let inserted = 0;
  for (const fig of SEED_FIGURES) {
    try {
      await pool.query(`
        INSERT INTO cid_figures
          (figure_name, aliases, figure_type, domains, cultural_context, scandal_summary, era, source, review_status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (figure_name) DO NOTHING
      `, [
        fig.figure_name,
        JSON.stringify(fig.aliases),
        fig.figure_type,
        JSON.stringify(fig.domains),
        fig.cultural_context,
        fig.scandal_summary,
        fig.era,
        fig.source,
        fig.review_status,
      ]);
      inserted++;
    } catch (e) {
      console.error(`  Skip ${fig.figure_name}:`, e.message);
    }
  }
  console.log(`✓ ${inserted} seed figures inserted`);
} catch (e) {
  console.error('Migration error:', e.message);
} finally {
  await pool.end();
}
