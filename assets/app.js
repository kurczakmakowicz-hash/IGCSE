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
          (sid === 'french' ? ' French cards started' : ' spec points started') }),
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

  function frenchTabs(active) {
    var tabs = [['overview', '#/s/french', 'Overview'], ['vocab', '#/vocab', 'Vocabulary'],
      ['grammar', '#/grammar', 'Grammar'], ['verbs', '#/verbs', 'Verbs']];
    var nav = el('nav.tabs', { 'aria-label': 'French sections' }, tabs.map(function (t) {
      return el('a', { href: t[1], text: t[2], class: t[0] === active ? 'on' : null });
    }));
    if (Speech.supported) {
      var toggle = el('button.speech-toggle', { type: 'button', onclick: function () {
        S.setSetting('speechAuto', !S.settings().speechAuto);
        paint();
        if (S.settings().speechAuto) Speech.say('Lecture automatique activée.');
        else Speech.stop();
      } });
      var paint = function () {
        var on = S.settings().speechAuto;
        toggle.textContent = on ? '🔊 Read aloud: on' : '🔇 Read aloud: off';
        toggle.setAttribute('aria-pressed', String(on));
        toggle.title = on ? 'French is read out automatically. Click to read only when you press 🔊.'
          : 'French is read only when you press 🔊. Click to read it out automatically.';
      };
      paint();
      nav.appendChild(toggle);
    }
    return nav;
  }

  function dueIn(items) {
    return items.filter(function (i) { return S.confidence(i.id) > 0 && SRS.isDue(S.card(i.id)); }).length;
  }

  function frenchSubject(out, subject) {
    out.insertBefore(frenchTabs('overview'), out.children[1]);
    var tenses = S.verbs.length ? S.verbs[0].items.length : 0;
    var parts = [
      ['Vocabulary', S.vocab, '#/vocab', S.vocab.length.toLocaleString() + ' words from the prescribed list in Appendix 1'],
      ['Grammar', S.grammar, '#/grammar', S.grammarTopics.length + ' topics covering the specification\'s grammar list'],
      ['Verbs', S.verbItems, '#/verbs', S.verbs.length + ' key verbs, up to ' + tenses + ' tenses each']
    ];
    var grid = el('div.grid', { style: 'margin-top:.4rem' });
    parts.forEach(function (p) {
      var t = S.tally(p[1]);
      var due = dueIn(p[1]);
      grid.appendChild(el('a.panel.subject-card', { href: p[2] }, [
        el('div.spread', {}, [el('h3', { text: p[0] }), el('span.code', { text: p[1].length.toLocaleString() + ' cards' })]),
        el('div.small.muted', { style: 'margin:.25rem 0 .5rem', text: p[3] }),
        progressBar(t),
        el('div.small', { style: 'margin-top:.5rem;color:var(--ink-faint)',
          text: t.started + ' started · ' + (due ? due + ' due' : 'nothing due') })
      ]));
    });
    out.appendChild(grid);
    out.appendChild(el('div.panel', { style: 'margin-top:.8rem' }, [
      el('h3', { text: 'A sensible daily routine' }),
      el('ol.small', { style: 'margin:.4rem 0 0;padding-left:1.2rem' }, [
        el('li', {}, ['Clear ', el('a', { href: '#/review/french', text: 'everything due' }), ' first — that is what keeps old cards from fading.']),
        el('li', { text: 'Then add new cards: one grammar topic (read its notes, then about 10 cards), 20 words from one vocabulary theme, and 10 verb cards.' }),
        el('li', { text: 'Typed French is marked strictly on accents, as in the Paper 2 grammar task. Use the accent buttons under the answer box.' })
      ])
    ]));

    out.appendChild(el('h2', { text: 'Vocabulary by theme' }));
    out.appendChild(el('p.small.muted', { style: 'margin:-.3rem 0 .7rem', text:
      'The minimum core vocabulary list from Appendix 1 of the specification. ' +
      'Drill a section at a time rather than the whole list.' }));

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
    if (!queue.length) {
      return el('div.empty', {}, [
        el('span.big', { text: '✓' }),
        el('div', { text: 'Nothing due for review' + (subjectId ? ' in ' + S.subjects[subjectId].name : '') + '.' }),
        el('p.small', { text: 'Come back tomorrow, or mark more syllabus points to add them to the rotation.' }),
        el('a.btn', { href: '#/today', text: 'Back to today' })
      ]);
    }
    var out = el('div.review');
    runSession(out, queue, function (reviews) {
      return el('div.empty', {}, [
        el('span.big', { text: '✓' }),
        el('div', { text: 'Queue clear — ' + reviews + ' reviewed.' }),
        el('a.btn', { href: '#/today', text: 'Back to today' })
      ]);
    });
    return out;
  }

  /* Work through a queue of cards. "Again" puts a card back a few places on,
   * so the session ends only when every card has been answered at least "Hard". */
  function runSession(slot, queue, onFinish) {
    var total = queue.length, finished = 0, reviews = 0;
    // Starting a new set on the same page abandons this one.
    var token = slot.session = {};
    var meter = el('div.queue-meter');
    var cardSlot = el('div');
    slot.textContent = '';
    slot.appendChild(meter);
    slot.appendChild(cardSlot);

    function next() {
      meter.textContent = '';
      meter.appendChild(el('div.bar', { style: 'flex:1' }, [
        el('i.solid', { style: 'width:' + pct(finished, total) + '%' })
      ]));
      meter.appendChild(el('span.small.faint', { text: finished + ' / ' + total }));
      cardSlot.textContent = '';
      if (!queue.length) {
        document.onkeydown = null;
        cardSlot.appendChild(onFinish(reviews));
        renderNav();
        return;
      }
      var item = queue.shift();
      var graded = false;
      document.onkeydown = null;   // the previous card's shortcuts must not reach this one
      cardSlot.appendChild(cardFor(item, function (g) {
        if (graded || slot.session !== token) return;
        graded = true;
        S.review(item.id, g);
        reviews++;
        if (g === 0) queue.splice(Math.min(4, queue.length), 0, item);
        else finished++;
        next();
      }));
    }
    next();
  }

  /* Due cards first, most overdue first, then cards never seen, in the order given. */
  function buildQueue(pool, n) {
    var due = pool.filter(function (i) { return S.confidence(i.id) > 0 && SRS.isDue(S.card(i.id)); })
      .sort(function (a, b) { return (S.card(a.id) || { due: 0 }).due - (S.card(b.id) || { due: 0 }).due; });
    var unseen = pool.filter(function (i) { return S.confidence(i.id) === 0; });
    return due.concat(unseen).slice(0, n);
  }

  function startPractice(slot, queue) {
    if (!queue.length) {
      slot.textContent = '';
      slot.appendChild(el('div.empty', {}, [
        el('span.big', { text: '✓' }),
        el('div', { text: 'Nothing due and nothing new here — pick another set, or come back when cards fall due.' })
      ]));
      return;
    }
    // Focus would otherwise stay on the Start button, and the next Enter or
    // Space would start the set over.
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    runSession(slot, queue, function (reviews) {
      return el('div.empty', {}, [
        el('span.big', { text: '✓' }),
        el('div', { text: 'Set done — ' + reviews + ' answers.' }),
        el('button.btn', { text: 'Another set', onclick: route })
      ]);
    });
    slot.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function sizeSelect(options, chosen) {
    return el('select', { 'aria-label': 'Set size' }, options.map(function (n) {
      return el('option', { value: String(n), text: n === 1e9 ? 'all' : n + ' cards', selected: n === chosen ? '' : null });
    }));
  }

  function cardFor(item, onGrade) {
    if (item.kind === 'vocab') return vocabCard(item, onGrade);
    if (item.kind === 'grammar') return grammarCard(item, onGrade);
    if (item.kind === 'verb') return verbCard(item, onGrade);
    return pointCard(item, onGrade);
  }

  /* Card shortcuts must leave keys alone when they are aimed at a control
   * (Enter on a focused grade button means that button) and ignore auto-repeat,
   * so holding a key down cannot answer cards the student has not seen. */
  function ownKey(e) {
    return !e.repeat && !/^(BUTTON|A|SELECT|INPUT|TEXTAREA)$/.test(e.target.tagName);
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
      if (!ownKey(e)) return;
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
  var Match = window.Match;
  var ACCENTS = ['é', 'è', 'ê', 'ë', 'à', 'â', 'î', 'ï', 'ô', 'û', 'ù', 'ç', 'œ'];

  /* Buttons that type accented letters into the answer box: most keyboards
   * make them awkward, and the grammar task marks them. */
  function accentBar(input) {
    return el('div.accents', { 'aria-label': 'Accented letters' }, ACCENTS.map(function (ch) {
      return el('button', {
        type: 'button', tabindex: '-1', text: ch, title: 'Type ' + ch,
        onmousedown: function (e) { e.preventDefault(); },   // keep focus in the box
        onclick: function () {
          if (input.disabled) return;
          var a = input.selectionStart, b = input.selectionEnd;
          if (a === null || a === undefined) { a = b = input.value.length; }
          input.value = input.value.slice(0, a) + ch + input.value.slice(b);
          input.selectionStart = input.selectionEnd = a + ch.length;
          input.focus();
        }
      });
    }));
  }

  /* Text with **bold** spans, which the grammar cards use to point at words. */
  function rich(text) {
    var span = el('span');
    String(text).split('**').forEach(function (part, i) {
      if (part) span.appendChild(i % 2 ? el('b', { text: part }) : document.createTextNode(part));
    });
    return span;
  }

  /* ---------- reading French aloud ---------- */

  var Speech = window.Speech;

  function applySpeechSettings() {
    Speech.configure({ voice: S.settings().speechVoice, rate: Number(S.settings().speechRate) || 0.9 });
  }

  /* A 🔊 button that reads `text` in French. Pressing it does not take the
   * cursor out of the answer box. */
  function sayButton(text, label) {
    if (!Speech.supported || !text) return null;
    return el('button.say', {
      type: 'button', title: 'Listen', 'aria-label': 'Listen' + (label ? ': ' + label : ''),
      onmousedown: function (e) { e.preventDefault(); },
      onclick: function () { Speech.say(text); }
    }, [label ? '🔊 ' + label : '🔊']);
  }

  /* Read aloud now, if the student has automatic reading switched on. */
  function autoSay(text) {
    if (S.settings().speechAuto) Speech.say(text);
  }

  /* French text with a 🔊 button after it. */
  function spoken(text, say) {
    return el('span', {}, [rich(text), document.createTextNode(' '), sayButton(say || Speech.speakable(text))]);
  }

  /* A card answered by typing. o.check(value) returns {right, note};
   * o.reveal() builds whatever to show once it has been checked. */
  function typedCard(o, onGrade) {
    var wrap = el('div');
    var input = el('input.vocab-input', {
      type: 'text', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off',
      spellcheck: 'false', lang: o.french ? 'fr' : 'en', placeholder: o.placeholder || '',
      'aria-label': 'Your answer'
    });
    var verdict = el('div.verdict', { 'aria-live': 'polite' });
    var card = el('div.card', {}, [
      el('div.small.faint', { text: o.label }),
      o.prompt, input, o.french ? accentBar(input) : null, verdict
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
      var res = o.check(input.value);
      input.blur();   // some browsers keep focus on a disabled field
      input.disabled = true;
      verdict.className = 'verdict ' + (res.right ? 'ok' : 'no');
      verdict.textContent = (res.right ? '✓ ' : '✗ ') + (res.note || (res.right ? 'Correct' : 'Not quite'));
      var extra = o.reveal ? o.reveal(res.right) : null;
      if (extra) card.appendChild(el('div.answer', {}, [extra]));
      if (o.onReveal) o.onReveal(res.right);
      check.remove();
      wrap.appendChild(gradeButtons(o.item, onGrade));
      // Typing it correctly is a strong signal, so Enter means "Good" after a
      // right answer and "Again" after a wrong one; the buttons override.
      wrap.appendChild(el('div.small.faint', { style: 'text-align:center;margin-top:.4rem', text: res.right
        ? 'Right — Enter for "Good", or "Hard" if it was a struggle.'
        : 'Wrong — Enter for "Again", unless it was only a typo.' }));
      var grade = res.right ? 2 : 0;
      document.onkeydown = function (e) {
        if (!ownKey(e)) return;
        if (e.key === 'Enter') { e.preventDefault(); onGrade(grade); return; }
        var i = ['1', '2', '3', '4'].indexOf(e.key);
        if (i >= 0) { e.preventDefault(); onGrade(i); }
      };
    }

    input.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (e.repeat) return;
      e.stopPropagation();   // or the same keypress would also grade the card
      doCheck();
    });
    setTimeout(function () { input.focus(); }, 0);
    return wrap;
  }

  /* A card answered in your head, then self-graded. */
  function flipCard(o, onGrade) {
    var wrap = el('div');
    var card = el('div.card', {}, [el('div.small.faint', { text: o.label }), o.front]);
    wrap.appendChild(card);
    var shown = false;
    var btn = el('button.btn.primary', {
      style: 'margin-top:.8rem;width:100%', text: 'Show answer', onclick: show
    });
    wrap.appendChild(btn);
    function show() {
      if (shown) return;
      shown = true;
      btn.remove();
      card.appendChild(el('div.answer', {}, [o.back]));
      wrap.appendChild(gradeButtons(o.item, onGrade));
      if (o.onReveal) o.onReveal();
    }
    document.onkeydown = function (e) {
      if (!ownKey(e)) return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); show(); }
    };
    return wrap;
  }

  function vocabCard(item, onGrade) {
    var dir = S.settings().vocabDirection;
    if (dir === 'listen' && !Speech.supported) dir = 'fr-en';
    var fr = Speech.speakable(item.fr);
    var label = 'French vocabulary · ' + (item.themes[0] ? item.themes[0].subTitle : '');
    var flip = S.settings().vocabMode === 'flip';

    if (dir === 'listen') {
      // Listening practice: hear the word, never see it until you answer.
      Speech.say(fr);
      var play = el('div.prompt', {}, [sayButton(fr, 'Play again'),
        el('div.small.muted', { style: 'margin-top:.4rem', text: flip ? 'What does it mean?' : 'Type what it means in English.' })]);
      var reveal = el('div', {}, [spoken(item.fr, fr), el('div.muted', { text: item.en })]);
      if (flip) return flipCard({ item: item, label: label, front: play, back: reveal }, onGrade);
      return typedCard({
        item: item, label: label, prompt: play, placeholder: 'in English…',
        check: function (v) { return { right: accepts(item.en, v), note: item.en }; },
        reveal: function () { return el('div', {}, [spoken(item.fr, fr)]); }
      }, onGrade);
    }

    var showFrench = dir === 'fr-en';
    var expected = showFrench ? item.en : item.fr;
    if (showFrench) autoSay(fr);
    var prompt = showFrench ? el('div.prompt', {}, [spoken(item.fr, fr)]) : el('div.prompt', { text: item.en });
    if (flip) {
      return flipCard({
        item: item, label: label, front: prompt,
        back: showFrench ? el('div.prompt', { text: item.en }) : el('div.prompt', {}, [spoken(item.fr, fr)]),
        onReveal: function () { if (!showFrench) autoSay(fr); }
      }, onGrade);
    }
    return typedCard({
      item: item, label: label, french: !showFrench, prompt: prompt,
      placeholder: showFrench ? 'in English…' : 'en français…',
      check: function (v) { return { right: accepts(expected, v), note: expected }; },
      reveal: showFrench ? null : function () { return el('div', {}, [sayButton(fr, 'Hear it')]); },
      onReveal: function () { if (!showFrench) autoSay(fr); }
    }, onGrade);
  }

  function gapPrompt(c) {
    var parts = c.prompt.split('___');
    return el('div.prompt', {}, [
      rich(parts[0]), el('span.blank', { text: '______' }),
      c.base ? el('span.base', { text: ' (' + c.base + ')' }) : null,
      rich(parts[1] || '')
    ]);
  }

  function grammarCard(item, onGrade) {
    var c = item.card;
    var label = 'Grammar · ' + item.topic.title;
    if (c.type === 'flip') {
      return flipCard({
        item: item, label: label,
        front: el('div.prompt', {}, [rich(c.front)]),
        back: el('div', { style: 'white-space:pre-line' }, [rich(c.back)])
      }, onGrade);
    }
    var prompt = c.type === 'gap'
      ? el('div', {}, [gapPrompt(c), c.hint ? el('div.small.muted', { style: 'margin-top:.3rem', text: 'Hint: ' + c.hint }) : null])
      : el('div', {}, [
        el('div.small', { style: 'font-weight:600;margin-bottom:.3rem', text: c.instruction }),
        // Not read out if it has digits: "20h30" spoken aloud is the answer.
        el('div.prompt', {}, [/\d/.test(c.prompt) ? rich(c.prompt) : spoken(c.prompt)])
      ]);
    // Once answered, read out the correct French sentence.
    var full = c.type === 'gap' ? c.prompt.replace('___', c.answers[0]) : c.answers[0];
    return typedCard({
      item: item, label: label, french: true, prompt: prompt,
      placeholder: c.type === 'gap' ? 'the missing word(s)…' : 'the whole sentence…',
      check: function (v) {
        if (Match.acceptsFrench(c.answers, v)) return { right: true };
        if (Match.accentSlip(c.answers, v)) return { right: false, note: 'Check the accents — the grammar task marks them.' };
        return { right: false };
      },
      reveal: function () {
        var kids = [el('div', {}, [
          el('b', { text: c.answers.length > 1 ? 'Accepted: ' : 'Answer: ' }),
          document.createTextNode(c.answers.join('   ·   ')),
          c.type === 'transform' ? document.createTextNode(' ') : null,
          c.type === 'transform' ? sayButton(Speech.speakable(full)) : null
        ])];
        if (c.type === 'gap') {
          kids.push(el('div.small', { style: 'margin-top:.35rem' }, [
            rich(c.prompt.replace('___', '**' + c.answers[0] + '**')), document.createTextNode(' '),
            sayButton(Speech.speakable(full))
          ]));
        }
        kids.push(el('div.small.muted', { style: 'margin-top:.2rem', text: c.en }));
        kids.push(el('div.small', { style: 'margin-top:.5rem' }, [el('b', { text: 'Why: ' }), rich(c.why)]));
        return el('div', {}, kids);
      },
      onReveal: function () { autoSay(Speech.speakable(full)); }
    }, onGrade);
  }

  /* One card per verb and tense; the person changes every time it comes up. */
  function verbCard(item, onGrade) {
    var persons = Object.keys(item.forms);
    var person = persons[Math.floor(Math.random() * persons.length)];
    var forms = item.forms[person];
    var imperative = item.tense.id === 'imperative';
    var prompt = el('div', {}, [
      el('div.prompt', {}, [el('b', { text: item.verb.inf }), document.createTextNode(' '),
        sayButton(item.verb.inf), el('span.muted', { text: '  — ' + item.verb.en })]),
      el('div.row', { style: 'margin-top:.45rem' }, [
        el('span.pill', { text: item.tense.name + ' · ' + item.tense.fr }),
        el('span.pill.person', { text: imperative ? 'command to: ' + person : person })
      ])
    ]);
    return typedCard({
      item: item, label: 'Verbs · ' + item.verb.group, french: true, prompt: prompt,
      placeholder: imperative ? 'the command…' : person + ' …',
      check: function (v) {
        var ok = Match.verbAnswers(forms);
        if (Match.acceptsFrench(ok, v)) return { right: true, note: forms.join('  /  ') };
        if (Match.accentSlip(ok, v)) return { right: false, note: 'Check the accents.' };
        return { right: false };
      },
      reveal: function (right) { return verbReveal(item, right ? null : forms); },
      onReveal: function () { autoSay(forms[0]); }
    }, onGrade);
  }

  function verbReveal(item, forms) {
    var kids = [];
    if (forms) kids.push(el('div', {}, [el('b', { text: 'Answer: ' }), document.createTextNode(forms.join('  /  ') + ' '), sayButton(forms[0])]));
    kids.push(conjTable(item));
    if (item.verb.aux === 'être' && (item.tense.id === 'perfect' || item.tense.id === 'pluperfect')) {
      kids.push(el('div.small.muted', { text: 'Takes être, so the past participle agrees with the subject.' }));
    }
    return el('div', {}, kids);
  }

  function conjTable(item) {
    return el('table.conj', {}, item.table.map(function (r) {
      return el('tr', {}, [el('td', { text: r }), el('td', {}, [sayButton(Speech.speakableRow(r))])]);
    }));
  }

  /* ---------- view: Vocabulary drill ---------- */

  function viewVocab(query) {
    var out = el('div');
    out.appendChild(el('h1', { text: 'French vocabulary' }));
    out.appendChild(frenchTabs('vocab'));

    var scope = query.scope || 'all';
    var pool = S.vocab.filter(function (w) {
      return scope === 'all' || w.themes.some(function (t) { return t.subId === scope; });
    });
    var unseenCount = pool.filter(function (w) { return S.confidence(w.id) === 0; }).length;

    var scopeSelect = el('select', {
      'aria-label': 'Theme',
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

    function settingSelect(key, label, options) {
      return el('select', {
        'aria-label': label,
        onchange: function () { S.setSetting(key, this.value); }
      }, options.map(function (o) {
        return el('option', { value: o[0], text: o[1], selected: S.settings()[key] === o[0] ? '' : null });
      }));
    }
    var dirSelect = settingSelect('vocabDirection', 'Direction', [['fr-en', 'French → English'], ['en-fr', 'English → French']]
      .concat(Speech.supported ? [['listen', 'Listen → English']] : []));
    var modeSelect = settingSelect('vocabMode', 'Answer mode', [['type', 'Type the answer'], ['flip', 'Flip cards']]);
    var size = sizeSelect([10, 20, 40], 20);

    out.appendChild(el('div.panel', { style: 'margin:.8rem 0' }, [
      el('div.row', {}, [scopeSelect, dirSelect, modeSelect, size,
        el('button.btn.primary', { text: 'Start', onclick: start })
      ]),
      el('div.small.muted', { style: 'margin-top:.6rem', text:
        pool.length + ' words in scope · ' + dueIn(pool) + ' due · ' + unseenCount + ' not yet seen. ' +
        'Typing is slower but proves you know it; flip cards cover more ground. ' +
        (Speech.supported ? '"Listen → English" plays the word without showing it — practice for the Listening paper.' : '') })
    ]));

    var slot = el('div.review');
    out.appendChild(slot);

    function start() {
      // Due words first; new words shuffled, since the list is alphabetical.
      var due = buildQueue(pool.filter(function (w) { return S.confidence(w.id) > 0; }), 1e9);
      var unseen = shuffle(pool.filter(function (w) { return S.confidence(w.id) === 0; }));
      startPractice(slot, due.concat(unseen).slice(0, parseInt(size.value, 10)));
    }
    return out;
  }

  /* ---------- view: French grammar ---------- */

  function topicById(id) {
    for (var i = 0; i < S.grammarTopics.length; i++) if (S.grammarTopics[i].id === id) return S.grammarTopics[i];
    return null;
  }

  function viewGrammarIndex() {
    var out = el('div');
    out.appendChild(el('h1', { text: 'French grammar' }));
    out.appendChild(frenchTabs('grammar'));
    if (!S.grammarTopics.length) {
      out.appendChild(el('div.empty', { text: 'No grammar cards loaded — data/french_grammar.js is missing.' }));
      return out;
    }
    out.appendChild(el('p.muted', { text:
      'Every point on the specification\'s grammar list, each with revision notes and cards. ' +
      'Gap cards copy the Paper 2 grammar task: change the word in brackets so that it fits. ' +
      'Topics tagged R are receptive only — you need to recognise them, not produce them.' }));

    var gaps = S.grammar.filter(function (i) { return i.card.type === 'gap'; });
    var topicSelect = el('select', { 'aria-label': 'Topic' }, [
      el('option', { value: 'all', text: 'All topics in order (' + S.grammar.length + ' cards)' }),
      el('option', { value: 'exam', text: 'Exam-style mix: gap sentences from every topic (' + gaps.length + ')' })
    ].concat(S.grammarTopics.map(function (t) {
      return el('option', { value: t.id, text: t.title + ' (' + t.items.length + ')' });
    })));
    var size = sizeSelect([10, 20, 40], 10);
    var slot = el('div.review');
    out.appendChild(el('div.panel', { style: 'margin:.8rem 0' }, [
      el('div.row', {}, [topicSelect, size, el('button.btn.primary', { text: 'Start', onclick: function () {
        var n = parseInt(size.value, 10);
        if (topicSelect.value === 'exam') {
          // Like the Paper 2 grammar task: a shuffled mix rather than one topic at a time.
          var due = buildQueue(gaps.filter(function (i) { return S.confidence(i.id) > 0; }), 1e9);
          var fresh = shuffle(gaps.filter(function (i) { return S.confidence(i.id) === 0; }));
          startPractice(slot, due.concat(fresh).slice(0, n));
          return;
        }
        var pool = topicSelect.value === 'all' ? S.grammar : topicById(topicSelect.value).items;
        startPractice(slot, buildQueue(pool, n));
      } })]),
      el('div.small.muted', { style: 'margin-top:.6rem', text: dueIn(S.grammar) + ' due · ' +
        S.tally(S.grammar).newCount + ' not yet seen. New cards come in topic order, easiest first.' })
    ]));
    out.appendChild(slot);

    var areas = [];
    S.grammarTopics.forEach(function (t) { if (areas.indexOf(t.area) < 0) areas.push(t.area); });
    areas.forEach(function (area) {
      out.appendChild(el('h2', { text: area }));
      var list = el('div.panel.topic-list');
      S.grammarTopics.forEach(function (t) {
        if (t.area !== area) return;
        list.appendChild(el('a.topic-row', { href: '#/grammar/' + encodeURIComponent(t.id) }, [
          el('span.t', {}, [document.createTextNode(t.title + ' '),
            t.receptive ? el('span.tag', { text: 'R', title: 'Receptive only' }) : null]),
          el('span.small.faint', { text: t.items.length + ' cards' }),
          el('div', { style: 'width:5.5rem' }, [progressBar(S.tally(t.items))])
        ]));
      });
      out.appendChild(list);
    });
    return out;
  }

  /* What a card asks and what it expects, for the reference list. */
  function cardSummary(c) {
    if (c.type === 'flip') return [rich(c.front), rich(c.back)];
    var q = c.type === 'gap'
      ? el('span', {}, [rich(c.prompt.replace('___', '___' + (c.base ? ' (' + c.base + ')' : ''))),
        c.hint ? el('span.faint', { text: '  hint: ' + c.hint }) : null])
      : el('span', {}, [el('span.faint', { text: c.instruction + ' ' }), rich(c.prompt)]);
    return [q, el('span', { text: c.answers.join('  ·  ') })];
  }

  function viewGrammarTopic(id) {
    var t = topicById(id);
    if (!t) return el('div.empty', {}, [el('div', { text: 'Unknown grammar topic.' }), el('a.btn', { href: '#/grammar', text: 'All topics' })]);
    var out = el('div');
    out.appendChild(el('h1', { text: 'French grammar' }));
    out.appendChild(frenchTabs('grammar'));
    out.appendChild(el('div.small', { style: 'margin:.2rem 0 .5rem' }, [el('a', { href: '#/grammar', text: '← All topics' })]));
    out.appendChild(el('h2', { style: 'margin-top:.3rem' }, [document.createTextNode(t.title + ' '),
      t.receptive ? el('span.tag', { text: 'Receptive only' }) : null]));
    out.appendChild(el('p.small.muted', { style: 'margin-top:-.3rem', text: 'Specification: ' + t.spec }));
    out.appendChild(el('div.panel.notes', {}, [
      el('h3', { text: 'Revision notes' }),
      el('ul', {}, t.summary.map(function (line) { return el('li', {}, [rich(line)]); }))
    ]));

    var tt = S.tally(t.items);
    var size = sizeSelect([10, 20, 1e9], 10);
    var slot = el('div.review');
    out.appendChild(el('div.panel', { style: 'margin:.8rem 0' }, [
      el('div.spread', { style: 'margin-bottom:.5rem' }, [
        el('h3', { text: tt.started + ' of ' + tt.total + ' cards started · ' + dueIn(t.items) + ' due' }),
        el('div.row', {}, [size, el('button.btn.primary', { text: 'Practise', onclick: function () {
          startPractice(slot, buildQueue(t.items, parseInt(size.value, 10)));
        } })])
      ]),
      progressBar(tt)
    ]));
    out.appendChild(slot);

    var rows = t.items.map(function (item) {
      var parts = cardSummary(item.card);
      return el('tr', {}, [
        el('td.small.faint', { text: item.card.type }),
        el('td.small', {}, [parts[0]]),
        el('td.small', {}, [parts[1]])
      ]);
    });
    out.appendChild(el('details.topic', { style: 'margin-top:1rem' }, [
      el('summary', {}, [el('span.t', { text: 'All ' + t.items.length + ' cards, with answers' })]),
      el('div.topic-body', {}, [el('table.plain', {}, rows)])
    ]));
    return out;
  }

  /* ---------- view: French verbs ---------- */

  var TENSE_ABBR = { present: 'Pres', perfect: 'Perf', imperfect: 'Imperf', future: 'Fut',
    conditional: 'Cond', pluperfect: 'Plup', imperative: 'Imper' };

  function tenseList() {
    var d = window.IGCSE_DATA && window.IGCSE_DATA.frenchVerbs;
    return d ? d.tenses : [];
  }

  function viewVerbs(query) {
    var out = el('div');
    out.appendChild(el('h1', { text: 'French verbs' }));
    out.appendChild(frenchTabs('verbs'));
    if (!S.verbs.length) {
      out.appendChild(el('div.empty', { text: 'No verb data loaded — data/french_verbs.js is missing.' }));
      return out;
    }
    out.appendChild(el('p.muted', { text:
      'One card per verb and tense. Each time a card comes up it asks for a different person, ' +
      'so you cannot get by on one memorised form. Type the form with or without the pronoun.' }));

    var tenses = tenseList();
    var groups = [];
    S.verbs.forEach(function (v) { if (groups.indexOf(v.group) < 0) groups.push(v.group); });
    var tenseSelect = el('select', { 'aria-label': 'Tense' }, [el('option', { value: 'all', text: 'All tenses' })]
      .concat(tenses.map(function (t) {
        return el('option', { value: t.id, text: t.name + ' (' + t.fr + ')', selected: query.tense === t.id ? '' : null });
      })));
    var groupSelect = el('select', { 'aria-label': 'Verbs' }, [el('option', { value: 'all', text: 'All ' + S.verbs.length + ' verbs' })]
      .concat(groups.map(function (g) { return el('option', { value: g, text: g + ' verbs' }); })));
    var size = sizeSelect([10, 20, 40], 10);
    var slot = el('div.review');

    function pool() {
      var order = tenses.map(function (t) { return t.id; });
      // New cards come tense by tense: every present before any perfect.
      return S.verbItems.filter(function (i) {
        return (tenseSelect.value === 'all' || i.tense.id === tenseSelect.value) &&
          (groupSelect.value === 'all' || i.verb.group === groupSelect.value);
      }).sort(function (a, b) { return order.indexOf(a.tense.id) - order.indexOf(b.tense.id); });
    }
    out.appendChild(el('div.panel', { style: 'margin:.8rem 0' }, [
      el('div.row', {}, [tenseSelect, groupSelect, size, el('button.btn.primary', { text: 'Start', onclick: function () {
        startPractice(slot, buildQueue(pool(), parseInt(size.value, 10)));
      } })]),
      el('div.small.muted', { style: 'margin-top:.6rem', text:
        S.verbItems.length + ' cards · ' + dueIn(S.verbItems) + ' due · ' + S.tally(S.verbItems).newCount + ' not yet seen' })
    ]));
    out.appendChild(slot);

    // Overview grid: one dot per verb and tense.
    var head = el('tr', {}, [el('th', { text: 'Verb' })].concat(tenses.map(function (t) {
      return el('th', { title: t.name + ' (' + t.fr + ')', text: TENSE_ABBR[t.id] || t.name });
    })));
    var rows = [head];
    S.verbs.forEach(function (v) {
      var byTense = {};
      v.items.forEach(function (i) { byTense[i.tense.id] = i; });
      rows.push(el('tr', {}, [
        el('td', {}, [el('a', { href: '#/verbs/' + encodeURIComponent(v.inf), text: v.inf }),
          el('span.small.faint', { text: '  ' + v.en })])
      ].concat(tenses.map(function (t) {
        var i = byTense[t.id];
        if (!i) return el('td.faint', { text: '–' });
        var c = S.confidence(i.id);
        return el('td', {}, [el('span.dot', { class: c === 2 ? 'solid' : c === 1 ? 'shaky' : 'new',
          title: v.inf + ' · ' + t.name + ': ' + (c === 2 ? 'solid' : c === 1 ? 'shaky' : 'not started') })]);
      }))));
    });
    out.appendChild(el('h2', { text: 'Progress by verb' }));
    out.appendChild(el('div.panel', { style: 'overflow-x:auto' }, [el('table.plain.verb-grid', {}, rows)]));
    return out;
  }

  function viewVerb(inf) {
    var v = null;
    S.verbs.forEach(function (x) { if (x.inf === inf) v = x; });
    if (!v) return el('div.empty', {}, [el('div', { text: 'Unknown verb.' }), el('a.btn', { href: '#/verbs', text: 'All verbs' })]);
    var out = el('div');
    out.appendChild(el('h1', { text: 'French verbs' }));
    out.appendChild(frenchTabs('verbs'));
    out.appendChild(el('div.small', { style: 'margin:.2rem 0 .5rem' }, [el('a', { href: '#/verbs', text: '← All verbs' })]));
    out.appendChild(el('h2', { style: 'margin-top:.3rem' }, [document.createTextNode(v.inf + ' '),
      el('span.muted', { style: 'font-weight:400', text: '— ' + v.en })]));
    out.appendChild(el('p.small.muted', { style: 'margin-top:-.3rem', text: v.group +
      ' · perfect tense with ' + v.aux }));
    var slot = el('div.review');
    out.appendChild(el('div.row', { style: 'margin:.4rem 0 .8rem' }, [
      el('button.btn.primary', { text: 'Practise this verb', onclick: function () {
        startPractice(slot, buildQueue(v.items, 1e9));
      } })
    ]));
    out.appendChild(slot);
    var grid = el('div.grid');
    v.items.forEach(function (i) {
      grid.appendChild(el('div.panel', {}, [
        el('div.spread', {}, [el('h3', { text: i.tense.name }), el('span.small.faint', { text: i.tense.fr })]),
        conjTable(i)
      ]));
    });
    out.appendChild(grid);
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
    var label = item.kind === 'vocab' ? item.fr + ' — ' + item.en
      : item.kind === 'grammar' ? plainCard(item.card)
      : item.kind === 'verb' ? item.verb.inf + ' — ' + item.tense.name + ' (' + item.tense.fr + ')'
      : item.ref + '  ' + item.text;
    var where = item.kind === 'vocab' ? (item.themes[0] ? item.themes[0].subTitle : '')
      : item.kind === 'grammar' ? 'Grammar · ' + item.topic.title
      : item.kind === 'verb' ? 'Verbs'
      : item.subTitle;
    return el('tr', {}, [
      el('td.small', {}, [
        el('div', {}, [
          el('span.mono.faint', { text: S.subjects[item.subject].name + ' · ' }),
          document.createTextNode(where)
        ]),
        el('div', { text: label })
      ]),
      el('td.small.mono', { style: 'white-space:nowrap',
        text: rec.card.lapses + '\u00d7 wrong' }),
      el('td', {}, [confidenceControl(item, renderNav)])
    ]);
  }

  function plainCard(c) {
    var text = c.type === 'flip' ? c.front
      : c.type === 'gap' ? c.prompt.replace('___', '___' + (c.base ? ' (' + c.base + ')' : '')) + (c.hint ? '  [' + c.hint + ']' : '')
      : c.instruction + ' ' + c.prompt;
    return text.replace(/\*\*/g, '');
  }

  /* ---------- flashcard export (Anki / Quizlet) ---------- */

  function tsvField(s) { return String(s).replace(/\*\*/g, '').replace(/[\t\r\n]+/g, ' ').trim(); }
  function tsv(rows) {
    return rows.map(function (r) { return r.map(tsvField).join('\t'); }).join('\n') + '\n';
  }
  var EXPORTS = {
    vocabulary: function () {
      return tsv(S.vocab.map(function (w) {
        var t = w.themes[0];
        return [w.fr, w.en, 'igcse-french vocab ' + (t ? t.subId : '')];
      }));
    },
    grammar: function () {
      return tsv(S.grammar.map(function (i) {
        var c = i.card;
        var back = c.type === 'flip' ? c.back : c.answers.join(' / ') + ' — ' + c.why;
        return [plainCard(c), back, 'igcse-french grammar ' + i.topic.id];
      }));
    },
    verbs: function () {
      return tsv(S.verbItems.map(function (i) {
        return [i.verb.inf + ' (' + i.verb.en + ') — ' + i.tense.name + ' / ' + i.tense.fr, i.table.join('; '),
          'igcse-french verbs ' + i.tense.id];
      }));
    }
  };
  function download(name, text) {
    var url = URL.createObjectURL(new Blob([text], { type: 'text/tab-separated-values;charset=utf-8' }));
    var a = el('a', { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 30000);   // some browsers fetch late
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

  function speechPanel() {
    var panel = el('div.panel', { style: 'margin:.8rem 0' }, [el('h3', { text: 'Reading French aloud' })]);
    if (!Speech.supported) {
      panel.appendChild(el('p.small.muted', { text: 'This browser cannot speak. Chrome, Edge, Safari and Firefox all can.' }));
      return panel;
    }
    var body = el('div');
    panel.appendChild(body);
    function render() {
      body.textContent = '';
      var voices = Speech.frenchVoices();
      body.appendChild(el('p.small.muted', { text:
        'Uses the voices built into this device, so it works offline and nothing is sent anywhere. ' +
        'Quality depends on the device: iPhone, iPad and Mac voices are good, and Chrome adds "Google français".' }));
      if (!voices.length) {
        body.appendChild(el('p.small', { style: 'color:var(--shaky)', text:
          'No French voice found on this device, so French will be read with an English accent or not at all. ' +
          'Windows: Settings → Time & language → Speech → Add voices → Français. ' +
          'Android: Settings → Text-to-speech → install French for Google. ' +
          'On iPhone/iPad/Mac: Settings → Accessibility → Spoken Content → Voices → French.' }));
      }
      var current = Speech.voice();
      var voiceSelect = el('select', { 'aria-label': 'French voice', onchange: function () {
        S.setSetting('speechVoice', this.value); applySpeechSettings(); test();
      } }, [el('option', { value: '', text: 'Best available' + (current && !S.settings().speechVoice ? ' (' + current.name + ')' : '') })]
        .concat(voices.map(function (v) {
          return el('option', { value: v.voiceURI, text: v.name + ' — ' + v.lang + (v.localService ? '' : ' (online)'),
            selected: S.settings().speechVoice === v.voiceURI ? '' : null });
        })));
      var rateSelect = el('select', { 'aria-label': 'Speed', onchange: function () {
        S.setSetting('speechRate', Number(this.value)); applySpeechSettings(); test();
      } }, [[0.7, 'Slow'], [0.9, 'Normal'], [1.05, 'Native speed']].map(function (r) {
        return el('option', { value: String(r[0]), text: r[1], selected: Number(S.settings().speechRate) === r[0] ? '' : null });
      }));
      var auto = el('label.small', {}, [
        el('input', { type: 'checkbox', checked: S.settings().speechAuto ? '' : null, onchange: function () {
          S.setSetting('speechAuto', this.checked);
        } }),
        ' Read French out automatically on each card'
      ]);
      function test() { Speech.say('Bonjour ! Je m\'appelle Léa et j\'habite à Lyon avec ma famille.'); }
      body.appendChild(el('div.row', {}, [voiceSelect, rateSelect, el('button.btn', { text: '🔊 Test', onclick: test })]));
      body.appendChild(el('div', { style: 'margin-top:.5rem' }, [auto]));
    }
    render();
    Speech.onVoices(function () { if (panel.isConnected) render(); });
    return panel;
  }

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

    out.appendChild(speechPanel());

    out.appendChild(el('div.panel', { style: 'margin:.8rem 0' }, [
      el('h3', { text: 'Export French flashcards' }),
      el('p.small.muted', { text: 'Tab-separated text files: front, back, tags. Anki imports them directly (File → Import); ' +
        'for Quizlet, open the file and paste it into Create → Import. Progress is not included.' }),
      el('div.row', {}, Object.keys(EXPORTS).map(function (k) {
        return el('button.btn', { text: k.charAt(0).toUpperCase() + k.slice(1), onclick: function () {
          download('igcse-french-' + k + '.tsv', EXPORTS[k]());
        } });
      }))
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
      if (hash === l[0] || hash.indexOf(l[0] + '/') === 0 ||
          (l[0] === '#/s/french' && /^#\/(vocab|grammar|verbs)\b/.test(hash))) a.className = 'on';
      if (l[0] === '#/review') {
        var n = S.dueCount(null);
        if (n) a.appendChild(el('span.badge', { text: String(n) }));
      }
      nav.appendChild(a);
    });
  }

  function decode(s) {
    try { return decodeURIComponent(s); } catch (e) { return s; }
  }

  function parseHash() {
    var raw = (location.hash || '#/today').slice(1);
    var qi = raw.indexOf('?');
    var query = {};
    if (qi >= 0) {
      raw.slice(qi + 1).split('&').forEach(function (kv) {
        var p = kv.split('=');
        query[decode(p[0])] = decode(p[1] || '');
      });
      raw = raw.slice(0, qi);
    }
    return { parts: raw.split('/').filter(Boolean), query: query };
  }

  function route() {
    document.onkeydown = null;
    Speech.stop();
    var r = parseHash();
    var node;
    switch (r.parts[0]) {
      case 's': node = viewSubject(r.parts[1]); break;
      case 'review': node = viewReview(r.parts[1] || null); break;
      case 'vocab': node = viewVocab(r.query); break;
      case 'grammar': node = r.parts[1] ? viewGrammarTopic(decode(r.parts[1])) : viewGrammarIndex(); break;
      case 'verbs': node = r.parts[1] ? viewVerb(decode(r.parts[1])) : viewVerbs(r.query); break;
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
  applySpeechSettings();
  window.addEventListener('hashchange', route);
  route();
})();
