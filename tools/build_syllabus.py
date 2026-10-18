"""Parse the official Pearson Edexcel International GCSE specification PDFs into
structured JSON used by the study app.

Usage:  python3 tools/build_syllabus.py <dir-with-spec-pdfs> [outdir] [subject ...]

Expects bio.pdf, chem.pdf, maths.pdf, french.pdf in that directory; name
subjects (biology chemistry maths french) to rebuild only those. Downloads
are not automated because Pearson's URLs change between spec issues; see
tools/README.md for the current links.
"""
import json
import os
import re
import sys

from pypdf import PdfReader

NOISE = re.compile(
    r"^(Pearson Edexcel International GCSE|Specification . Issue|===PAGE|\d+\s*$|"
    r"Students should:\s*$|Students should be taught to:)"
)


def pages(path, layout=False):
    reader = PdfReader(path)
    mode = {"extraction_mode": "layout"} if layout else {}
    return [p.extract_text(**mode) or "" for p in reader.pages]


def clean(lines):
    """Strip running headers, footers and blank lines."""
    out = []
    for raw in lines:
        line = raw.rstrip()
        stripped = line.strip()
        if not stripped or NOISE.match(stripped):
            continue
        out.append(stripped)
    return out


# --------------------------------------------------------------------------
# Biology and Chemistry: numbered spec points grouped into topics / sub-topics.
# A trailing letter on a reference marks Paper 2 only content: Biology uses
# "B" (2.45B), Chemistry uses "C" (1.5C).
# --------------------------------------------------------------------------

TOPIC_RE = re.compile(r"^([1-9]) ([A-Z].+)$")
SUBTOPIC_RE = re.compile(r"^\(([a-z])\)\s+(.+)$")
POINT_RE = re.compile(r"^(\d+\.\d+)([A-Z]?)\s+(.+)$")
GROUP_LABELS = {"Flowering plants", "Humans"}
# A handful of statements are followed by named description blocks
# ("Plants: these are multicellular organisms; ..."). Keeping those out of the
# statement itself makes the statement usable as a recall prompt.
DETAIL_RE = re.compile(r"^([A-Z][A-Za-z]{2,14}):\s+(.+)$")


def parse_science(path, first_topic, stop_heading):
    lines = clean(sum((p.split("\n") for p in pages(path)), []))
    # The contents page repeats every topic heading, so anchor on the heading
    # that is actually followed by the sub-topic summary.
    start = next(i for i, l in enumerate(lines)
                 if l.startswith(first_topic)
                 and lines[i + 1].startswith("The following sub-topics"))
    end = next(i for i, l in enumerate(lines[start:], start) if l.startswith(stop_heading))

    topics, topic, subtopic, point, group = [], None, None, None, None
    for line in lines[start:end]:
        if line.startswith("The following sub-topics"):
            continue
        m = TOPIC_RE.match(line)
        if m and (not topic or m.group(1) != topic["id"]):
            topic = {"id": m.group(1), "title": m.group(2).strip(), "subtopics": []}
            topics.append(topic)
            subtopic = point = group = None
            continue
        m = SUBTOPIC_RE.match(line)
        if m and topic:
            # The sub-topic list at the head of each topic repeats the headings;
            # keep the first occurrence only.
            existing = next((s for s in topic["subtopics"] if s["id"] == m.group(1)), None)
            subtopic = existing or {"id": m.group(1), "title": m.group(2).strip(), "points": []}
            if existing is None:
                topic["subtopics"].append(subtopic)
            point = group = None
            continue
        m = POINT_RE.match(line)
        if m and subtopic is not None:
            point = {
                "ref": m.group(1) + m.group(2),
                "text": m.group(3).strip(),
                "paper2only": bool(m.group(2)),
                "bullets": [],
            }
            if group:
                point["group"] = group
            if m.group(3).lower().startswith("practical:"):
                point["practical"] = True
            subtopic["points"].append(point)
            continue
        if line in GROUP_LABELS:
            group = line
            continue
        if point is None:
            continue
        if line.startswith("•"):
            point["bullets"].append(line.lstrip("• ").rstrip("."))
            continue
        m = DETAIL_RE.match(line)
        if m:
            point.setdefault("details", []).append(
                {"term": m.group(1), "text": m.group(2).strip()})
            continue
        if point.get("details"):
            d = point["details"][-1]
            d["text"] = (d["text"].rstrip() + " " + line).strip()
        else:
            point["text"] = (point["text"].rstrip() + " " + line).strip()

    for t in topics:
        for s in t["subtopics"]:
            for p in s["points"]:
                p["text"] = re.sub(r"\s+", " ", p["text"]).strip()
                for d in p.get("details", []):
                    d["text"] = re.sub(r"\s+", " ", d["text"]).strip()
                if not p["bullets"]:
                    del p["bullets"]
    return [t for t in topics if any(s["points"] for s in t["subtopics"])]


