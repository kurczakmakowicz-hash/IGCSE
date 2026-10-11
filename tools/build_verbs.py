"""Generate the French verb-conjugation deck (data/french_verbs.js).

Usage:  pip install verbecc && python3 tools/build_verbs.py [outdir]

Forms come from verbecc's conjugation tables (built from Wiktionary-style
templates, not machine-predicted: the build refuses any verb verbecc would have
to guess). The deck covers the tenses the specification's grammar list asks
for productively; the subjunctive and passive are receptive-only there, so
they are left to the grammar cards.

One card per verb and tense. The app picks the person at review time, so the
data carries every accepted form for every person, plus a compact table to
show once the card is answered.
"""
import json
import logging
import os
import re
import sys

logging.disable(logging.CRITICAL)
from verbecc import CompleteConjugator, LangCodeISO639_1  # noqa: E402

# (infinitive, English, group, takes an imperative card)
VERBS = [
    # regular patterns
    ("parler", "to speak, to talk", "regular -er", True),
    ("aimer", "to like, to love", "regular -er", False),
    ("jouer", "to play", "regular -er", True),
    ("finir", "to finish", "regular -ir", True),
    ("choisir", "to choose", "regular -ir", True),
    ("vendre", "to sell", "regular -re", False),
    ("attendre", "to wait (for)", "regular -re", True),
    # spelling changes
    ("manger", "to eat", "spelling change", True),
    ("commencer", "to begin, to start", "spelling change", True),
    ("acheter", "to buy", "spelling change", True),
    ("appeler", "to call", "spelling change", True),
    ("préférer", "to prefer", "spelling change", False),
    ("payer", "to pay (for)", "spelling change", True),
    ("envoyer", "to send", "irregular", True),
    # regular, but être in compound tenses
    ("arriver", "to arrive, to happen", "regular, with être", False),
    ("entrer", "to enter, to go in", "regular, with être", True),
    ("rester", "to stay, to remain", "regular, with être", True),
    ("tomber", "to fall", "regular, with être", False),
    ("monter", "to go up, to get on", "regular, with être", True),
    ("descendre", "to go down, to get off", "regular, with être", True),
    ("rentrer", "to go home, to return", "regular, with être", True),
    # irregular
    ("avoir", "to have", "irregular", False),
    ("être", "to be", "irregular", False),
    ("aller", "to go", "irregular", True),
    ("faire", "to do, to make", "irregular", True),
    ("venir", "to come", "irregular", True),
    ("devenir", "to become", "irregular", False),
    ("revenir", "to come back", "irregular", True),
    ("prendre", "to take", "irregular", True),
    ("apprendre", "to learn, to teach", "irregular", True),
    ("comprendre", "to understand", "irregular", False),
    ("pouvoir", "to be able to, can", "irregular", False),
    ("vouloir", "to want", "irregular", False),
    ("devoir", "to have to, must", "irregular", False),
    ("savoir", "to know (a fact), to know how to", "irregular", False),
    ("connaître", "to know (a person or place)", "irregular", False),
    ("voir", "to see", "irregular", True),
    ("croire", "to believe, to think", "irregular", False),
    ("dire", "to say, to tell", "irregular", True),
    ("lire", "to read", "irregular", True),
    ("écrire", "to write", "irregular", True),
    ("mettre", "to put, to put on", "irregular", True),
    ("boire", "to drink", "irregular", True),
    ("sortir", "to go out", "irregular", True),
    ("partir", "to leave", "irregular", True),
    ("dormir", "to sleep", "irregular", True),
    ("ouvrir", "to open", "irregular", True),
    ("courir", "to run", "irregular", True),
    ("recevoir", "to receive", "irregular", False),
    ("vivre", "to live", "irregular", False),
    ("conduire", "to drive", "irregular", False),
    ("suivre", "to follow", "irregular", True),
    ("mourir", "to die", "irregular", False),
    ("naître", "to be born", "irregular", False),
    # reflexive
    ("se lever", "to get up", "reflexive", True),
    ("se coucher", "to go to bed", "reflexive", True),
    ("s'habiller", "to get dressed", "reflexive", True),
    ("se réveiller", "to wake up", "reflexive", True),
    ("s'amuser", "to have fun", "reflexive", True),
    ("se promener", "to go for a walk", "reflexive", True),
]

# (id, English name, French name, verbecc mood, verbecc tense)
TENSES = [
    ("present", "Present", "présent", "indicatif", "présent"),
    ("perfect", "Perfect", "passé composé", "indicatif", "passé-composé"),
    ("imperfect", "Imperfect", "imparfait", "indicatif", "imparfait"),
    ("future", "Future", "futur simple", "indicatif", "futur-simple"),
    ("conditional", "Conditional", "conditionnel", "conditionnel", "présent"),
    ("pluperfect", "Pluperfect", "plus-que-parfait", "indicatif", "plus-que-parfait"),
    ("imperative", "Imperative", "impératif", "imperatif", "imperatif-présent"),
]
COMPOUND = {"perfect", "pluperfect"}
PERSONS = ["je", "tu", "il", "elle", "on", "nous", "vous", "ils", "elles"]
ROWS = [["je"], ["tu"], ["il", "elle", "on"], ["nous"], ["vous"], ["ils", "elles"]]

ARCHAIC = {"je puis"}
# 1990 spelling reform: accepted, never shown. verbecc knows préfèrerai;
# connaît/naît without the circumflex are added here.
REFORMED = re.compile(r"préfèrer|(conn|n)ai(t|tr)")
REFORM_CIRCUMFLEX = {"connaître", "naître"}

