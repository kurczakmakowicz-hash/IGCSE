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

  function normalise(s) {
    return String(s)
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // strip accents
      .replace(/['‘’]/g, "'")
      .replace(/[^a-z0-9' ]/g, ' ')
      .replace(FILLER, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* Every form of the expected answer that should be accepted: each
   * comma/slash/"or"-separated alternative, both with a bracketed aside
   * treated as optional and with it treated as part of the answer. So
   * "(to go) fishing" accepts "fishing" and "to go fishing" alike. */
  function alternatives(expected) {
    var out = [];
    String(expected).split(/[,\/;]|\bor\b/).forEach(function (chunk) {
      [chunk.replace(/\([^)]*\)/g, ' '), chunk].forEach(function (variant) {
        var n = normalise(variant);
        if (n && out.indexOf(n) < 0) out.push(n);
      });
    });
    return out;
  }

  function accepts(expected, given) {
    var g = normalise(given);
    if (!g) return false;
    return alternatives(expected).indexOf(g) >= 0;
  }

  return { normalise: normalise, alternatives: alternatives, accepts: accepts };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = window.Match;