# --------------------------------------------------------------------------
# Mathematics: a two-column table. Items are lettered A, B, C... under numbered
# sub-topics. The Higher Tier listing repeats the Foundation content by
# reference ("See Foundation Tier") and adds Higher-only items.
# --------------------------------------------------------------------------

M_TOPIC_RE = re.compile(r"^([1-6]) ([A-Z][a-z].+)$")
M_SUB_RE = re.compile(r"^(\d\.\d+)\s*$")
M_ITEM_RE = re.compile(r"^([A-Z])\s+([a-z(].+)$")
# The Notes column bleeds into the text layer as fragments of algebra; drop any
# line that is mostly symbols rather than words.
WORDY = re.compile(r"[a-z]{3,}\s+[a-z]{3,}")


def parse_maths(path):
    lines = clean(sum((p.split("\n") for p in pages(path)), []))
    bounds = [i for i, l in enumerate(lines) if l.startswith("AO1 Number")]
    found_start, higher_start = bounds[0], bounds[1]
    found_end = next(i for i, l in enumerate(lines[found_start:], found_start)
                     if l.startswith("Assessment information"))
    higher_end = next(i for i, l in enumerate(lines[higher_start:], higher_start)
                      if l.startswith("3 Assessment information"))

    def block(lo, hi, higher):
        topics, topic, sub, item = [], None, None, None
        for line in lines[lo:hi]:
            if line.startswith("AO") or line.startswith("Notes"):
                continue
            m = M_TOPIC_RE.match(line)
            if m:
                topic = {"id": m.group(1), "title": m.group(2).strip(), "subtopics": []}
                topics.append(topic)
                sub = item = None
                continue
            m = M_SUB_RE.match(line)
            if m and topic:
                sub = {"id": m.group(1), "title": "", "points": []}
                topic["subtopics"].append(sub)
                item = None
                continue
            # The sub-topic name sits in a narrow left-hand column and wraps
            # over several lines, so accumulate until the first lettered item.
            if sub is not None and not sub["points"] and not M_ITEM_RE.match(line):
                sub["title"] = (sub["title"] + " " + line.strip()).strip()
                continue
            m = M_ITEM_RE.match(line)
            if m and sub is not None:
                item = {"ref": f"{sub['id']}{m.group(1)}", "text": m.group(2).strip(),
                        "higher": higher}
                sub["points"].append(item)
                continue
            if item is not None and WORDY.search(line) and not line.startswith("e.g."):
                item["text"] += " " + line.strip()
        return topics

    foundation = block(found_start, found_end, higher=False)
    higher = block(higher_start, higher_end, higher=True)

    # Merge: Higher-only sub-topics and items are appended to the Foundation tree.
    by_id = {t["id"]: t for t in foundation}
    for ht in higher:
        base = by_id.get(ht["id"])
        if base is None:
            foundation.append(ht)
            continue
        if ht["title"] != base["title"]:
            base["title"] = ht["title"]  # e.g. "Geometry" -> "Geometry and trigonometry"
        subs = {s["id"]: s for s in base["subtopics"]}
        for hs in ht["subtopics"]:
            if "See Foundation Tier" in hs["title"] and not hs["points"]:
                continue
            target = subs.get(hs["id"])
            if target is None:
                base["subtopics"].append(hs)
                continue
            seen = {p["text"] for p in target["points"]}
            for p in hs["points"]:
                if p["text"] not in seen:
                    p["ref"] = p["ref"] + "H"
                    target["points"].append(p)

    for t in foundation:
        for s in t["subtopics"]:
            # "Higher Tier only" is printed under the sub-topic name, not beside it.
            if "Higher Tier only" in s["title"]:
                s["title"] = s["title"].replace("Higher Tier only", "").strip()
                s["higherOnly"] = True
                for p in s["points"]:
                    p["higher"] = True
            s["title"] = re.sub(r"\s*See Foundation Tier\s*", "", s["title"]).strip()
            for p in s["points"]:
                p["text"] = re.sub(r"\s+", " ", p["text"]).strip()
    return [t for t in foundation if any(s["points"] for s in t["subtopics"])]


