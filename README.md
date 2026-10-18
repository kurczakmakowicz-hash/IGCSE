# IGCSE study environment — Pearson Edexcel

A static revision app for four Edexcel International GCSE subjects, built around
the actual specification content rather than a generic flashcard box.

| Subject | Code | Items |
|---|---|---|
| Biology | 4BI1 | 176 spec points (42 Paper 2 only, 14 practicals) |
| Chemistry | 4CH1 | 182 spec points (52 Paper 2 only, 12 practicals) |
| Mathematics A | 4MA1 | 241 items, Higher Tier (78 Higher-only) |
| French | 4FR1 | 2,144 prescribed words · 39 grammar topics (738 cards) · 60 verbs × 7 tenses (400 cards) |

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
the specification, by theme. The default is swipe cards: swipe right for "I
know it", left for "I don't know" (or use the buttons / arrow keys); a word you
don't know is turned over so you see the answer before moving on. You can also
type answers (compared ignoring accents and articles; any listed alternative is
accepted). French → English, English → French, or Listen → English. Every word
has a short example sentence, shown on the back of the card. Words whose latest
answer was "I know it" collect in a *words you know* list.

**Listen.** Builds one MP3 track from the words you know (or are learning, or
a whole theme): each French word, its English meaning and its example sentence,
with pauses you can lengthen to repeat after the voice. Because it is a real
recording rather than live speech synthesis it keeps playing with the screen
locked, and you can save the MP3. Tap any word in the transcript to jump to it.
The recordings are made in advance with the open-source Piper voices (see
*Where the content came from*); if they cannot be loaded, the page falls back to
the device's own voice, which only plays while the screen is on.

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

**Read aloud.** French words, completed grammar sentences and verb forms have
a 🔊 button and, unless switched off, are read out at the moment that helps:
the French word as the card appears, or the correct answer once you have
answered (never before, where hearing it would give the answer away). A
*Listen → English* vocabulary mode plays the word without showing it, as
practice for the Listening paper. It uses the browser's built-in speech
(Web Speech API), so it works offline and sends nothing anywhere — but the
voice is whatever the device has: Apple devices and Chrome have good French
voices; Windows and Android may need one installed (the Data page says how,
and lets you pick the voice and speed).

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
kept as one JSON file per topic in `content/french/grammar/`. Every topic was
checked by a reviewer who did not write it, for French accuracy and for whether
every correct answer is accepted; then every typed card was answered blind (by
a solver who never saw the answer key) and any correct answer the key missed
was added. Coverage was checked line by line against the spec's grammar list.
That is a lot of checking, not a guarantee: if a card marks a right answer
wrong, fix its `answers` list and rebuild. Verb tables are generated from the
[verbecc](https://github.com/bretttolbert/verbecc) conjugation tables by
`tools/build_verbs.py`.

The example sentences (`content/french/sentences/`) were written for this app,
one per word, and each batch was checked by a second reviewer for French
accuracy, translation and level. The listening audio in `audio/fr/` is
synthesised by `tools/build_audio.py` with [Piper](https://github.com/rhasspy/piper)
voices: French "siwis" (SIWIS French Speech Synthesis Database, CC BY 4.0) and
British English "alba" (University of Edinburgh, CC BY 4.0). It is computer
speech: clear, but not a native speaker, so trust the spelling over the audio if
the two ever seem to disagree.

Pearson reissues specifications from time to time. If yours differs, rerun the
parser against the current PDFs — see `tools/README.md`.

A handful of obvious typing errors in the published vocabulary list ("pansemen",
"gauffre", "à toute à l'heure", "œuvre caricative", "qu-est-ce que", the gloss
"so, therefore" for the conjunction *si*…) are corrected at build time so the
app never teaches a misspelling; the full list is `FRENCH_ERRATA` in
`tools/build_syllabus.py`.

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
assets/speech.js      reading French aloud (Web Speech API)
audio/fr/*.mp3        recorded listening clips, one file per vocabulary topic
data/*.js             generated content — do not edit by hand
content/french/grammar/*.json   French grammar topics (edit these)
tools/build_syllabus.py   spec PDF -> data/<subject>.js
tools/build_grammar.js    content/french/grammar -> data/french_grammar.js
tools/build_verbs.py      verbecc -> data/french_verbs.js
tools/validate_grammar.js schema checks for the grammar topics
content/french/sentences/*.json  example sentences, one per word (edit these)
tools/build_sentences.js  sentences -> data/french_sentences.js
tools/build_audio.py      Piper TTS -> audio/fr/*.mp3 + data/french_audio.js
tools/test.js         unit and data tests
```

Run the tests with `node tools/test.js` — they cover the scheduling maths, the
answer matching, and sanity checks on the generated French data (no page
headers parsed as words, every verb form present, every grammar topic valid).
