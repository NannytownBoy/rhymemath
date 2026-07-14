import { analyzeVerseSolo } from "../server/scoring/scoreComparison.js";

const FULL_VERSE = `I used to hustle, now all I do is handle business
Dropped out of school, now I'm teaching them the difference
See I'm from where they cram you in a project building
You grow up quick, the young'uns wearing prison feelings
My mother told me that I'd die in the street
I said I wouldn't let the system turn me to obsolete
We getting money but we still can't find our peace
The city full of killers and they want us all deceased
I seen my homies fall to cases and the grave
I watched them take my cousin out in chains and cuffs
The block is talking but the system never gave
A damn about the lives of those it deemed not enough
So we keep climbing even when the ladder's broken
The doors are locked but every dream inside stays open
We pour libations and we pour it on the curb
The hustle never stops it's just the game in different words`;

const result = await analyzeVerseSolo({ artistName: "Test", songName: "Full Verse", verse: FULL_VERSE });
const r = result as any;
console.log(`Full verse (16 lines):`);
console.log(`  Overall: ${r.scores?.overall?.toFixed(1)}`);
console.log(`  Flow: ${r.scores?.flow?.toFixed(1)} | Rhyme: ${r.scores?.rhyming?.toFixed(1)} | Wordplay: ${r.scores?.wordplay?.toFixed(1)}`);
console.log(`  Story: ${r.scores?.storytelling?.toFixed(1)} | Punch: ${r.scores?.punchlines?.toFixed(1)}`);
console.log(`  Conceptual: ${r.conceptualScore}`);
console.log(`  Suppression flags: ${JSON.stringify(r.suppressionFlags ?? [])}`);
console.log(`  Version: ${r.scoringVersion}`);