# --------------------------------------------------------------------------
# French: the prescribed vocabulary list (Appendix 1) is printed two columns to
# a page under five themes, then a non-topic-specific section kept as a sixth
# pseudo-theme. Each entry is "French – English", with the English set in
# italics. A plain text layer loses too much here (wrapped glosses, entries
# split across the gutter), so this reads word positions and typefaces with
# pdfplumber instead.
# --------------------------------------------------------------------------

THEME_RE = re.compile(r"^Theme ([A-E])\s*[–-]\s*(.+)$")
GENERAL_HEADING = "Non-topic-specific vocabulary"
GUTTER = 300                 # x between the two vocabulary columns
RIGHT_START = (305, 313)     # x0 range where right-column entries begin
FOOTER_TOP = 780             # running footer and page number sit below this
ROW_TOL = 3                  # words within this many points share a row
WRAP_GAP = 16                # rows closer than this are one wrapped entry
DASHES = ("–", "-")


def _italic(w):
    return "Italic" in w["fontname"]


def _rows(words):
    rows = []
    for w in sorted(words, key=lambda w: (w["top"], w["x0"])):
        if rows and abs(w["top"] - rows[-1]["top"]) <= ROW_TOL:
            rows[-1]["words"].append(w)
        else:
            rows.append({"top": w["top"], "words": [w]})
    for r in rows:
        r["words"].sort(key=lambda w: w["x0"])
    return rows


def _tidy(s):
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"\(\s+", "(", s)
    s = re.sub(r"\s+\)", ")", s)
    s = re.sub(r"\bM (me|lle)\s*:", r"M\1:", s)   # superscript in Mme, Mlle
    return re.sub(r"\s+:", ":", s)


def _french_events(path):
    """Yield ('heading', size, text) and ('entry', words) in reading order."""
    import pdfplumber
    started = False
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            words = [w for w in page.extract_words(x_tolerance=1.5, extra_attrs=["fontname", "size"])
                     if w["top"] < FOOTER_TOP and "Trebuchet" not in w["fontname"]]
            text = " ".join(w["text"] for w in words)
            if not started:
                if not re.search(r"Theme A\s*[–-]", text):
                    continue
                started = True
            if text.lstrip().startswith("Appendix 2"):
                return
            bold = [w for w in words if "Bold" in w["fontname"]]
            body = [w for w in words if "Bold" not in w["fontname"]]
            # Headings span the page width and split it into bands; each band
            # is read left column top to bottom, then right column.
            heads = []
            for r in _rows(bold):
                bottom = max(w["bottom"] for w in r["words"])
                line = " ".join(w["text"] for w in r["words"])
                if heads and r["top"] - heads[-1]["bottom"] < 12:
                    heads[-1]["text"] += " " + line
                    heads[-1]["bottom"] = bottom
                else:
                    heads.append({"top": r["top"], "bottom": bottom, "text": line,
                                  "size": round(r["words"][0]["size"])})
            cuts = [h["top"] for h in heads] + [float("inf")]
            bands = [(-1, cuts[0], None)] + [(h["top"] + 1, cuts[i + 1], h) for i, h in enumerate(heads)]
            for lo, hi, head in bands:
                if head:
                    yield ("heading", head["size"], head["text"])
                band = [w for w in body if lo <= w["top"] < hi]
                # Right-column entries start at one fixed x; a word that merely
                # runs past the gutter continues the left-hand entry.
                side = {}
                for r in _rows(band):
                    prev = None
                    for w in r["words"]:
                        right = ((w["x0"] >= GUTTER and prev is None)
                                 or (prev is not None and side[id(prev)] == 1)
                                 or RIGHT_START[0] <= w["x0"] <= RIGHT_START[1])
                        side[id(w)] = 1 if right else 0
                        prev = w
                for col in (0, 1):
                    entries = []
                    for r in _rows([w for w in band if side[id(w)] == col]):
                        if entries and r["top"] - entries[-1]["last"] < WRAP_GAP:
                            entries[-1]["words"] += r["words"]
                            entries[-1]["last"] = r["top"]
                        else:
                            entries.append({"words": list(r["words"]), "last": r["top"]})
                    for e in entries:
                        yield ("entry", e["words"])


