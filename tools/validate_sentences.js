/* Checks the French example sentences (content/french/sentences/*.json):
 * one sentence for every word on the prescribed list, nothing extra, and each
 * entry well-formed. Each file is an array of {"w", "fr", "en"}: w is the
 * list entry exactly as in data/french.js, fr the example sentence, en its
 * English translation.
 *   node tools/validate_sentences.js [file ...]   (no args: all files, plus coverage)
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'content', 'french', 'sentences');

function vocabWords() {
  global.window = global.window || {};
  require('../data/french.js');
  const words = new Set();
  window.IGCSE_DATA.french.topics.forEach((t) => t.subtopics.forEach((s) => s.vocab.forEach((v) => words.add(v.fr))));
  return words;
}

function checkEntry(e, where) {
  const errs = [];
  if (!e || typeof e !== 'object') return [where + ': not an object'];
  ['w', 'fr', 'en'].forEach((k) => { if (typeof e[k] !== 'string' || !e[k].trim()) errs.push(where + ': missing ' + k); });
  if (errs.length) return errs;
  const n = e.fr.trim().split(/\s+/).length;
  if (n < 3 || n > 20) errs.push(where + ': sentence should be 3-20 words (has ' + n + '): ' + e.fr);
  if (!/[.!?]$/.test(e.fr.trim())) errs.push(where + ': French sentence must end with . ! or ?');
  if (!/[.!?]$/.test(e.en.trim())) errs.push(where + ': English sentence must end with . ! or ?');
  if (/[‘’]/.test(e.fr)) errs.push(where + ': use straight apostrophes in French');
  if (/\s{2,}|^\s|\s$/.test(e.fr) || /\s{2,}|^\s|\s$/.test(e.en)) errs.push(where + ': stray spaces');
  if (/___|\*\*/.test(e.fr + e.en)) errs.push(where + ': no blanks or bold markers');
  return errs;
}

function validate(files, wantCoverage) {
  const errs = [];
  const seen = new Map();
  files.forEach((f) => {
    let list;
    try { list = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { errs.push(path.basename(f) + ': invalid JSON — ' + e.message); return; }
    if (!Array.isArray(list)) { errs.push(path.basename(f) + ': must be an array'); return; }
    list.forEach((e, i) => {
      const where = path.basename(f) + ' #' + i + (e && e.w ? ' (' + e.w + ')' : '');
      errs.push(...checkEntry(e, where));
      if (e && e.w) {
        if (seen.has(e.w)) errs.push(where + ': duplicate entry, also in ' + seen.get(e.w));
        seen.set(e.w, path.basename(f));
      }
    });
  });
  const words = vocabWords();
  seen.forEach((file, w) => { if (!words.has(w)) errs.push(file + ': "' + w + '" is not an entry in data/french.js'); });
  if (wantCoverage) words.forEach((w) => { if (!seen.has(w)) errs.push('missing a sentence for "' + w + '"'); });
  return errs;
}

module.exports = { validate, DIR };

if (require.main === module) {
  const args = process.argv.slice(2);
  const files = args.length ? args : fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort().map((f) => path.join(DIR, f));
  const errs = validate(files, !args.length);
  if (errs.length) { console.log(errs.slice(0, 200).join('\n')); console.log('\n' + errs.length + ' problem(s)'); process.exit(1); }
  console.log('OK — ' + files.length + ' file(s) valid' + (args.length ? '' : ', every word covered'));
}
