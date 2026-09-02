/* Unit tests for the two pieces of real logic in the app.
 * Run with:  node tools/test.js
 */
global.window = {};
const Match = require('../assets/match.js');
require('../assets/srs.js');
const SRS = global.window.SRS;

let failures = 0;
function check(ok, label) {
  if (!ok) failures++;
  console.log((ok ? '  ok   ' : 'FAIL   ') + label);
}
function eq(actual, expected, label) {
  check(JSON.stringify(actual) === JSON.stringify(expected),
    label + '  (got ' + JSON.stringify(actual) + ', want ' + JSON.stringify(expected) + ')');
}

console.log('\nVocabulary answer matching');
[
  ['(to go) fishing', 'fishing', true, 'bracketed aside is optional'],
  ['(to go) fishing', 'to go fishing', true, 'full form also accepted'],
  ['to be situated', 'be situated', true, 'infinitive marker optional'],
  ['news stand, kiosk', 'kiosk', true, 'second alternative'],
  ['news stand, kiosk', 'news stand', true, 'first alternative'],
  ['river (tributary)', 'river', true, 'parenthetical gloss dropped'],
  ['river (tributary)', 'river tributary', true, 'parenthetical gloss kept'],
  ['floor/storey', 'storey', true, 'slash-separated alternatives'],
  ['handsome, beautiful', 'beautiful', true, 'comma-separated alternatives'],
  ['town hall', 'Town Hall', true, 'case is ignored'],
  ["a l'etranger", 'à l’étranger', true, 'accents and curly apostrophes ignored'],
  ['la mairie', 'mairie', true, 'article optional'],
  ['picturesque, pretty', 'pretty  ', true, 'surrounding space ignored'],
  ['crossroads', 'roundabout', false, 'a wrong answer is wrong'],
  ['crossroads', '', false, 'empty answer is wrong'],
  ['crossroads', '   ', false, 'whitespace-only answer is wrong'],
  ['to love', 'to hate', false, 'wrong verb'],
  ['cloudy', 'cloud', false, 'near miss is still wrong'],
  ['news stand, kiosk', 'news', false, 'half an alternative is wrong'],
].forEach(function (c) {
  check(Match.accepts(c[0], c[1]) === c[2],
    JSON.stringify(c[0]) + ' <- ' + JSON.stringify(c[1]) + '  ' + c[3]);
});

console.log('\nSpaced repetition scheduling');
let card = null;
const goodRun = [];
for (let i = 0; i < 5; i++) { card = SRS.grade(card, 2); goodRun.push(card.interval); }
eq(goodRun, [1, 3, 8, 20, 50], 'repeated "good" grows the interval');

const lapsed = SRS.grade(card, 0);
eq(lapsed.interval, 0, '"again" resets the interval');
eq(lapsed.reps, 0, '"again" resets the repetition count');
eq(lapsed.lapses, 1, '"again" records a lapse');
check(lapsed.ease < card.ease, '"again" lowers ease');
check(lapsed.due === SRS.today(), '"again" makes the card due today');

let hard = SRS.grade(SRS.grade(null, 2), 1);
check(hard.ease < 2.5, '"hard" lowers ease');
check(hard.interval >= 1, '"hard" still advances the card');

let easy = SRS.grade(null, 3);
check(easy.ease > 2.5, '"easy" raises ease');
check(easy.interval > SRS.grade(null, 2).interval, '"easy" outpaces "good"');

let floor = { ease: 1.35, interval: 5, reps: 3, lapses: 4 };
for (let i = 0; i < 5; i++) floor = SRS.grade(floor, 0);
check(floor.ease >= 1.3, 'ease never falls below 1.3');

let ceiling = { ease: 2.5, interval: 300, reps: 9, lapses: 0 };
for (let i = 0; i < 5; i++) ceiling = SRS.grade(ceiling, 3);
check(ceiling.interval <= 365, 'interval is capped at a year');

check(SRS.isDue(null), 'an unseen card is due');
check(SRS.isDue({ due: SRS.today() - 1 }), 'an overdue card is due');
check(!SRS.isDue({ due: SRS.today() + 1 }), 'a future card is not due');

console.log(failures ? '\n' + failures + ' FAILURE(S)\n' : '\nAll tests passed.\n');
process.exit(failures ? 1 : 0);
