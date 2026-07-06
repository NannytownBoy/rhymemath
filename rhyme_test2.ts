import { scoreComparison } from './server/scoring/scoreComparison';
import { detectInternalRhymes, detectEndRhymes, getLines, rhymeKey } from './server/scoring/textAnalysis';

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

for (const [name, verse] of [['Jadakiss', jadakiss], ['Beanie', beanie], ['Monotone', monotone]] as const) {
  const lines = getLines(verse);
  const { count: endR } = detectEndRhymes(lines);
  const intR = detectInternalRhymes(lines);
  console.log(`\n${name}: end=${endR} internal=${intR} lines=${lines.length}`);
}

// Test rhymeKey fixes
console.log('\n=== RHYME KEY TESTS ===');
console.log('feet:', rhymeKey('feet'));
console.log('beat:', rhymeKey('beat'));
console.log('treat:', rhymeKey('treat'));
console.log('freak:', rhymeKey('freak'));
console.log('Dominique:', rhymeKey('Dominique'));
console.log('real:', rhymeKey('real'));
console.log('steel:', rhymeKey('steel'));
console.log('feel:', rhymeKey('feel'));
console.log('grind:', rhymeKey('grind'));
console.log('find:', rhymeKey('find'));
console.log('behind:', rhymeKey('behind'));
