# IGCSE study environment — Pearson Edexcel

A static revision app for four Edexcel International GCSE subjects, built around
the actual specification content rather than a generic flashcard box.

| Subject | Code | Items |
|---|---|---|
| Biology | 4BI1 | 176 spec points (42 Paper 2 only, 14 practicals) |
| Chemistry | 4CH1 | 182 spec points (52 Paper 2 only, 12 practicals) |
| Mathematics A | 4MA1 | 241 items, Higher Tier (78 Higher-only) |
| French | 4FR1 | 2,145 prescribed words, ~40 grammar topics, 60 verbs × 7 tenses |

Target series: **May/June 2027**.

## Running it

Open `index.html` in a browser. That is the whole install — no build step, no
server, no dependencies. It also works over `file://`, so you can put the folder
on a USB stick or in a synced drive.

To share it between devices, push to GitHub and turn on Pages
(Settings → Pages → deploy from branch, root). Note that progress does **not**
follow you between devices — see *Where your progress lives* below.

## What it does

**Syllabus checklist.** Every specification point for all four subjects, in the
spec's own numbering, with the official wording. Mark each one *not started*,
*shaky*, or *solid*. Filter by Paper 2 only content, practicals, Higher Tier
only, or by what is still shaky. Search across all points.

**Spaced repetition.** Anything you mark enters a review rotation on a
simplified SM-2 schedule. A spec point is shown as a prompt; you answer it in
your head or on paper, reveal what the specification actually requires, then
rate yourself. Intervals are shown on the grade buttons so you can see what each
answer costs you.

**French vocabulary.** The minimum core vocabulary list from Appendix 1 of
the specification, by theme. Drill by typing (answers compared ignoring accents
and articles; any listed alternative is accepted) or as flip cards, French →
English or English → French.

**French grammar.** Every point on the specification's grammar list as a topic
with revision notes and cards. Most cards copy the Paper 2 grammar task —
*change the word in brackets so that it fits* — and are typed and auto-marked;
the rest are rule and recognition cards you answer in your head. Points the
spec marks (R), receptive only, get recognition cards only. Typed French is
marked strictly on accents, apostrophes and hyphens, as the exam marks them,
with accent buttons under the answer box and a specific "check the accents"
message when that is the only slip.

**French verbs.** 60 high-frequency verbs in the present, perfect, imperfect,
future, conditional, pluperfect and imperative. One card per verb and tense;
each time it comes up it asks for a different person, and the full table is
shown after you answer. Forms can be typed with or without the pronoun.

**Export.** The Data page downloads the French vocabulary, grammar and verb
cards as tab-separated files for Anki or Quizlet, for anyone who prefers those.

**Weak spots.** Everything you have actually failed in review, most-failed
first. This is the only ranking in the app that is not self-reported, and it is
the list worth taking into a past paper.

## What it deliberately does not do

- **No past paper questions or mark schemes.** Those are Pearson's copyright.
  Get them from your teacher or Pearson's website and use the weak-spots list to
  decide which ones to sit.
- **No model answers.** The app tells you what the specification requires you to
  know; it does not write the answer for you. Reviews are self-graded, which
  only works if you are honest with yourself.
- **No streaks, points, badges or timers.** They measure time spent, not recall.

## Where your progress lives

In this browser's `localStorage`, and nowhere else. There is no account and
nothing is uploaded. That means:

- clearing site data wipes it,
- a different browser or device starts from zero,
- private/incognito windows forget everything on close.

**Back it up.** The Data page has an export box — copy the JSON somewhere safe
every so often, and paste it back to restore.

## Where the content came from

Everything under `data/` is parsed directly from the official Pearson
specification PDFs by `tools/build_syllabus.py`. Nothing is typed by hand, so
the wording and numbering match the spec exactly.

Specifications used:

- Biology (4BI1) — Issue 3, September 2024
- Chemistry (4CH1) — Issue 3, September 2024
- Mathematics A (4MA1) — Issue 2, November 2017
- French (4FR1) — Issue 3, January 2026

The French grammar cards are the exception: they are written to the spec's
grammar list (original sentences, not taken from any textbook or past paper),
kept as one JSON file per topic in `content/french/grammar/`, and were checked
by an independent reviewer pass for French accuracy and for whether every
correct answer is accepted. Verb tables are generated from the
[verbecc](https://github.com/bretttolbert/verbecc) conjugation tables by
`tools/build_verbs.py`.

Pearson reissues specifications from time to time. If yours differs, rerun the
parser against the current PDFs — see `tools/README.md`.

**Check anything that matters against the official specification.** The parser
reads a PDF's text layer, which is a lossy thing to do; the structure has been
verified against the source but a stray line in 3,000 items is possible.

## Layout

```
index.html            shell
assets/app.js         views and routing
assets/store.js       catalogue + progress state
assets/srs.js         spaced-repetition scheduling
assets/match.js       answer matching (vocabulary, French grammar, verbs)
data/*.js             generated content — do not edit by hand
content/french/grammar/*.json   French grammar topics (edit these)
tools/build_syllabus.py   spec PDF -> data/<subject>.js
tools/build_grammar.js    content/french/grammar -> data/french_grammar.js
tools/build_verbs.py      verbecc -> data/french_verbs.js
tools/validate_grammar.js schema checks for the grammar topics
tools/test.js         unit and data tests
```

Run the tests with `node tools/test.js` — they cover the scheduling maths, the
answer matching, and sanity checks on the generated French data (no page
headers parsed as words, every verb form present, every grammar topic valid).
