import { scoreComparison } from './server/scoring/scoreComparison';

const jadakiss = `They call me Jadakiss cause I'm the illest
My style is the realest you can feel it in your body
Like a needle in your veins when the dope is going through
I keep it true to the game and I do what I do
Back on my grind with the rhymes that I find
I leave the competition far behind every time
The flow is like water it just goes where it goes
Everybody knows how the story unfolds`;

const beanie = `I'm the one they call when the beef gets real
I got the steel and the will to make you feel
What it means to run these streets with heat
From the block where the hustlers never sleep
My rap is trap it's a fact I react
To any cat who comes at me like that
The game is mine I define the grind
You'll find I'm one of a kind every time`;

const monotone = `I walk to the store and I buy some bread
Then I go back home and I go to bed
I eat my food and I rest my head
I wake up early and I feel some dread`;

const r1 = scoreComparison({ artistA: 'Jadakiss', songA: 'test', verseA: jadakiss, artistB: 'Beanie', songB: 'test', verseB: beanie });
const r2 = scoreComparison({ artistA: 'Monotone', songA: 'test', verseA: monotone, artistB: 'Jadakiss', songB: 'test', verseB: jadakiss });

const getScore = (r: any, side: 'artistA' | 'artistB', cat: string) =>
  r[side].categories.find((c: any) => c.category === cat)?.score ?? 'N/A';

console.log('=== RHYMING SCORES ===');
console.log('Jadakiss:', getScore(r1, 'artistA', 'Rhyming'));
console.log('Beanie Sigel:', getScore(r1, 'artistB', 'Rhyming'));
console.log('Monotone:', getScore(r2, 'artistA', 'Rhyming'));
console.log('Jadakiss (vs mono):', getScore(r2, 'artistB', 'Rhyming'));
console.log('\n=== INTERNAL RHYMES DETECTED ===');
console.log('Jadakiss internal rhymes:', r1.artistA.measured?.internalRhymes);
console.log('Beanie internal rhymes:', r1.artistB.measured?.internalRhymes);
