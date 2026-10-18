/* Unit tests for the two pieces of real logic in the app.
 * Run with:  node tools/test.js
 */
global.window = {};
const fs = require('fs');
const path = require('path');
const Match = require('../assets/match.js');
function vocabWordsCount() {
  const set = new Set();
  global.window.IGCSE_DATA.french.topics.forEach(function (t) { t.subtopics.forEach(function (s) { s.vocab.forEach(function (v) { set.add(v.fr); }); }); });
  return set.size;
}
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
  ['agent de police (m/f)', 'agent de police', true, 'part-of-speech marker (m/f) is not an alternative'],
  ['agent de police (m/f)', 'f', false, '...and its letters are not answers'],
  ['voisin(e) (m/f)', 'voisin', true, 'feminine ending optional'],
  ['voisin(e) (m/f)', 'voisine', true, 'feminine form accepted'],
  ['aller simple (m/adj)', 'aller simple (m/adj)', true, 'typing the entry exactly as shown'],
  ['beau/belle (adj)', 'belle', true, 'slash alternatives still split'],
  ['bon séjour (adj+m)', 'bon sejour', true, 'combined marker (adj+m)'],
  ['grandes vacances (f pl)', 'grandes vacances', true, 'marker (f pl)'],
  ['thé (m)', 'thé', true, 'a word that looks like filler without its accent'],
  ['thé (m)', 'le thé', true, '...with its article'],
  ['thé (m)', 'café', false, '...and a wrong word is still wrong'],
  ['à', 'à', true, 'preposition à'],
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

console.log('\nFrench answer matching (grammar and verbs: accents count)');
[
  [['sont allées'], 'sont allées', true, 'exact'],
  [['sont allées'], 'Sont Allées', true, 'capitals ignored'],
  [['sont allées'], '  sont   allées ', true, 'spacing ignored'],
  [['sont allées'], 'sont allees', false, 'missing accent is wrong'],
  [['sont allées'], 'sont allés', false, 'wrong agreement is wrong'],
  [["Je l'ai vu."], 'je l’ai vu', true, 'curly apostrophe and final full stop ignored'],
  [["Je l'ai vu."], 'je lai vu', false, 'missing apostrophe is wrong'],
  [['Est-ce que tu viens ?'], 'Est-ce que tu viens?', true, 'French spacing before ? ignored'],
  [['Est-ce que tu viens ?'], 'Est ce que tu viens', false, 'missing hyphen is wrong'],
  [['Vas-y !'], 'vas-y', true, 'exclamation mark ignored'],
  [['ma sœur'], 'ma soeur', true, 'oe accepted for œ'],
  [['du'], '', false, 'empty answer is wrong'],
].forEach(function (c) {
  check(Match.acceptsFrench(c[0], c[1]) === c[2], JSON.stringify(c[0]) + ' <- ' + JSON.stringify(c[1]) + '  ' + c[3]);
});
check(Match.accentSlip(['sont allées'], 'sont allees'), 'accent slip is spotted');
check(!Match.accentSlip(['sont allées'], 'sont allées'), 'a right answer is not an accent slip');
check(!Match.accentSlip(['sont allées'], 'sont partis'), 'a wrong word is not an accent slip');

const forms = Match.verbAnswers(["j'ai", 'je suis allée', 'nous nous levons', 'va']);
['ai', "j'ai", 'suis allée', 'nous nous levons', 'va'].forEach(function (f) {
  check(forms.indexOf(f) >= 0, 'verb form accepted: ' + f);
});
check(forms.indexOf('levons') < 0, 'reflexive pronoun is not optional');
check(forms.indexOf('nous levons') < 0, '"nous levons" (reflexive pronoun forgotten) is not accepted');
check(Match.verbAnswers(['vous vous êtes levés']).indexOf('vous êtes levés') < 0, '"vous êtes levés" is not accepted for se lever');
check(Match.verbAnswers(['je me lève']).indexOf('me lève') >= 0, 'je me lève can drop its subject: me lève');

console.log('\nReading aloud: what gets spoken');
const Speech = require('../assets/speech.js');
[
  ['château (m)', 'château'],
  ['beau/belle (adj)', 'beau, belle'],
  ['lent(e) (adj)', 'lent, lente'],
  ['ennuyeux/euse (adj)', 'ennuyeux, ennuyeuse'],
  ['(aller à la) pêche (f)', 'aller à la pêche'],
  ['grandes vacances (f pl)', 'grandes vacances'],
  ['le lundi/le mardi… etc (adv)', 'le lundi, le mardi'],
  ['Je ne mange **jamais** de viande.', 'Je ne mange jamais de viande.'],
].forEach(function (c) { eq(Speech.speakable(c[0]), c[1], 'speaks ' + JSON.stringify(c[0])); });
eq(Speech.speakableRow('il est allé · elle est allée · on est allé(e)(s)'), 'il est allé, elle est allée, on est allé',
  'table row drops (e)(s) shorthand');
eq(Speech.speakableRow('nous sommes allé(e)s'), 'nous sommes allés', 'table row plural shorthand');
check(Speech.supported === false, 'no speech engine outside a browser: buttons are simply not shown');

