/* Comparing a typed vocabulary answer against the specification's gloss.
 *
 * The prescribed list writes entries like "(aller a la) peche (f) - (to go)
 * fishing" or "news stand, kiosk". Marking those wrong for a missing accent,
 * article or bracketed aside would train the wrong thing, so comparison is
 * deliberately forgiving about everything except the word itself.
 */
window.Match = (function () {
  /* Words that carry no information here: English infinitive markers and
   * articles, and French articles and partitives. */
  var FILLER = /\b(to|the|a|an|le|la|les|l|un|une|des|du|de|d)\b/g;
  var FILLER_WORD = /^(to|the|a|an|le|la|les|l|un|une|des|du|de|d)$/;

  function normalise(s) {
    var plain = String(s)
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // strip accents
      .replace(/['‘’]/g, "'")
      .replace(/[^a-z0-9' ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    var core = plain.replace(FILLER, ' ').replace(/\s+/g, ' ').trim();
    if (core || !plain) return core;
    // The word itself looks like filler once accents go (thé, à, de, là):
    // keep its last word, dropping only articles in front of it.
    var words = plain.split(' ');
    while (words.length > 1 && FILLER_WORD.test(words[0])) words.shift();
    return words.join(' ');
  }

  /* Every form of the expected answer that should be accepted: each
   * comma/slash/"or"-separated alternative, both with a bracketed aside
   * treated as optional and with it treated as part of the answer. So
   * "(to go) fishing" accepts "fishing" and "to go fishing" alike. */
  /* Part-of-speech markers such as (m), (f pl), (m/f), (adj+m), (inv adj):
   * not part of the answer, and their slashes are not alternatives. */
  var MARKER = /\(\s*(?:(?:m|f|v|n|pl|adj|adv|prep|pron|conj|inv)\b[\s\/+]*)+\)/g;

  function alternatives(expected) {
    // The whole gloss counts too, for a student who types every alternative.
    var out = [normalise(String(expected).replace(MARKER, ' '))];
    String(expected).replace(MARKER, ' ').split(/[,\/;]|\bor\b/).forEach(function (chunk) {
      // "(to go) fishing": the aside optional, or kept; "voisin(e)": glued on.
      [chunk.replace(/\([^)]*\)/g, ' '), chunk, chunk.replace(/(\w)\((\w+)\)/g, '$1$2')].forEach(function (variant) {
        var n = normalise(variant);
        if (n && out.indexOf(n) < 0) out.push(n);
      });
    });
    return out;
  }

  function accepts(expected, given) {
    var g = normalise(String(given).replace(MARKER, ' '));
    if (!g) return false;
    return alternatives(expected).indexOf(g) >= 0;
  }

  /* ---------- French answers: grammar gaps, rewrites, verb forms ----------
   *
   * The Paper 2 grammar task marks spelling, so here accents, apostrophes and
   * hyphens all count. What does not count: capitals, spacing, punctuation
   * (including French spacing before ? and !) and the **bold** markers that
   * prompts use to highlight words. */
  function normaliseFrench(s) {
    return String(s)
      .normalize('NFC')
      .toLowerCase()
      .replace(/\*\*/g, '')
      .replace(/[\u2018\u2019\u02bc`\u00b4]/g, "'")
      .replace(/[\u2010\u2011\u2013]/g, '-')
      .replace(/\u0153/g, 'oe').replace(/\u00e6/g, 'ae')     // œ, æ typed as oe, ae
      .replace(/[.,!?;:\u2026"\u00ab\u00bb\u201c\u201d()]/g, ' ')
      .replace(/\s*'\s*/g, "'")
      .replace(/\s*-\s*/g, '-')
      .replace(/[\s\u00a0\u202f]+/g, ' ')
      .trim();
  }

  function stripAccents(s) {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function acceptsFrench(answers, given) {
    var g = normaliseFrench(given);
    if (!g) return false;
    return answers.some(function (a) { return normaliseFrench(a) === g; });
  }

  /* Right apart from accents: worth telling the student exactly that. */
  function accentSlip(answers, given) {
    var g = stripAccents(normaliseFrench(given));
    if (!g || acceptsFrench(answers, given)) return false;
    return answers.some(function (a) { return stripAccents(normaliseFrench(a)) === g; });
  }

  /* A conjugated form without its subject pronoun: "j'ai" -> "ai",
   * "nous nous levons" -> "nous levons", "elle est allée" -> "est allée". */
  var SUBJECT = /^(je |j'|tu |il |elle |on |nous |vous |ils |elles )/;
  function withoutSubject(form) {
    return String(form).replace(SUBJECT, '');
  }

  /* Every accepted way to type a verb form: with or without the pronoun. */
  function verbAnswers(forms) {
    var out = [];
    forms.forEach(function (f) {
      [f, withoutSubject(f)].forEach(function (v) { if (out.indexOf(v) < 0) out.push(v); });
    });
    return out;
  }

  return {
    normalise: normalise, alternatives: alternatives, accepts: accepts,
    normaliseFrench: normaliseFrench, acceptsFrench: acceptsFrench,
    accentSlip: accentSlip, withoutSubject: withoutSubject, verbAnswers: verbAnswers
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = window.Match;
