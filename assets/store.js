/* Catalogue of every studiable item, plus the progress state behind it.
 *
 * Progress lives in localStorage and nowhere else. Two independent things are
 * tracked per item:
 *   confidence — a checklist value the student sets directly (0/1/2)
 *   card       — the spaced-repetition schedule (see srs.js)
 * Setting a confidence above 0 puts the item into the review rotation.
 */
window.Store = (function () {
  var KEY = 'igcse.progress.v1';
  var SUBJECT_IDS = ['biology', 'chemistry', 'maths', 'french'];

  /* ---------- catalogue ---------- */

  var subjects = {};
  var points = {};   // subjectId -> [point]
  var vocab = [];    // deduplicated across themes
  var grammarTopics = [];  // French grammar topics, each with its card items
  var grammar = [];        // every grammar card item
  var verbs = [];          // French verbs, each with one item per tense
  var verbItems = [];
  var byId = {};

  function buildCatalogue() {
    SUBJECT_IDS.forEach(function (sid) {
      var data = window.IGCSE_DATA && window.IGCSE_DATA[sid];
      if (!data) return;
      subjects[sid] = data;
      points[sid] = [];
      var seenVocab = {};

      data.topics.forEach(function (topic) {
        topic.subtopics.forEach(function (sub) {
          (sub.points || []).forEach(function (p) {
            var item = {
              id: sid + '#' + p.ref,
              kind: 'point',
              subject: sid,
              ref: p.ref,
              text: p.text,
              bullets: p.bullets || null,
              details: p.details || null,
              group: p.group || null,
              paper2only: !!p.paper2only,
              practical: !!p.practical,
              higher: !!p.higher,
              topicId: topic.id,
              topicTitle: topic.title,
              subId: sub.id,
              subTitle: sub.title
            };
            points[sid].push(item);
            byId[item.id] = item;
          });
          (sub.vocab || []).forEach(function (w) {
            var id = 'french#v#' + w.fr;
            var item = byId[id];
            if (!item) {
              item = {
                id: id,
                kind: 'vocab',
                subject: 'french',
                fr: w.fr,
                en: w.en,
                themes: []
              };
              byId[id] = item;
              vocab.push(item);
            }
            // The same word can be prescribed under more than one theme.
            if (!seenVocab[id]) seenVocab[id] = true;
            item.themes.push({
              themeId: topic.id, themeTitle: topic.title,
              subId: sub.id, subTitle: sub.title
            });
          });
        });
      });
    });
  }

  /* French grammar cards and the verb-conjugation deck live in their own data
   * files; a missing file just means that part of the app is empty. */
  function buildFrenchExtras() {
    var g = window.IGCSE_DATA && window.IGCSE_DATA.frenchGrammar;
    (g ? g.topics : []).forEach(function (t) {
      var topic = {
        id: t.id, area: t.area, title: t.title, spec: t.spec,
        receptive: t.receptive, summary: t.summary, items: []
      };
      t.cards.forEach(function (c) {
        var item = { id: 'french#g#' + c.id, kind: 'grammar', subject: 'french', card: c, topic: topic };
        topic.items.push(item);
        grammar.push(item);
        byId[item.id] = item;
      });
      grammarTopics.push(topic);
    });

    var v = window.IGCSE_DATA && window.IGCSE_DATA.frenchVerbs;
    if (!v) return;
    var tenseInfo = {};
    v.tenses.forEach(function (t) { tenseInfo[t.id] = t; });
    v.verbs.forEach(function (verb) {
      var entry = { inf: verb.inf, en: verb.en, group: verb.group, aux: verb.aux, items: [] };
      v.tenses.forEach(function (t) {
        var data = verb.tenses[t.id];
        if (!data) return;
        var item = {
          id: 'french#verb#' + verb.inf + '#' + t.id, kind: 'verb', subject: 'french',
          verb: entry, tense: tenseInfo[t.id], forms: data.forms, table: data.table
        };
        entry.items.push(item);
        verbItems.push(item);
        byId[item.id] = item;
      });
      verbs.push(entry);
    });
  }

  /* ---------- persistence ---------- */

  var blank = {
    version: 1,
    confidence: {},   // itemId -> 0 | 1 | 2
    cards: {},        // itemId -> SRS card
    settings: {
      examDate: '2027-05-10', theme: 'auto', vocabDirection: 'fr-en', vocabMode: 'type',
      speechAuto: true, speechRate: 0.9, speechVoice: ''
    },
    log: {}           // 'YYYY-MM-DD' -> number of reviews
  };

  var state;

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return JSON.parse(JSON.stringify(blank));
      var parsed = JSON.parse(raw);
      return {
        version: 1,
        confidence: parsed.confidence || {},
        cards: parsed.cards || {},
        settings: Object.assign({}, blank.settings, parsed.settings || {}),
        log: parsed.log || {}
      };
    } catch (e) {
      console.warn('Could not read saved progress; starting fresh.', e);
      return JSON.parse(JSON.stringify(blank));
    }
  }

  var saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
      } catch (e) {
        console.warn('Could not save progress (storage full or blocked).', e);
      }
    }, 120);
  }

  /* ---------- accessors ---------- */

  function confidence(id) { return state.confidence[id] || 0; }

  function setConfidence(id, level) {
    if (level === 0) {
      delete state.confidence[id];
      delete state.cards[id];
    } else {
      var was = state.confidence[id] || 0;
      state.confidence[id] = level;
      // Entering the rotation: a shaky item is due now, a solid one after a day.
      if (!state.cards[id]) {
        var card = window.SRS.fresh();
        if (level === 2) { card.interval = 1; card.due = window.SRS.today() + 1; }
        state.cards[id] = card;
      } else if (was === 2 && level === 1) {
        state.cards[id].due = window.SRS.today();
      }
    }
    save();
  }

  function card(id) { return state.cards[id] || null; }

  function review(id, g) {
    state.cards[id] = window.SRS.grade(state.cards[id], g);
    // A failed item is no longer "solid" whatever the checklist said.
    if (g === 0) state.confidence[id] = 1;
    else if (g >= 2 && (state.confidence[id] || 0) < 2 && state.cards[id].reps >= 2) {
      state.confidence[id] = 2;
    } else if (!state.confidence[id]) {
      state.confidence[id] = 1;
    }
    var key = new Date().toISOString().slice(0, 10);
    state.log[key] = (state.log[key] || 0) + 1;
    save();
    return state.cards[id];
  }

  function settings() { return state.settings; }
  function setSetting(k, v) { state.settings[k] = v; save(); }

  /* ---------- queries ---------- */

  /** Every item that has been started, i.e. is in the review rotation. */
  function activeItems(subjectId) {
    var out = [];
    Object.keys(state.confidence).forEach(function (id) {
      var item = byId[id];
      if (!item) return;                                  // stale id from an older data build
      if (subjectId && item.subject !== subjectId) return;
      out.push(item);
    });
    return out;
  }

  function dueItems(subjectId) {
    return activeItems(subjectId).filter(function (item) {
      return window.SRS.isDue(state.cards[item.id]);
    });
  }

  function dueCount(subjectId) { return dueItems(subjectId).length; }

  /** Counts of new / shaky / solid over an arbitrary list of items. */
  function tally(items) {
    var t = { total: items.length, shaky: 0, solid: 0, started: 0 };
    items.forEach(function (item) {
      var c = confidence(item.id);
      if (c === 1) t.shaky++;
      else if (c === 2) t.solid++;
    });
    t.started = t.shaky + t.solid;
    t.newCount = t.total - t.started;
    return t;
  }

  function subjectItems(sid) {
    return sid === 'french' ? vocab.concat(grammar, verbItems) : (points[sid] || []);
  }

  function exportJSON() { return JSON.stringify(state, null, 2); }

  function importJSON(text) {
    var parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || !parsed.confidence) {
      throw new Error('That does not look like an IGCSE progress export.');
    }
    state = {
      version: 1,
      confidence: parsed.confidence || {},
      cards: parsed.cards || {},
      settings: Object.assign({}, blank.settings, parsed.settings || {}),
      log: parsed.log || {}
    };
    save();
  }

  function reset() {
    state = JSON.parse(JSON.stringify(blank));
    save();
  }

  buildCatalogue();
  buildFrenchExtras();
  state = load();

  return {
    SUBJECT_IDS: SUBJECT_IDS,
    subjects: subjects,
    points: points,
    vocab: vocab,
    grammarTopics: grammarTopics,
    grammar: grammar,
    verbs: verbs,
    verbItems: verbItems,
    byId: byId,
    subjectItems: subjectItems,
    confidence: confidence,
    setConfidence: setConfidence,
    card: card,
    review: review,
    settings: settings,
    setSetting: setSetting,
    activeItems: activeItems,
    dueItems: dueItems,
    dueCount: dueCount,
    tally: tally,
    exportJSON: exportJSON,
    importJSON: importJSON,
    reset: reset,
    log: function () { return state.log; }
  };
})();
