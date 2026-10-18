/* Prints the list of clips tools/build_audio.py should synthesise, as JSON:
 * one entry per unique vocabulary word, in the app's order, with the exact
 * text to speak. The French goes through the app's own speakable() so what
 * the audio says matches what the 🔊 buttons say.
 */
global.window = {};
require('../data/french.js');
require('../data/french_sentences.js');
const Speech = require('../assets/speech.js');

function englishSpeakable(en) {
  return String(en)
    .replace(/\(=\s*/g, '(')
    .replace(/\s*\/\s*/g, ' or ')
    .replace(/\s*\(\s*/g, ', ')
    .replace(/[)~]/g, ' ')
    .replace(/\betc\b\.?|…/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/^[,\s]+|[,\s]+$/g, '');
}

const ex = window.IGCSE_DATA.frenchSentences || {};
const seen = new Set();
const out = [];
window.IGCSE_DATA.french.topics.forEach((t) => t.subtopics.forEach((s) => s.vocab.forEach((v) => {
  if (seen.has(v.fr)) return;
  seen.add(v.fr);
  out.push({
    key: v.fr, bank: s.id,
    w: Speech.speakable(v.fr),
    e: englishSpeakable(v.en),
    s: ex[v.fr] ? ex[v.fr][0] : null
  });
})));
process.stdout.write(JSON.stringify(out));
