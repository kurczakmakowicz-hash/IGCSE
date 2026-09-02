"""Parse the official Pearson Edexcel International GCSE specification PDFs into
structured JSON used by the study app.

Usage:  python3 tools/build_syllabus.py <dir-with-spec-pdfs>

Expects bio.pdf, chem.pdf, maths.pdf, french.pdf in that directory. Downloads
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
# French: the prescribed vocabulary list is printed two columns to a page under
# five themes; the grammar list is a flat set of headings.
# --------------------------------------------------------------------------

THEME_RE = re.compile(r"^Theme ([A-E])\s*[–-]\s*(.+)$")
GENERAL_HEADING = "Non-topic-specific vocabulary"
GENERAL_SECTIONS = [
    "Abbreviations/acronyms", "Social conventions", "Prepositions", "Adjectives",
    "Verbs", "Adverbs", "Colours", "Quantities", "Conjunctions", "Time expressions",
    "Question words", "Other general expressions", "Other words",
    "Countries and continents", "Nationalities, etc.",
    "Geographical areas and mountains",
]
FR_SUB_RE = re.compile(r"^(\d)\s+([A-Za-z].+)$")
VOCAB_RE = re.compile(r"^(.{1,60}?)\s+[–-]\s+(.+)$")


def parse_french(path):
    raw = pages(path, layout=True)
    lines = []
    for page in raw:
        for line in page.split("\n"):
            s = line.rstrip()
            if s.strip() and not NOISE.match(s.strip()):
                lines.append(s)

    start = next(i for i, l in enumerate(lines) if THEME_RE.match(l.strip()))
    # The five themes are followed by a general vocabulary section that has its
    # own unnumbered headings, then by the appendices.
    general = next(i for i, l in enumerate(lines[start:], start)
                   if l.strip() == GENERAL_HEADING)
    end = next(i for i, l in enumerate(lines[general:], general)
               if l.strip().startswith("Appendix 2"))

    themes, theme, sub = [], None, None
    for line in lines[start:general]:
        stripped = line.strip()
        m = THEME_RE.match(stripped)
        if m:
            theme = {"id": m.group(1), "title": m.group(2).strip(), "subtopics": []}
            themes.append(theme)
            sub = None
            continue
        if theme is None:
            continue
        # Sub-topic headings ("1    Life in the town and rural life") are numbered
        # and carry no "fr - en" dash, so test them before the column split: the
        # gap after the number is as wide as the gutter between vocabulary columns.
        collapsed = re.sub(r"\s+", " ", stripped)
        m = FR_SUB_RE.match(collapsed)
        if m and not VOCAB_RE.match(collapsed):
            sub = {"id": f"{theme['id']}{m.group(1)}", "title": m.group(2).strip(),
                   "vocab": []}
            theme["subtopics"].append(sub)
            continue
        # Column-split on the wide gutter between the two vocabulary columns.
        cells = [c.strip() for c in re.split(r"\s{5,}", stripped) if c.strip()]
        if sub is None:
            continue
        for cell in cells:
            m = VOCAB_RE.match(cell)
            if m:
                fr, en = m.group(1).strip(), m.group(2).strip()
                if fr and en and len(fr) < 60:
                    sub["vocab"].append({"fr": fr, "en": en})
    # Non-topic-specific vocabulary, kept as a sixth pseudo-theme.
    gen = {"id": "F", "title": GENERAL_HEADING, "subtopics": []}
    sub = None
    for line in lines[general:end]:
        collapsed = re.sub(r"\s+", " ", line.strip())
        base = collapsed.replace(" (continued)", "")
        if base in GENERAL_SECTIONS:
            sub = next((s for s in gen["subtopics"] if s["title"] == base), None)
            if sub is None:
                sub = {"id": f"F{len(gen['subtopics']) + 1}", "title": base, "vocab": []}
                gen["subtopics"].append(sub)
            continue
        if sub is None:
            continue
        for cell in [c.strip() for c in re.split(r"\s{5,}", line.strip()) if c.strip()]:
            m = VOCAB_RE.match(cell)
            if m and len(m.group(1).strip()) < 60:
                sub["vocab"].append({"fr": m.group(1).strip(), "en": m.group(2).strip()})
    themes.append(gen)

    # A word can be printed twice inside one sub-topic where a column wraps.
    for t in themes:
        for s in t["subtopics"]:
            seen, uniq = set(), []
            for w in s["vocab"]:
                if w["fr"] not in seen:
                    seen.add(w["fr"])
                    uniq.append(w)
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

    parsed = {
        "biology": parse_science(os.path.join(src, "bio.pdf"),
                                 "1 The nature and variety", "3 Assessment information"),
        "chemistry": parse_science(os.path.join(src, "chem.pdf"),
                                   "1 Principles of chemistry", "3 Assessment information"),
        "maths": parse_maths(os.path.join(src, "maths.pdf")),
        "french": parse_french(os.path.join(src, "french.pdf")),
    }
    for subject_id, topics in parsed.items():
        items = sum(len(s.get("points", s.get("vocab", []))) for t in topics
                    for s in t["subtopics"])
        path = emit(subject_id, topics, outdir)
        print(f"{subject_id:10s} {len(topics)} topics  {items:5d} items  -> {path}")


if __name__ == "__main__":
    main()