def _split_entry(words):
    """French and English halves of one entry, split on its dash; the typeface
    (English is italic) is the fallback when the dash is missing or doubled."""
    toks = [w["text"] for w in words]
    dash = [i for i, t in enumerate(toks) if t in DASHES]
    glued = [i for i, t in enumerate(toks) if len(t) > 1 and t[0] == "–"]
    if len(dash) == 1:
        fr, en = toks[:dash[0]], toks[dash[0] + 1:]
    elif not dash and len(glued) == 1:
        fr, en = toks[:glued[0]], [toks[glued[0]][1:]] + toks[glued[0] + 1:]
    else:
        fr = [w["text"] for w in words if not _italic(w) and w["text"] not in DASHES]
        en = [w["text"] for w in words if _italic(w) and w["text"] not in DASHES]
    en_s = _tidy(" ".join(en))
    en_s = re.sub(r"\b([b-hj-z]) ([a-z]{3,})", r"\1\2", en_s)   # kerning: "j ournalist"
    return _tidy(" ".join(fr)), en_s


# Typing errors in the published list, corrected so the app never teaches a
# misspelling. Keyed by the entry exactly as printed. Re-check after a reissue.
FRENCH_ERRATA = {
    "œuvre caricative (f)": "œuvre caritative (f)",
    "bureau des objects trouvés (m)": "bureau des objets trouvés (m)",
    "pansemen (m)": "pansement (m)",
    "gauffre (f)": "gaufre (f)",
    "à toute à l’heure": "à tout à l’heure",
    "à l’arrière plan": "à l’arrière-plan",
    "server": "servir",
    "qu-est-ce que?": "qu’est-ce que?",
    "grec (greque)": "grec (grecque)",
}
# Glosses that are wrong as printed ("si" the conjunction means "if").
FRENCH_GLOSS_ERRATA = {
    "si (conj)": ("so, therefore", "if"),
}


def parse_french(path):
    themes, theme, sub = [], None, None
    for ev in _french_events(path):
        if ev[0] == "heading":
            text = re.sub(r"\s+", " ", ev[2]).strip()
            m = THEME_RE.match(text)
            if m or text == GENERAL_HEADING:
                theme = {"id": m.group(1) if m else "F",
                         "title": m.group(2).strip() if m else GENERAL_HEADING,
                         "subtopics": []}
                themes.append(theme)
                sub = None
                continue
            title = re.sub(r"\s*\(continued\)$", "", text).strip()
            m = re.match(r"^(\d)\s+(.+)$", title)
            num, title = (m.group(1), m.group(2)) if m else (None, title)
            sub = next((s for s in theme["subtopics"] if s["title"] == title), None)
            if sub is None:
                sub = {"id": theme["id"] + (num or str(len(theme["subtopics"]) + 1)),
                       "title": title, "vocab": []}
                theme["subtopics"].append(sub)
            continue
        if sub is None:
            raise ValueError("vocabulary entry before any sub-topic: %r"
                             % " ".join(w["text"] for w in ev[1]))
        fr, en = _split_entry(ev[1])
        fr = FRENCH_ERRATA.get(fr, fr)
        if fr in FRENCH_GLOSS_ERRATA and en == FRENCH_GLOSS_ERRATA[fr][0]:
            en = FRENCH_GLOSS_ERRATA[fr][1]
        sub["vocab"].append({"fr": fr, "en": en})

    for t in themes:
        for s in t["subtopics"]:
            # A French phrase too long for its line can push the dash and gloss
            # onto a row of their own: rejoin the two halves.
            merged = []
            for e in s["vocab"]:
                if merged and not e["fr"] and not merged[-1]["en"]:
                    merged[-1]["en"] = e["en"]
                else:
                    merged.append(e)
            bad = [e for e in merged if not e["fr"] or not e["en"]]
            if bad:
                raise ValueError("incomplete vocabulary entries in %s: %r" % (s["id"], bad))
            # A word can be printed twice inside one sub-topic.
            seen, uniq = set(), []
            for e in merged:
                if e["fr"] not in seen:
                    seen.add(e["fr"])
                    uniq.append(e)
            s["vocab"] = uniq
    return [t for t in themes if any(s["vocab"] for s in t["subtopics"])]


