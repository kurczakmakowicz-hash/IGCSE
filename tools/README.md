# Regenerating the syllabus data

`build_syllabus.py` turns the official Pearson specification PDFs into the
`data/*.js` files the app loads. Rerun it when Pearson reissues a spec.

## Usage

```sh
pip install pypdf
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
french     6 topics   2341 items  -> data/french.js
```

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
  It is read with pypdf's layout mode and split on the wide gutter between
  columns. The five themes are followed by a non-topic-specific section
  (prepositions, verbs, question words…) which is kept as a sixth pseudo-theme.

## Caveats

Parsing a PDF text layer is inherently lossy. The topic and sub-topic structure
of all four subjects has been checked against the source documents, and the
item counts above are the verified baseline — but individual statements may
carry stray fragments. Treat `data/` as a study aid, not as the specification.

Item ids used for progress (`biology#2.44`, `french#v#lac (m)`) are derived from
the spec reference or the French word. Progress is keyed on those, so a rebuild
that renumbers or rewords an item silently orphans its history.