# Who a participle can agree with when the auxiliary is être. "vous" may be
# one person (polite) or several; "on" is often used for "nous".
AGREE = {
    "je": ["m", "f"], "tu": ["m", "f"], "il": ["m"], "elle": ["f"],
    "on": ["m", "f", "mp", "fp"], "nous": ["mp", "fp"],
    "vous": ["m", "f", "mp", "fp"], "ils": ["mp"], "elles": ["fp"],
}


def compact(forms, base):
    """Participle variants in textbook shorthand, given the masculine singular:
    allé + allée -> allé(e); allés + allées -> allé(e)s; all four -> allé(e)(s)."""
    s = set(forms)
    for show, need in [(base + "(e)(s)", {base, base + "e", base + "s", base + "es"}),
                       (base + "(e)s", {base + "s", base + "es"}),
                       (base + "(e)", {base, base + "e"})]:
        if s == need:
            return show
    return " / ".join(sorted(s))


def build():
    cg = CompleteConjugator(lang=LangCodeISO639_1.fr)
    verbs = []
    for inf, en, group, imperative in VERBS:
        data = cg.conjugate(inf).get_data()
        if data["verb"].get("predicted"):
            raise SystemExit(f"verbecc would have to guess {inf!r}; refusing to use it")
        moods = data["moods"]
        # Reflexives list their participle as "s'étant levé"; keep the last word.
        pp = {("m" if x["g"] == "m" else "f") + ("p" if i % 2 else ""): x["c"][0].split()[-1]
              for i, x in enumerate(moods["participe"]["participe-passé"])}
        je_pc = next(x["c"][0] for x in moods["indicatif"]["passé-composé"] if x["pr"] == "je")
        aux = "être" if (" suis " in je_pc or inf.startswith(("se ", "s'"))) else "avoir"
        if aux == "être" and not all(k in pp for k in ("m", "mp", "f", "fp")):
            raise SystemExit(f"unexpected participle forms for {inf}: {pp}")

        tenses = {}
        for tid, _, _, mood, tense in TENSES:
            if tid == "imperative" and not imperative:
                continue
            rows = moods[mood][tense]
            forms = {}
            for x in rows:
                forms.setdefault(str(x["pr"]), []).extend(x["c"])
            if inf in REFORM_CIRCUMFLEX:
                for p in forms:
                    forms[p] += [f.replace("aît", "ait") for f in forms[p] if "aît" in f]
            if tid in COMPOUND and aux == "être":
                # Rebuild from "subject + auxiliary" with every participle the
                # subject can take (verbecc lists only plural for vous, etc.).
                for p in PERSONS:
                    sample = forms[p][0]
                    prefix = sample[: sample.rindex(" ")]
                    forms[p] = [prefix + " " + pp[g] for g in AGREE[p]]
            persons = ["tu", "nous", "vous"] if tid == "imperative" else PERSONS
            out, shown = {}, {}
            for p in persons:
                fs = [f for f in dict.fromkeys(forms.get(p, [])) if f not in ARCHAIC]
                if not fs:
                    raise SystemExit(f"no {tid} form for {inf} / {p}")
                out[p] = fs
                # 1990 reform spellings (je préfèrerai) are accepted, not shown.
                shown[p] = [f for f in fs if not REFORMED.search(f)] or fs
            table = []
            for row in ROWS:
                row = [p for p in row if p in out]
                if not row:
                    continue
                cells = []
                for p in row:
                    fs = shown[p]
                    prefix = fs[0][: fs[0].rindex(" ")] if " " in fs[0] else None
                    if len(fs) == 1:
                        cells.append(fs[0])
                    elif prefix and all(f.startswith(prefix + " ") for f in fs):
                        cells.append(prefix + " " + compact([f[len(prefix) + 1:] for f in fs], pp["m"]))
                    else:
                        cells.append(" / ".join(fs))   # genuine variants: je paie / je paye
                # il/elle/on usually share one form: "il/elle/on va".
                tails = {c.split(" ", 1)[1] if " " in c else c for c in cells}
                if len(row) > 1 and len(tails) == 1 and all(" " in c for c in cells):
                    cells = ["/".join(row) + " " + tails.pop()]
                table.append(" · ".join(cells))
            tenses[tid] = {"forms": out, "table": table}
        verbs.append({"inf": inf, "en": en, "group": group, "aux": aux,
                      "pp": pp["m"], "tenses": tenses})
    return verbs


def main():
    outdir = sys.argv[1] if len(sys.argv) > 1 else "data"
    verbs = build()
    payload = {
        "source": "Generated by tools/build_verbs.py from verbecc conjugation tables",
        "tenses": [{"id": t[0], "name": t[1], "fr": t[2]} for t in TENSES],
        "persons": PERSONS,
        "verbs": verbs,
    }
    path = os.path.join(outdir, "french_verbs.js")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("// Generated by tools/build_verbs.py from verbecc conjugation tables.\n"
                 "// Do not edit by hand.\n")
        fh.write("window.IGCSE_DATA = window.IGCSE_DATA || {};\n")
        fh.write("window.IGCSE_DATA.frenchVerbs = ")
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write(";\n")
    cards = sum(len(v["tenses"]) for v in verbs)
    print(f"verbs      {len(verbs)} verbs  {cards:5d} cards  -> {path}")


if __name__ == "__main__":
    main()