console.log('\nGenerated French data');
require('../data/french.js');
require('../data/french_verbs.js');
const fr = global.window.IGCSE_DATA.french;
const vocab = [];
fr.topics.forEach(function (t) { t.subtopics.forEach(function (s) { s.vocab.forEach(function (v) { vocab.push(v); }); }); });
check(vocab.length > 2000, 'over 2,000 vocabulary entries (' + vocab.length + ')');
check(vocab.every(function (v) { return v.fr && v.en; }), 'every entry has French and English');
check(!vocab.some(function (v) { return /Issue \d|Pearson|Specification|\(continued\)/.test(v.fr + ' ' + v.en); }),
  'no page headers or footers parsed as words');
const has = function (fr, en) { return vocab.some(function (v) { return v.fr === fr && v.en === en; }); };
check(has('salut', 'hello'), 'entry whose dash sits in its own text run: salut');
check(has('crème solaire (f)', 'suncream, sunblock, sunscreen'), 'gloss wrapped onto a second line is kept whole');
check(has('dans quelle mesure/jusqu’à quel point est-ce que', 'to what extent?'), 'entry running across the gutter');
check(has('four à micro-ondes (m)', 'microwave'), 'French split over two lines is rejoined');

const V = global.window.IGCSE_DATA.frenchVerbs;
check(V.verbs.length >= 50, 'at least 50 verbs (' + V.verbs.length + ')');
let complete = true;
V.verbs.forEach(function (v) {
  Object.keys(v.tenses).forEach(function (t) {
    const want = t === 'imperative' ? ['tu', 'nous', 'vous'] : V.persons;
    want.forEach(function (p) { if (!(v.tenses[t].forms[p] || []).length) { complete = false; console.log('   missing', v.inf, t, p); } });
  });
});
check(complete, 'every verb has a form for every person in every tense it lists');
const aller = V.verbs.find(function (v) { return v.inf === 'aller'; });
eq(aller.tenses.perfect.forms.elle, ['elle est allée'], 'aller perfect: elle est allée');
eq(aller.tenses.perfect.forms.ils, ['ils sont allés'], 'aller perfect: ils sont allés');
check(aller.tenses.perfect.forms.vous.indexOf('vous êtes allée') >= 0, 'polite singular vous accepted for être verbs');
const lever = V.verbs.find(function (v) { return v.inf === 'se lever'; });
eq(lever.tenses.perfect.forms.tu, ["tu t'es levé", "tu t'es levée"], 'reflexive perfect: tu t\'es levé(e)');
eq(V.verbs.find(function (v) { return v.inf === 'faire'; }).tenses.future.forms.nous, ['nous ferons'], 'irregular future stem: ferons');

console.log('\nGrammar topics');
const { validateFiles, filesFrom } = require('./validate_grammar.js');
const grammarFiles = filesFrom([]);
const grammarErrs = validateFiles(grammarFiles);
grammarErrs.forEach(function (e) { console.log('   ' + e); });
check(grammarFiles.length > 0 && !grammarErrs.length, grammarFiles.length + ' grammar topic files are valid');

console.log('\nExample sentences');
const { validate: validateSentences, DIR: SENT_DIR } = require('./validate_sentences.js');
const sentFiles = fs.readdirSync(SENT_DIR).filter((f) => f.endsWith('.json')).map((f) => path.join(SENT_DIR, f));
const sentErrs = validateSentences(sentFiles, true);
sentErrs.slice(0, 10).forEach(function (e) { console.log('   ' + e); });
check(sentFiles.length > 0 && !sentErrs.length, 'every vocabulary word has a valid example sentence');
require('../data/french_sentences.js');
check(Object.keys(global.window.IGCSE_DATA.frenchSentences || {}).length === vocabWordsCount(),
  'data/french_sentences.js is built from the current sentence files');

console.log('\nListening audio');
require('../data/french_audio.js');
const A = global.window.IGCSE_DATA.frenchAudio;
check(!!A, 'data/french_audio.js has an audio index');
if (A) {
  const root = path.join(__dirname, '..');
  const bankBytes = {};
  let bankOk = true;
  Object.keys(A.banks).forEach(function (b) {
    const f = path.join(root, A.banks[b].file);
    const ok = fs.existsSync(f) && fs.statSync(f).size === A.banks[b].bytes;
    if (!ok) { bankOk = false; console.log('   missing or wrong size: ' + A.banks[b].file); }
    else bankBytes[b] = fs.readFileSync(f);
  });
  check(bankOk, Object.keys(A.banks).length + ' audio files present with the sizes the index expects');
  let clipsOk = true, missing = 0;
  const words = new Set();
  global.window.IGCSE_DATA.french.topics.forEach(function (t) { t.subtopics.forEach(function (s) { s.vocab.forEach(function (v) { words.add(v.fr); }); }); });
  words.forEach(function (w) {
    const c = A.clips[w];
    if (!c || !c.w || !c.e || !c.s) { missing++; return; }
    ['w', 'e', 's'].forEach(function (k) {
      const buf = bankBytes[c.b];
      const off = c[k][0], len = c[k][1];
      if (!buf || off + len > buf.length || buf[off] !== 0xFF || (buf[off + 1] & 0xE0) !== 0xE0 || !(c[k][2] > 0.2)) clipsOk = false;
    });
  });
  check(missing === 0, 'every word has French, English and sentence clips (' + missing + ' missing)');
  check(clipsOk, 'every clip lies inside its file and starts on an MP3 frame');
  const sil = path.join(root, A.silence.file);
  check(fs.existsSync(sil) && A.silence.dur > 0.3, 'silence clip present');
}

console.log(failures ? '\n' + failures + ' FAILURE(S)\n' : '\nAll tests passed.\n');
process.exit(failures ? 1 : 0);
