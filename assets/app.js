/* Views and routing. Hash-based so the whole thing runs from file:// too. */
(function () {
  'use strict';

  var S = window.Store;
  var SRS = window.SRS;
  var view = document.getElementById('view');
  var nav = document.getElementById('nav');

  /* ---------- tiny DOM helpers ---------- */

  function el(tag, attrs, kids) {
    var parts = tag.split('.');
    var node = document.createElement(parts[0] || 'div');
    if (parts.length > 1) node.className = parts.slice(1).join(' ');
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'text') node.textContent = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
      else if (k === 'class') node.className += (node.className ? ' ' : '') + v;
      else node.setAttribute(k, v);
    });
    (kids || []).forEach(function (kid) {
      if (kid === null || kid === undefined || kid === false) return;
      node.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
    });
    return node;
  }
  function frag(kids) {
    var f = document.createDocumentFragment();
    (kids || []).forEach(function (k) { if (k) f.appendChild(k); });
    return f;
  }
  function pct(n, d) { return d ? Math.round((n / d) * 100) : 0; }

  /* ---------- shared pieces ---------- */

  function progressBar(t) {
    return el('div.bar', { title: t.solid + ' solid, ' + t.shaky + ' shaky of ' + t.total }, [
      el('i.solid', { style: 'width:' + pct(t.solid, t.total) + '%' }),
      el('i.shaky', { style: 'width:' + pct(t.shaky, t.total) + '%' })
    ]);
  }

  function legend(t) {
    return el('div.legend', {}, [
      el('span', {}, [el('span.dot.solid'), el('b', { text: String(t.solid) }), ' solid']),
      el('span', {}, [el('span.dot.shaky'), el('b', { text: String(t.shaky) }), ' shaky']),
      el('span', {}, [el('span.dot.new'), el('b', { text: String(t.newCount) }), ' not started'])
    ]);
  }

  /* The detail the specification gives beyond the statement itself. */
  function pointDetail(item) {
    var kids = [];
    if (item.details) item.details.forEach(function (d) {
      kids.push(el('div', { style: 'margin:.3rem 0' }, [
        el('b', { text: d.term + ': ' }), document.createTextNode(d.text)
      ]));
    });
    if (item.bullets && item.bullets.length) {
      kids.push(el('ul.bullets', {}, item.bullets.map(function (b) { return el('li', { text: b }); })));
    }
    return kids;
  }

  /* Three-state confidence control for one item. */
  function confidenceControl(item, onChange) {
    var seg = el('div.seg');
    [[0, '—', 'Not started'], [1, 'Shaky', 'Seen it, not secure'], [2, 'Solid', 'Could answer this in an exam']]
      .forEach(function (opt) {
        var b = el('button', {
          type: 'button', title: opt[2],
          class: opt[0] === 1 ? 'w-shaky' : '',
          'aria-pressed': String(S.confidence(item.id) === opt[0]),
          text: opt[1],
          onclick: function () {
            S.setConfidence(item.id, opt[0]);
            Array.prototype.forEach.call(seg.children, function (c, i) {
              c.setAttribute('aria-pressed', String(i === opt[0]));
            });
            renderNav();
            if (onChange) onChange();
          }
        });
        seg.appendChild(b);
      });
    return seg;
  }

  function daysUntilExams() {
    var d = new Date(S.settings().examDate + 'T00:00:00');
    if (isNaN(d)) return null;
    return Math.round((d - new Date().setHours(0, 0, 0, 0)) / SRS.DAY);
  }

  /* ---------- view: Today ---------- */

  function viewToday() {
    var out = el('div');
    var days = daysUntilExams();
    var totalDue = S.dueCount(null);

    out.appendChild(el('h1', { text: 'Today' }));
    out.appendChild(el('p.muted', {}, [
      days === null ? 'Set an exam date on the Data page.'
        : days > 0 ? el('span', {}, [el('b', { text: String(days) }), ' days until the first exam (' + S.settings().examDate + ').'])
        : el('span', { text: 'Exams have started or passed — update the date on the Data page.' })
    ]));

    var reviewPanel = el('div.panel', { style: 'margin:1rem 0' }, [
      el('div.spread', {}, [
        el('div', {}, [
          el('h3', { text: totalDue ? totalDue + ' item' + (totalDue === 1 ? '' : 's') + ' due for review' : 'Nothing due right now' }),
          el('div.small.muted', {
            text: totalDue
              ? 'Recall practice on things you have already marked off.'
              : 'Mark syllabus points as shaky or solid to put them into the rotation.'
          })
        ]),
        totalDue ? el('a.btn.primary', { href: '#/review', text: 'Start review' }) : null
      ])
    ]);
    out.appendChild(reviewPanel);

    out.appendChild(el('h2', { text: 'Subjects' }));
    var grid = el('div.grid');
    S.SUBJECT_IDS.forEach(function (sid) {
      var subject = S.subjects[sid];
      if (!subject) return;
      var items = S.subjectItems(sid);
      var t = S.tally(items);
      var due = S.dueCount(sid);
      grid.appendChild(el('a.panel.subject-card', { href: '#/s/' + sid }, [
        el('div.spread', {}, [
          el('h3', { text: subject.name }),
          el('span.code', { text: subject.code })
        ]),
        el('div.small.muted', { style: 'margin:.25rem 0 .5rem' , text:
          pct(t.started, t.total) + '% of ' + t.total.toLocaleString() +
          (sid === 'french' ? ' words started' : ' spec points started') }),
        progressBar(t),
        el('div.small', { style: 'margin-top:.5rem;color:var(--ink-faint)',
          text: due ? due + ' due for review' : 'nothing due' })
      ]));
    });
    out.appendChild(grid);

    var weak = weakItems(null, 5);
    if (weak.length) {
      out.appendChild(el('div.spread', {}, [
        el('h2', { text: 'Weak spots' }),
        el('a.small', { href: '#/weak', text: 'see all' })
      ]));
      out.appendChild(el('div.panel', {}, [
        el('table.plain', {}, weak.map(weakRow))
      ]));
    }

    // Last week's activity, purely as a record — no streaks, no scoring.
    var log = S.log();
    var recent = [];
    for (var i = 6; i >= 0; i--) {
      var d = new Date(); d.setDate(d.getDate() - i);
      var key = d.toISOString().slice(0, 10);
      recent.push({ key: key, label: d.toLocaleDateString(undefined, { weekday: 'short' }), n: log[key] || 0 });
    }
    if (recent.some(function (r) { return r.n; })) {
      out.appendChild(el('h2', { text: 'Reviews this week' }));
      var table = el('table.plain', {}, [
        el('tr', {}, recent.map(function (r) { return el('th', { text: r.label }); })),
        el('tr', {}, recent.map(function (r) {
          return el('td', { text: r.n ? String(r.n) : '·', class: r.n ? '' : 'faint' });
        }))
      ]);
      out.appendChild(el('div.panel', {}, [table]));
    }
    return out;
  }

  /* ---------- view: Subject ---------- */

  function paperTable(subject) {
    var rows = [el('tr', {}, [
      el('th', { text: 'Paper' }), el('th', { text: 'Length' }),
      el('th', { text: 'Marks' }), el('th', { text: 'Weight' }), el('th', { text: 'Covers' })
    ])];
    subject.papers.forEach(function (p) {
      rows.push(el('tr', {}, [
        el('td', { text: p.name }), el('td', { text: p.duration }),
        el('td', { text: String(p.marks) }), el('td', { text: p.weight }),
        el('td.muted', { text: p.covers })
      ]));
    });
    return el('table.plain', {}, rows);
  }

  var filterState = { q: '', hideSolid: false, only: 'all' };

  function viewSubject(sid) {
    var subject = S.subjects[sid];
    if (!subject) return el('div.empty', { text: 'Unknown subject.' });
    var out = el('div');

    out.appendChild(el('div.spread', {}, [
      el('h1', { text: subject.name }),
      el('span.mono.faint', { text: subject.code + ' · ' + subject.totalMarks + ' marks' })
    ]));
    out.appendChild(el('details.topic', { style: 'margin:.6rem 0 1.2rem' }, [
      el('summary', {}, [el('span.t', { text: 'Assessment structure' })]),
      el('div.topic-body', {}, [paperTable(subject)])
    ]));

    if (sid === 'french') return frenchSubject(out, subject);

    var items = S.points[sid];
    var overall = S.tally(items);
    out.appendChild(el('div.panel', {}, [
      el('div.spread', { style: 'margin-bottom:.5rem' }, [
        el('h3', { text: pct(overall.started, overall.total) + '% started · ' + pct(overall.solid, overall.total) + '% solid' }),
        el('a.btn', { href: '#/review/' + sid, text: S.dueCount(sid) + ' due — review' })
      ]),
      progressBar(overall), el('div', { style: 'height:.5rem' }), legend(overall)
    ]));

    /* filters */
    var onlyOptions = [['all', 'All']];
    if (sid === 'maths') onlyOptions.push(['higher', 'Higher only']);
    else onlyOptions.push(['p2', 'Paper 2 only'], ['prac', 'Practicals']);
    onlyOptions.push(['weak', 'Shaky'], ['new', 'Not started']);

    var body = el('div');
    var search = el('input', {
      type: 'text', placeholder: 'Search spec points…', value: filterState.q,
      style: 'flex:1;min-width:12rem',
      oninput: function () { filterState.q = this.value; render(); }
    });
    var seg = el('div.seg', {}, onlyOptions.map(function (o) {
      return el('button', {
        type: 'button', text: o[1], 'aria-pressed': String(filterState.only === o[0]),
        onclick: function () { filterState.only = o[0]; render(); }
      });
    }));
    out.appendChild(el('div.row', { style: 'margin:1rem 0 .8rem' }, [search, seg]));
    out.appendChild(body);

    function matches(item) {
      if (filterState.only === 'p2' && !item.paper2only) return false;
      if (filterState.only === 'prac' && !item.practical) return false;
      if (filterState.only === 'higher' && !item.higher) return false;
      if (filterState.only === 'weak' && S.confidence(item.id) !== 1) return false;
      if (filterState.only === 'new' && S.confidence(item.id) !== 0) return false;
      if (filterState.q) {
        var q = filterState.q.toLowerCase();
        if ((item.ref + ' ' + item.text + ' ' + item.subTitle).toLowerCase().indexOf(q) < 0) return false;
      }
      return true;
    }

    function render() {
      body.textContent = '';
      var shown = 0;
      subject.topics.forEach(function (topic) {
        var topicItems = items.filter(function (i) { return i.topicId === topic.id; });
        var visible = topicItems.filter(matches);
        if (!visible.length) return;
        shown += visible.length;
        var tt = S.tally(topicItems);
        var det = el('details.topic', { open: filterState.q || filterState.only !== 'all' ? '' : null });
        det.appendChild(el('summary', {}, [
          el('span.n', { text: topic.id }),
          el('span.t', { text: topic.title }),
          el('span.small.faint', { text: visible.length + '/' + topicItems.length }),
          el('div', { style: 'width:5.5rem' }, [progressBar(tt)])
        ]));
        var tbody = el('div.topic-body');
        topic.subtopics.forEach(function (sub) {
          var subItems = visible.filter(function (i) { return i.subId === sub.id; });
          if (!subItems.length) return;
          var block = el('div.subtopic', {}, [
            el('h3', {}, [
              document.createTextNode(topic.id + sub.id + '  ' + sub.title),
              sub.higherOnly ? el('span.tag.higher', { text: 'Higher' }) : null
            ])
          ]);
          var lastGroup = null;
          subItems.forEach(function (item) {
            if (item.group && item.group !== lastGroup) {
              block.appendChild(el('div.small.faint', { style: 'margin:.5rem 0 .1rem', text: item.group }));
              lastGroup = item.group;
            }
            block.appendChild(pointRow(item, render));
          });
          tbody.appendChild(block);
        });
        det.appendChild(tbody);
        body.appendChild(det);
      });
      if (!shown) body.appendChild(el('div.empty', {}, [
        el('span.big', { text: '∅' }), el('div', { text: 'No spec points match that filter.' })
      ]));
    }

    render();
    return out;
  }

  function pointRow(item, onChange) {
    var c = S.confidence(item.id);
    var row = el('div.point', { class: c === 1 ? 'is-shaky' : c === 2 ? 'is-solid' : '' });
    row.appendChild(el('span.ref', { text: item.ref }));
    var bodyKids = [el('span.txt', { text: item.text })];
    if (item.paper2only) bodyKids.push(document.createTextNode(' '), el('span.tag.p2', { text: 'P2' }));
    if (item.practical) bodyKids.push(document.createTextNode(' '), el('span.tag.prac', { text: 'Prac' }));
    if (item.higher) bodyKids.push(document.createTextNode(' '), el('span.tag.higher', { text: 'H' }));
    var body = el('div.body', {}, bodyKids);
    pointDetail(item).forEach(function (n) { body.appendChild(n); });
    row.appendChild(body);
    row.appendChild(confidenceControl(item, function () {
      var lvl = S.confidence(item.id);
      row.className = 'point ' + (lvl === 1 ? 'is-shaky' : lvl === 2 ? 'is-solid' : '');
      if (onChange && (filterState.only === 'weak' || filterState.only === 'new')) onChange();
    }));
    return row;
  }

  /* ---------- view: French subject ---------- */

  function frenchSubject(out, subject) {
    var t = S.tally(S.vocab);
    out.appendChild(el('div.panel', {}, [
      el('div.spread', { style: 'margin-bottom:.5rem' }, [
        el('h3', { text: t.started + ' of ' + S.vocab.length.toLocaleString() + ' prescribed words started' }),
        el('a.btn.primary', { href: '#/vocab', text: 'Vocabulary drill' })
      ]),
      progressBar(t), el('div', { style: 'height:.5rem' }), legend(t)
    ]));
    out.appendChild(el('p.small.muted', { style: 'margin:.9rem 0 0', text:
      'This is the minimum core vocabulary list from Appendix 1 of the specification, ' +
      'organised by theme. Drill a section at a time rather than the whole list.' }));

    subject.topics.forEach(function (topic) {
      var det = el('details.topic');
      var topicWords = [];
      topic.subtopics.forEach(function (sub) {
        sub.vocab.forEach(function (w) { topicWords.push(S.byId['french#v#' + w.fr]); });
      });
      var tt = S.tally(topicWords);
      det.appendChild(el('summary', {}, [
        el('span.n', { text: topic.id }),
        el('span.t', { text: topic.title }),
        el('span.small.faint', { text: topicWords.length + ' words' }),
        el('div', { style: 'width:5.5rem' }, [progressBar(tt)])
      ]));
      var tbody = el('div.topic-body');
      topic.subtopics.forEach(function (sub) {
        var words = sub.vocab.map(function (w) { return S.byId['french#v#' + w.fr]; });
        var st = S.tally(words);
        tbody.appendChild(el('div.subtopic', {}, [
          el('div.spread', {}, [
            el('h3', { text: sub.title + '  ·  ' + words.length + ' words' }),
            el('a.btn.small', { href: '#/vocab?scope=' + encodeURIComponent(sub.id), text: 'Drill' })
          ]),
          el('div', { style: 'margin-top:.4rem' }, [progressBar(st)])
        ]));
      });
      det.appendChild(tbody);
      out.appendChild(det);
    });
    return out;
  }

  /* ---------- view: Review ---------- */

  function viewReview(subjectId) {
    var queue = S.dueItems(subjectId).sort(function (a, b) {
      var ca = S.card(a.id), cb = S.card(b.id);
      return (ca ? ca.due : 0) - (cb ? cb.due : 0);
    });
    var out = el('div.review');
    var done = 0;
    var total = queue.length;

    if (!total) {
      return el('div.empty', {}, [
        el('span.big', { text: '✓' }),
        el('div', { text: 'Nothing due for review' + (subjectId ? ' in ' + S.subjects[subjectId].name : '') + '.' }),
        el('p.small', { text: 'Come back tomorrow, or mark more syllabus points to add them to the rotation.' }),
        el('a.btn', { href: '#/today', text: 'Back to today' })
      ]);
    }

    var meter = el('div.queue-meter');
    var slot = el('div');
    out.appendChild(meter);
    out.appendChild(slot);

    function updateMeter() {
      meter.textContent = '';
      meter.appendChild(el('div.bar', { style: 'flex:1' }, [
        el('i.solid', { style: 'width:' + pct(done, total) + '%' })
      ]));
      meter.appendChild(el('span.small.faint', { text: done + ' / ' + total }));
    }

    function next() {
      updateMeter();
      if (!queue.length) {
        slot.textContent = '';
        slot.appendChild(el('div.empty', {}, [
          el('span.big', { text: '✓' }),
          el('div', { text: 'Queue clear — ' + done + ' reviewed.' }),
          el('a.btn', { href: '#/today', text: 'Back to today' })
        ]));
        renderNav();
        return;
      }
      var item = queue.shift();
      slot.textContent = '';
      slot.appendChild(item.kind === 'vocab' ? vocabCard(item, answer) : pointCard(item, answer));

      function answer(g) {
        S.review(item.id, g);
        done++;
        // "Again" puts the item back a few cards later in the same session.
        if (g === 0) queue.splice(Math.min(4, queue.length), 0, item);
        next();
      }
    }

    next();
    return out;
  }

  function gradeButtons(item, onGrade) {
    var card = S.card(item.id);
    var opts = [[0, 'Again'], [1, 'Hard'], [2, 'Good'], [3, 'Easy']];
    var wrap = el('div.grades', {}, opts.map(function (o) {
      return el('button.btn', {
        type: 'button',
        onclick: function () { onGrade(o[0]); }
      }, [
        document.createTextNode(o[1]),
        el('small', { text: SRS.preview(card, o[0]) })
      ]);
    }));
    wrap.appendChild(el('div.small.faint', {
      style: 'grid-column:1/-1;text-align:center;margin-top:.3rem',
      text: 'Keys 1–4'
    }));
    document.onkeydown = function (e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      var i = ['1', '2', '3', '4'].indexOf(e.key);
      if (i >= 0) { e.preventDefault(); onGrade(i); }
    };
    return wrap;
  }

  function pointCard(item, onGrade) {
    var wrap = el('div');
    var subject = S.subjects[item.subject];
    var card = el('div.card', {}, [
      el('div.small.faint', { text: subject.name + ' · ' + item.topicTitle + ' · ' + item.subTitle }),
      el('div.prompt', {}, [
        el('span.mono.faint', { text: item.ref + '  ' }),
        document.createTextNode(item.text)
      ]),
      item.paper2only ? el('div', {}, [el('span.tag.p2', { text: 'Paper 2 only' })]) : null
    ]);
    wrap.appendChild(card);

    var revealed = false;
    var reveal = el('button.btn.primary', {
      style: 'margin-top:.8rem;width:100%',
      text: 'Answer it, then show the detail',
      onclick: show
    });
    wrap.appendChild(reveal);

    function show() {
      if (revealed) return;
      revealed = true;
      reveal.remove();
      var detail = pointDetail(item);
      card.appendChild(el('div.answer', {}, detail.length ? detail : [
        el('div.small.muted', { text: 'The specification says no more than the statement above. Rate how confidently you could answer a question on it.' })
      ]));
      wrap.appendChild(gradeButtons(item, onGrade));
    }

    document.onkeydown = function (e) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); show(); }
    };
    return wrap;
  }

  var accepts = window.Match.accepts;

  function vocabCard(item, onGrade) {
    var dir = S.settings().vocabDirection;
    var showFrench = dir === 'fr-en';
    var prompt = showFrench ? item.fr : item.en;
    var expected = showFrench ? item.en : item.fr;

    var wrap = el('div');
    var input = el('input.vocab-input', {
      type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
      placeholder: showFrench ? 'in English…' : 'en français…'
    });
    var verdict = el('div.verdict');
    var card = el('div.card', {}, [
      el('div.small.faint', { text: 'French vocabulary · ' + (item.themes[0] ? item.themes[0].subTitle : '') }),
      el('div.prompt', { text: prompt }),
      input, verdict
    ]);
    wrap.appendChild(card);

    var checked = false;
    var check = el('button.btn.primary', {
      style: 'margin-top:.8rem;width:100%', text: 'Check', onclick: doCheck
    });
    wrap.appendChild(check);

    function doCheck() {
      if (checked) return;
      checked = true;
      var right = accepts(expected, input.value);
      input.disabled = true;
      verdict.className = 'verdict ' + (right ? 'ok' : 'no');
      verdict.textContent = right ? '✓ ' + expected : '✗ ' + expected;
      check.remove();
      wrap.appendChild(gradeButtons(item, onGrade));
      // Typing it correctly is a strong signal; suggest Good, but let the
      // student override — knowing it after a struggle is not the same thing.
      var hint = el('div.small.faint', { style: 'text-align:center;margin-top:.4rem',
        text: right ? 'Correct — "Good" unless it was a struggle.' : 'Wrong — "Again" unless it was a typo.' });
      wrap.appendChild(hint);
      document.onkeydown = function (e) {
        if (e.target.tagName === 'INPUT') return;
        var i = ['1', '2', '3', '4'].indexOf(e.key);
        if (i >= 0) { e.preventDefault(); onGrade(i); }
      };
    }

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); checked ? onGrade(2) : doCheck(); }
    });
    setTimeout(function () { input.focus(); }, 0);
    return wrap;
  }

  /* ---------- view: Vocabulary drill ---------- */

  function viewVocab(query) {
    var out = el('div');
    out.appendChild(el('h1', { text: 'French vocabulary' }));

    var scope = query.scope || 'all';
    var pool = S.vocab.filter(function (w) {
      return scope === 'all' || w.themes.some(function (t) { return t.subId === scope; });
    });
    // Unseen words first, then anything due — the point is to widen coverage.
    var unseen = pool.filter(function (w) { return S.confidence(w.id) === 0; });
    var due = pool.filter(function (w) { return S.confidence(w.id) > 0 && SRS.isDue(S.card(w.id)); });

    var scopeSelect = el('select', {
      onchange: function () { location.hash = '#/vocab?scope=' + encodeURIComponent(this.value); }
    }, [el('option', { value: 'all', text: 'All themes (' + S.vocab.length + ' words)', selected: scope === 'all' ? '' : null })]);
    S.subjects.french.topics.forEach(function (topic) {
      var group = el('optgroup', { label: topic.id + ' — ' + topic.title });
      topic.subtopics.forEach(function (sub) {
        group.appendChild(el('option', {
          value: sub.id, text: sub.title + ' (' + sub.vocab.length + ')',
          selected: scope === sub.id ? '' : null
        }));
      });
      scopeSelect.appendChild(group);
    });

    var dirSelect = el('select', {
      onchange: function () { S.setSetting('vocabDirection', this.value); }
    }, [
      el('option', { value: 'fr-en', text: 'French → English', selected: S.settings().vocabDirection === 'fr-en' ? '' : null }),
      el('option', { value: 'en-fr', text: 'English → French', selected: S.settings().vocabDirection === 'en-fr' ? '' : null })
    ]);
    var sizeSelect = el('select', {}, [10, 20, 40].map(function (n) {
      return el('option', { value: String(n), text: n + ' words', selected: n === 20 ? '' : null });
    }));

    out.appendChild(el('div.panel', { style: 'margin:.8rem 0' }, [
      el('div.row', {}, [scopeSelect, dirSelect, sizeSelect,
        el('button.btn.primary', { text: 'Start', onclick: start })
      ]),
      el('div.small.muted', { style: 'margin-top:.6rem', text:
        pool.length + ' words in scope · ' + due.length + ' due · ' + unseen.length + ' not yet seen' })
    ]));

    var slot = el('div.review');
    out.appendChild(slot);

    function start() {
      var n = parseInt(sizeSelect.value, 10);
      var queue = due.concat(shuffle(unseen)).slice(0, n);
      if (!queue.length) {
        slot.textContent = '';
        slot.appendChild(el('div.empty', { text: 'Nothing left in this section.' }));
        return;
      }
      var total = queue.length, done = 0;
      var meter = el('div.queue-meter');
      var cardSlot = el('div');
      slot.textContent = '';
      slot.appendChild(meter);
      slot.appendChild(cardSlot);

      function next() {
        meter.textContent = '';
        meter.appendChild(el('div.bar', { style: 'flex:1' }, [el('i.solid', { style: 'width:' + pct(done, total) + '%' })]));
        meter.appendChild(el('span.small.faint', { text: done + ' / ' + total }));
        if (!queue.length) {
          cardSlot.textContent = '';
          cardSlot.appendChild(el('div.empty', {}, [
            el('span.big', { text: '✓' }),
            el('div', { text: done + ' words reviewed.' }),
            el('button.btn', { text: 'Another set', onclick: function () { location.reload(); } })
          ]));
          renderNav();
          return;
        }
        var item = queue.shift();
        cardSlot.textContent = '';
        cardSlot.appendChild(vocabCard(item, function (g) {
          S.review(item.id, g);
          done++;
          if (g === 0) queue.splice(Math.min(4, queue.length), 0, item);
          next();
        }));
      }
      next();
    }

    return out;
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  /* ---------- view: Weak spots ---------- */

  /* Items ranked by how often they have actually been failed in review. This
   * is the only ranking in the app that is not self-reported. */
  function weakItems(subjectId, limit) {
    return S.activeItems(subjectId)
      .map(function (item) { return { item: item, card: S.card(item.id) }; })
      .filter(function (r) { return r.card && r.card.lapses > 0; })
      .sort(function (a, b) {
        return (b.card.lapses - a.card.lapses) || (a.card.ease - b.card.ease);
      })
      .slice(0, limit || 1e9);
  }

  function weakRow(rec) {
    var item = rec.item;
    var label = item.kind === 'vocab'
      ? item.fr + ' — ' + item.en
      : item.ref + '  ' + item.text;
    return el('tr', {}, [
      el('td.small', {}, [
        el('div', {}, [
          el('span.mono.faint', { text: S.subjects[item.subject].name + ' · ' }),
          document.createTextNode(item.kind === 'vocab' ? (item.themes[0] ? item.themes[0].subTitle : '') : item.subTitle)
        ]),
        el('div', { text: label })
      ]),
      el('td.small.mono', { style: 'white-space:nowrap',
        text: rec.card.lapses + '\u00d7 wrong' }),
      el('td', {}, [confidenceControl(item, renderNav)])
    ]);
  }

  function viewWeak() {
    var out = el('div');
    out.appendChild(el('h1', { text: 'Weak spots' }));
    out.appendChild(el('p.muted', { text:
      'Everything you have got wrong in review, most-failed first. This is the list to take into a past paper.' }));
    var rows = weakItems(null);
    if (!rows.length) {
      out.appendChild(el('div.empty', {}, [
        el('span.big', { text: '\u2713' }),
        el('div', { text: 'Nothing failed yet.' }),
        el('p.small', { text: 'Items land here when you answer "Again" during a review.' })
      ]));
      return out;
    }
    var table = el('table.plain', {}, [el('tr', {}, [
      el('th', { text: 'Item' }), el('th', { text: 'Missed' }), el('th', { text: 'Confidence' })
    ])].concat(rows.map(weakRow)));
    out.appendChild(el('div.panel', {}, [table]));
    return out;
  }

  /* ---------- view: Data ---------- */

  function viewData() {
    var out = el('div');
    out.appendChild(el('h1', { text: 'Settings and data' }));

    var dateInput = el('input', {
      type: 'date', value: S.settings().examDate,
      onchange: function () { S.setSetting('examDate', this.value); }
    });
    out.appendChild(el('div.panel', { style: 'margin:.8rem 0' }, [
      el('h3', { text: 'First exam date' }),
      el('p.small.muted', { text: 'Used only for the countdown. Edexcel publishes the timetable a few months ahead; set it once you know your own dates.' }),
      dateInput
    ]));

    var area = el('textarea', { rows: '8', readonly: '', text: S.exportJSON() });
    out.appendChild(el('div.panel', { style: 'margin:.8rem 0' }, [
      el('h3', { text: 'Backup' }),
      el('p.small.muted', { text: 'Progress lives in this browser only. Clearing site data, or opening the app in a different browser, loses it. Copy this out somewhere safe now and then.' }),
      area,
      el('div.row', { style: 'margin-top:.5rem' }, [
        el('button.btn', { text: 'Select all', onclick: function () { area.removeAttribute('readonly'); area.select(); } }),
        el('button.btn', { text: 'Restore from pasted text', onclick: function () {
          area.removeAttribute('readonly');
          try { S.importJSON(area.value); alert('Progress restored.'); route(); }
          catch (e) { alert('Could not restore: ' + e.message); }
        } })
      ])
    ]));

    var stats = el('table.plain');
    stats.appendChild(el('tr', {}, [el('th', { text: 'Subject' }), el('th', { text: 'Items' }),
      el('th', { text: 'Started' }), el('th', { text: 'Solid' }), el('th', { text: 'Due' })]));
    S.SUBJECT_IDS.forEach(function (sid) {
      var t = S.tally(S.subjectItems(sid));
      stats.appendChild(el('tr', {}, [
        el('td', { text: S.subjects[sid].name }),
        el('td', { text: t.total.toLocaleString() }),
        el('td', { text: t.started + ' (' + pct(t.started, t.total) + '%)' }),
        el('td', { text: String(t.solid) }),
        el('td', { text: String(S.dueCount(sid)) })
      ]));
    });
    out.appendChild(el('div.panel', { style: 'margin:.8rem 0' }, [el('h3', { text: 'Totals' }), stats]));

    out.appendChild(el('div.panel', {}, [
      el('h3', { text: 'Start over' }),
      el('p.small.muted', { text: 'Deletes every mark and review schedule in this browser. There is no undo.' }),
      el('button.btn', { text: 'Reset all progress', style: 'color:var(--danger);border-color:var(--danger)',
        onclick: function () {
          if (confirm('Delete all progress? This cannot be undone.')) { S.reset(); route(); }
        } })
    ]));
    return out;
  }

  /* ---------- routing ---------- */

  function renderNav() {
    var hash = location.hash || '#/today';
    nav.textContent = '';
    var links = [['#/today', 'Today']];
    S.SUBJECT_IDS.forEach(function (sid) {
      if (S.subjects[sid]) links.push(['#/s/' + sid, S.subjects[sid].name.replace(' A', '')]);
    });
    links.push(['#/review', 'Review'], ['#/weak', 'Weak spots'], ['#/data', 'Data']);
    links.forEach(function (l) {
      var a = el('a', { href: l[0], text: l[1] });
      if (hash === l[0] || hash.indexOf(l[0] + '/') === 0) a.className = 'on';
      if (l[0] === '#/review') {
        var n = S.dueCount(null);
        if (n) a.appendChild(el('span.badge', { text: String(n) }));
      }
      nav.appendChild(a);
    });
  }

  function parseHash() {
    var raw = (location.hash || '#/today').slice(1);
    var qi = raw.indexOf('?');
    var query = {};
    if (qi >= 0) {
      raw.slice(qi + 1).split('&').forEach(function (kv) {
        var p = kv.split('=');
        query[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
      });
      raw = raw.slice(0, qi);
    }
    return { parts: raw.split('/').filter(Boolean), query: query };
  }

  function route() {
    document.onkeydown = null;
    var r = parseHash();
    var node;
    switch (r.parts[0]) {
      case 's': node = viewSubject(r.parts[1]); break;
      case 'review': node = viewReview(r.parts[1] || null); break;
      case 'vocab': node = viewVocab(r.query); break;
      case 'weak': node = viewWeak(); break;
      case 'data': node = viewData(); break;
      default: node = viewToday();
    }
    view.textContent = '';
    view.appendChild(node);
    renderNav();
    window.scrollTo(0, 0);
    view.focus({ preventScroll: true });
  }

  /* ---------- theme ---------- */

  function applyTheme() {
    var t = S.settings().theme;
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }
  document.getElementById('theme-toggle').addEventListener('click', function () {
    var order = ['auto', 'light', 'dark'];
    var next = order[(order.indexOf(S.settings().theme) + 1) % order.length];
    S.setSetting('theme', next);
    applyTheme();
  });

  applyTheme();
  window.addEventListener('hashchange', route);
  route();
})();
