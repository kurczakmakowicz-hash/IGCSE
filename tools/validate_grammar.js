/* Structural checks for the hand-authored French grammar topics in
 * content/french/grammar/*.json. Run on one file or the whole directory:
 *   node tools/validate_grammar.js [file-or-dir ...]
 * Exits non-zero and lists every problem if anything is malformed.
 */
const fs = require('fs');
const path = require('path');

const AREAS = ['Nouns', 'Articles', 'Adjectives', 'Adverbs', 'Quantifiers/intensifiers',
  'Pronouns', 'Verbs', 'Conjunctions', 'Numbers, quantity, dates and time'];
const TYPES = ['flip', 'gap', 'transform'];

function str(v) { return typeof v === 'string' && v.trim().length > 0; }

function validateTopic(t, file) {
  const errs = [];
  const err = (m) => errs.push(path.basename(file) + ': ' + m);
  if (!t || typeof t !== 'object') { err('not an object'); return errs; }
  const expectedId = path.basename(file, '.json');
  if (t.id !== expectedId) err('id "' + t.id + '" must match file name "' + expectedId + '"');
  if (!AREAS.includes(t.area)) err('area must be one of ' + AREAS.join(' | '));
  ['title', 'spec'].forEach((k) => { if (!str(t[k])) err('missing ' + k); });
  if (typeof t.receptive !== 'boolean') err('receptive must be true or false');
  if (typeof t.order !== 'number') err('order must be a number');
  if (!Array.isArray(t.summary) || t.summary.length < 3 || t.summary.length > 12 || !t.summary.every(str)) {
    err('summary must be 3-12 non-empty strings');
  }
  if (!Array.isArray(t.cards)) { err('cards must be an array'); return errs; }

  const ids = new Set();
  let typed = 0;
  t.cards.forEach((c, i) => {
    const where = 'card ' + (c && c.id ? c.id : '#' + i) + ': ';
    if (!c || typeof c !== 'object') { err(where + 'not an object'); return; }
    if (!str(c.id) || c.id.indexOf(t.id + '-') !== 0) err(where + 'id must start with "' + t.id + '-"');
    if (ids.has(c.id)) err(where + 'duplicate id');
    ids.add(c.id);
    if (!TYPES.includes(c.type)) { err(where + 'type must be flip | gap | transform'); return; }
    if (c.type === 'flip') {
      if (!str(c.front) || !str(c.back)) err(where + 'flip needs front and back');
      return;
    }
    typed++;
    if (!Array.isArray(c.answers) || !c.answers.length || !c.answers.every(str)) {
      err(where + 'answers must be a non-empty array of strings');
    } else {
      c.answers.forEach((a) => {
        if (/\((e|s|es|x)\)/.test(a)) err(where + 'answer "' + a + '" uses (e)/(s) shorthand — list each form separately');
        if (a.indexOf('___') >= 0) err(where + 'answer contains the blank marker');
        if (a.indexOf('/') >= 0) err(where + 'answer "' + a + '" contains "/" — list alternatives as separate answers');
      });
      if (new Set(c.answers).size !== c.answers.length) err(where + 'duplicate answers');
    }
    if (!str(c.en)) err(where + 'missing en (English translation)');
    if (!str(c.why)) err(where + 'missing why (the rule applied)');
    if (c.type === 'gap') {
      if (!str(c.prompt)) err(where + 'missing prompt');
      else if ((c.prompt.match(/___/g) || []).length !== 1) err(where + 'gap prompt must contain exactly one ___');
      if (!str(c.base) && !str(c.hint)) err(where + 'gap needs base (word in brackets) or hint');
    }
    if (c.type === 'transform') {
      if (!str(c.instruction) || !str(c.prompt)) err(where + 'transform needs instruction and prompt');
      if (c.prompt && c.prompt.indexOf('___') >= 0) err(where + 'transform prompt must not contain ___');
    }
  });
  if (t.receptive && typed) err('receptive topic must contain flip cards only');
  if (!t.receptive && typed < 6) err('productive topic needs at least 6 gap/transform cards (has ' + typed + ')');
  if (t.cards.length < 8) err('needs at least 8 cards (has ' + t.cards.length + ')');
  return errs;
}

function filesFrom(args) {
  const out = [];
  (args.length ? args : [path.join(__dirname, '..', 'content', 'french', 'grammar')]).forEach((p) => {
    if (fs.statSync(p).isDirectory()) {
      fs.readdirSync(p).filter((f) => f.endsWith('.json')).sort().forEach((f) => out.push(path.join(p, f)));
    } else out.push(p);
  });
  return out;
}

function validateFiles(files) {
  const errs = [];
  const seen = new Map();
  files.forEach((f) => {
    let t;
    try { t = JSON.parse(fs.readFileSync(f, 'utf8')); }
    catch (e) { errs.push(path.basename(f) + ': invalid JSON — ' + e.message); return; }
    errs.push(...validateTopic(t, f));
    (t.cards || []).forEach((c) => {
      if (c && c.id && seen.has(c.id) && seen.get(c.id) !== f) errs.push(path.basename(f) + ': card id ' + c.id + ' also used in ' + path.basename(seen.get(c.id)));
      if (c && c.id) seen.set(c.id, f);
    });
  });
  return errs;
}

module.exports = { validateTopic, validateFiles, filesFrom };

if (require.main === module) {
  const files = filesFrom(process.argv.slice(2));
  const errs = validateFiles(files);
  if (errs.length) { console.log(errs.join('\n')); console.log('\n' + errs.length + ' problem(s) in ' + files.length + ' file(s)'); process.exit(1); }
  console.log('OK — ' + files.length + ' file(s) valid');
}
