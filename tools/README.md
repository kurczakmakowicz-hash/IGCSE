# Regenerating the syllabus data

`build_syllabus.py` turns the official Pearson specification PDFs into the
`data/*.js` files the app loads. Rerun it when Pearson reissues a spec.

## Usage

```sh
pip install pypdf pdfplumber
mkdir specs

# Pearson moves these URLs between issues; check the qualification page if a
# download returns HTML instead of a PDF.
BASE="https://qualifications.pearson.com/content/dam/pdf/International%20GCSE"
curl -L -o specs/bio.pdf    "$BASE/Biology/2017/specification-and-sample-assessments/international-gcse-biology-2017-specification1.pdf"
curl -L -o specs/chem.pdf   "$BASE/Chemistry/2017/specification-and-sample-assessments/international-gcse-chemistry-2017-specification.pdf"
curl -L -o specs/maths.pdf  "$BASE/Mathematics%20A/2016/Specification%20and%20sample%20assessments/international-gcse-in-mathematics-spec-a.pdf"
curl -L -o specs/french.pdf "$BASE/French/2017/specification-and-sample-assessments/international-gcse-french-specification.pdf"

file specs/*.pdf              # all four must say "PDF document"
python3 tools/build_syllabus.py specs data
```

Expected output:

```
biology    5 topics    176 items  -> data/biology.js
chemistry  4 topics    182 items  -> data/chemistry.js
maths      6 topics    241 items  -> data/maths.js
french     6 topics   2312 items  -> data/french.js
```

Add subject names to rebuild only those, e.g.
`python3 tools/build_syllabus.py specs data french`.

If a count moves a long way, the PDF layout has changed and the parser needs
attention — diff the generated file before committing it.

## How each spec is read

- **Biology and Chemistry** are numbered statements (`2.44 describe tests for
  these gases:`) under lettered sub-topics. A trailing letter on the reference
  marks Paper 2 only content: `B` in Biology, `C` in Chemistry.
- **Mathematics** is a two-column table; items are lettered `A`, `B`, `C`… under
  numbered sub-topics. The spec prints the Foundation and Higher content as two
  separate listings, with Higher referring back to Foundation for anything
  unchanged, so the parser merges them and flags the Higher-only additions. The
  right-hand *Notes* column bleeds into the PDF's text layer and is filtered out
  by dropping lines that are mostly symbols.
- **French** is the Appendix 1 vocabulary list, printed two columns to a page.
  A plain text layer mangles it (glosses that wrap onto a second line lose
  their second half, entries whose dash is set apart vanish, page footers turn
  into "words"), so it is read with pdfplumber from word positions and
  typefaces: bold rows are headings, a fixed x position starts the right-hand
  column, rows closer than normal line spacing are one wrapped entry, and the
  English gloss is the italic half. The build checks itself — every entry
  must have both halves, and the entry count matches the number of dashes on
  those pages (2,320, of which 8 are repeats within a sub-topic). The five
  themes are followed by a non-topic-specific section (prepositions, verbs,
  question words…) kept as a sixth pseudo-theme.

## French grammar and verbs

These are not parsed from the spec.

- `content/french/grammar/<topic>.json` — one file per point on the spec's
  grammar list: revision notes plus `flip`, `gap` and `transform` cards. The
  format is documented by `tools/validate_grammar.js`. After editing, run
  `node tools/build_grammar.js`, which validates every file and rewrites
  `data/french_grammar.js`. A typed card is only as fair as its `answers`
  list: list every correct form in full, never `allé(e)`.
- `tools/build_verbs.py` (`pip install verbecc`) regenerates
  `data/french_verbs.js`. The verb list is at the top of the script; the build
  refuses any verb verbecc would have to guess rather than look up.

## Caveats

Parsing a PDF text layer is inherently lossy. The topic and sub-topic structure
of all four subjects has been checked against the source documents, and the
item counts above are the verified baseline — but individual statements may
carry stray fragments. Treat `data/` as a study aid, not as the specification.

Item ids used for progress (`biology#2.44`, `french#v#lac (m)`,
`french#g#articles-03`, `french#verb#aller#perfect`) are derived from the spec
reference, the French word, the grammar card id, or the verb and tense. Progress is keyed on those, so a rebuild
that renumbers or rewords an item silently orphans its history.

## Example sentences and listening audio

- `content/french/sentences/b1.json` … one array of `{w, fr, en}` per batch:
  `w` is the vocabulary entry exactly as in `data/french.js`. After editing,
  run `node tools/build_sentences.js` (it checks every word has one).
- `tools/build_audio.py` turns every word into three MP3 clips (French word,
  English meaning, French sentence) with the Piper TTS engine:

  ```sh
  pip install piper-tts lameenc
  mkdir voices && cd voices
  B=https://huggingface.co/rhasspy/piper-voices/resolve/main
  for v in fr/fr_FR/siwis/medium/fr_FR-siwis-medium en/en_GB/alba/medium/en_GB-alba-medium; do
    curl -LO "$B/$v.onnx"; curl -LO "$B/$v.onnx.json"; done
  cd .. && python3 tools/build_audio.py voices
  ```

  Clips are constant-bitrate MP3 (mono, 22,050 Hz, 32 kbit/s) from separate
  encoder runs, so the app can join any of them into one track; they are packed
  one file per vocabulary sub-topic with an index of byte offsets. Takes about
  ten minutes on four cores and produces roughly 40 MB.
