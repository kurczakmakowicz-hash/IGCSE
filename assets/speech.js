/* Reading French aloud with the browser's own speech synthesis (the Web
 * Speech API). Nothing is downloaded or uploaded by this file: the voice is
 * whichever French voice the device has, so quality varies by device. Apple
 * devices and Chrome ship good ones; Windows and Android may need a French
 * voice installed in the system settings.
 */
window.Speech = (function () {
  var synth = typeof window !== 'undefined' && window.speechSynthesis;
  var Utterance = typeof window !== 'undefined' && window.SpeechSynthesisUtterance;
  var supported = !!(synth && Utterance);
  var voices = [];
  var listeners = [];
  var options = { voice: '', rate: 0.9 };

  function frenchVoices() {
    return voices.filter(function (v) { return /^fr([-_]|$)/i.test(v.lang || ''); });
  }

  function refresh() {
    voices = (synth && synth.getVoices()) || [];
    listeners.forEach(function (f) { f(); });
  }
  if (supported) {
    refresh();
    // Most browsers fill the voice list in asynchronously.
    if (synth.addEventListener) synth.addEventListener('voiceschanged', refresh);
    else synth.onvoiceschanged = refresh;
  }

  /* France French first, then the better-sounding voices systems ship. */
  function score(v) {
    var s = 0;
    if (/^fr[-_]fr/i.test(v.lang)) s += 4;
    if (/google|natural|premium|enhanced|neural/i.test(v.name)) s += 3;
    if (/am[ée]lie|thomas|audrey|aur[ée]lie|denise|henri|hortense|julie/i.test(v.name)) s += 1;
    return s;
  }

  function voice() {
    var fr = frenchVoices();
    for (var i = 0; i < fr.length; i++) {
      if (options.voice && fr[i].voiceURI === options.voice) return fr[i];
    }
    return fr.slice().sort(function (a, b) { return score(b) - score(a); })[0] || null;
  }

  function say(text) {
    if (!supported || !text) return false;
    var u = new Utterance(text);
    var v = voice();
    u.lang = v ? v.lang : 'fr-FR';
    if (v) u.voice = v;
    u.rate = options.rate;
    synth.cancel();   // a new card interrupts the last one
    synth.speak(u);
    return true;
  }

  var seqTimer = null;
  function stop() {
    clearTimeout(seqTimer);
    seqTimer = null;
    if (supported) synth.cancel();
  }

  function englishVoice() {
    var en = voices.filter(function (v) { return /^en[-_]gb/i.test(v.lang); });
    if (!en.length) en = voices.filter(function (v) { return /^en([-_]|$)/i.test(v.lang); });
    return en[0] || null;
  }

  /* Speak a list of {text, lang: 'fr'|'en', pause (seconds after)} one after
   * another, calling onStep(i) as each starts. A fallback for the Listen page
   * when the recorded audio cannot be loaded; unlike a recording, it stops
   * when the screen locks. Returns a function that stops it. */
  function sequence(parts, onStep, onDone) {
    stop();
    var i = 0, stopped = false;
    function next() {
      if (stopped) return;
      if (i >= parts.length) { if (onDone) onDone(); return; }
      var p = parts[i];
      if (onStep) onStep(i);
      var u = new Utterance(p.text);
      var v = p.lang === 'en' ? englishVoice() : voice();
      u.lang = v ? v.lang : (p.lang === 'en' ? 'en-GB' : 'fr-FR');
      if (v) u.voice = v;
      u.rate = p.lang === 'en' ? 1 : options.rate;
      u.onend = function () { i++; seqTimer = setTimeout(next, (p.pause || 0) * 1000); };
      u.onerror = u.onend;
      synth.speak(u);
    }
    if (supported) next();
    return function () { stopped = true; stop(); };
  }

  /* ---------- turning list entries into something sayable ---------- */

  // Part-of-speech markers: (m), (f pl), (m/f), (adj+m), (inv adj)...
  var MARKER = /\(\s*(?:(?:m|f|v|n|pl|adj|adv|prep|pron|conj|inv)\b[\s\/+]*)+\)/g;
  var LETTERS = 'A-Za-zÀ-ÖØ-öø-ÿœŒ';

  /* "beau/belle (adj)" -> "beau, belle"; "lent(e)" -> "lent, lente";
   * "ennuyeux/euse" -> "ennuyeux, ennuyeuse"; "(aller à la) pêche (f)" ->
   * "aller à la pêche". */
  function speakable(text) {
    var s = String(text).replace(/\*\*/g, '').replace(MARKER, ' ');
    s = s.replace(/\s*\(~[^)]*\)/g, '');   // fermier(~ière): the first form will do
    s = s.replace(new RegExp('([' + LETTERS + ']+)\\((e|s|x|es|ne|le|se)\\)', 'g'),
      function (m, word, end) { return word + ', ' + word + end; });
    s = s.replace(new RegExp('([' + LETTERS + "']+)\\/([a-zà-ÿœ]{2,6})\\b", 'g'), function (m, full, end) {
      var at = full.lastIndexOf(end.slice(0, 2));
      return full + ', ' + (at > 0 ? full.slice(0, at) + end : end);
    });
    return s
      .replace(/\//g, ', ')
      .replace(/[()~]/g, ' ')
      .replace(/\betc\b\.?|…/g, ' ')
      .replace(/\s*:\s*/g, ', ')
      .replace(/\s*·\s*/g, ', ')
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.!?])/g, '$1')
      .replace(/^[,\s]+|[,\s]+$/g, '');
  }

  /* A conjugation-table row: say the plain masculine forms, not "allé(e)(s)". */
  function speakableRow(row) {
    return speakable(String(row).replace(/\((e|s|x)\)/g, '').replace(/(\w)\(e\)s/g, '$1s'));
  }

  return {
    supported: supported,
    say: say,
    stop: stop,
    sequence: sequence,
    voice: voice,
    frenchVoices: frenchVoices,
    configure: function (o) { Object.keys(o).forEach(function (k) { options[k] = o[k]; }); },
    onVoices: function (f) { listeners.push(f); },
    speakable: speakable,
    speakableRow: speakableRow
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = window.Speech;