SUBJECTS = {
    "biology": {
        "name": "Biology", "code": "4BI1", "kind": "science", "totalMarks": 180,
        "papers": [
            {"id": "1B", "name": "Paper 1", "duration": "2h", "marks": 110,
             "weight": "61.1%", "covers": "Content without a \u2018B\u2019 reference"},
            {"id": "2B", "name": "Paper 2", "duration": "1h 15m", "marks": 70,
             "weight": "38.9%", "covers": "All content, including \u2018B\u2019 references"},
        ],
    },
    "chemistry": {
        "name": "Chemistry", "code": "4CH1", "kind": "science", "totalMarks": 180,
        "papers": [
            {"id": "1C", "name": "Paper 1", "duration": "2h", "marks": 110,
             "weight": "61.1%", "covers": "Content without a \u2018C\u2019 reference"},
            {"id": "2C", "name": "Paper 2", "duration": "1h 15m", "marks": 70,
             "weight": "38.9%", "covers": "All content, including \u2018C\u2019 references"},
        ],
    },
    "maths": {
        "name": "Mathematics A", "code": "4MA1", "kind": "maths", "totalMarks": 200,
        "papers": [
            {"id": "1H", "name": "Paper 1H", "duration": "2h", "marks": 100,
             "weight": "50%", "covers": "Higher Tier, grades 9\u20134"},
            {"id": "2H", "name": "Paper 2H", "duration": "2h", "marks": 100,
             "weight": "50%", "covers": "Higher Tier, grades 9\u20134"},
        ],
    },
    "french": {
        "name": "French", "code": "4FR1", "kind": "language", "totalMarks": 160,
        "papers": [
            {"id": "1", "name": "Paper 1: Listening", "duration": "30m", "marks": 40,
             "weight": "25%", "covers": "Seven tasks, each on one recorded text"},
            {"id": "2", "name": "Paper 2: Reading and Writing", "duration": "1h 45m",
             "marks": 80, "weight": "50%", "covers": "Five reading tasks, two writing tasks, one grammar task"},
            {"id": "3", "name": "Paper 3: Speaking", "duration": "8\u201310m", "marks": 40,
             "weight": "25%", "covers": "Tasks A, B and C, taken in order"},
        ],
    },
}

BANNER = ("// Generated by tools/build_syllabus.py from the official Pearson Edexcel\n"
          "// International GCSE specification. Do not edit by hand.\n")


def emit(subject_id, topics, outdir):
    meta = dict(SUBJECTS[subject_id])
    meta["id"] = subject_id
    meta["topics"] = topics
    path = os.path.join(outdir, subject_id + ".js")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(BANNER)
        fh.write("window.IGCSE_DATA = window.IGCSE_DATA || {};\n")
        fh.write("window.IGCSE_DATA[%s] = " % json.dumps(subject_id))
        json.dump(meta, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write(";\n")
    return path


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else "specs"
    outdir = sys.argv[2] if len(sys.argv) > 2 else "data"
    os.makedirs(outdir, exist_ok=True)

    only = set(sys.argv[3:]) or {"biology", "chemistry", "maths", "french"}
    builders = {
        "biology": lambda: parse_science(os.path.join(src, "bio.pdf"),
                                         "1 The nature and variety", "3 Assessment information"),
        "chemistry": lambda: parse_science(os.path.join(src, "chem.pdf"),
                                           "1 Principles of chemistry", "3 Assessment information"),
        "maths": lambda: parse_maths(os.path.join(src, "maths.pdf")),
        "french": lambda: parse_french(os.path.join(src, "french.pdf")),
    }
    parsed = {sid: build() for sid, build in builders.items() if sid in only}
    for subject_id, topics in parsed.items():
        items = sum(len(s.get("points", s.get("vocab", []))) for t in topics
                    for s in t["subtopics"])
        path = emit(subject_id, topics, outdir)
        print(f"{subject_id:10s} {len(topics)} topics  {items:5d} items  -> {path}")


if __name__ == "__main__":
    main()
