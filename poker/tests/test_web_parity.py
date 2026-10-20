"""The iPad/browser page runs poker/web/engine.js. Check it agrees with the Python engine."""

import json
import random
import shutil
import subprocess
import unittest
from pathlib import Path

from poker import decide, evaluate, parse_cards
from poker.cards import FULL_DECK
from poker.equity import (build_range, chen_score, made_hand_percentile,
                          _has_flush_draw, _has_open_ended_draw, estimate_equity)
from poker.engine import guess_opponent_range

ENGINE_JS = Path(__file__).resolve().parents[1] / "web" / "engine.js"
NODE = shutil.which("node")

SCENARIOS = [
    ("As Kd", "Qh Jc 2s", 100, 30, 1),
    ("7c 2d", "", 1.5, 1, 1),
    ("Ks Qd", "Kh 9h 2h 5c 7d", 200, 100, 1),
    ("Ks Qd", "Kh 9h 2h 5c 7d", 120, 20, 1),
    ("Ah 5h", "Kh 9h 2c", 125, 25, 2),
    ("As Ks", "Qs Js Ts 2d 3c", 150, 50, 3),
    ("Jc Jd", "", 7, 3, 2),
    ("8c 7d", "6h 5s Kd 2c", 60, 0, 1),
]


def run_js(payload):
    script = f"""
const E = require({json.dumps(str(ENGINE_JS))});
const input = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const out = {{}};
out.evals = input.hands.map(h => E.evaluate(h));
out.chen = input.pairs.map(([a, b]) => E.chenScore(a, b));
out.draws = input.drawCases.map(([h, b]) => [E.hasFlushDraw(h, b), E.hasOpenEndedDraw(h, b)]);
out.ranges = input.rangeCases.map(([dead, b, p]) => E.buildRange(dead, b, p));
out.made = input.madeCases.map(([h, b]) => E.madeHandPercentile(h, b));
out.guess = input.guessCases.map(([s, p, t, bb]) => E.guessOpponentRange(s, p, t, bb));
out.decisions = input.scenarios.map(([h, b, pot, toCall, opp]) =>
  E.decide({{hole: h, board: b, pot, toCall, opponents: opp, iterations: 20000}}));
process.stdout.write(JSON.stringify(out));
"""
    res = subprocess.run([NODE, "-e", script], input=json.dumps(payload),
                         capture_output=True, text=True, check=True)
    return json.loads(res.stdout)


def as_lists(cards):
    return [list(c) for c in cards]


@unittest.skipUnless(NODE, "node is not installed")
class TestWebParity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        rng = random.Random(7)
        cls.hands = [rng.sample(FULL_DECK, rng.choice([5, 6, 7])) for _ in range(3000)]
        cls.pairs = [rng.sample(FULL_DECK, 2) for _ in range(500)]
        cls.draw_cases = []
        for _ in range(1000):
            cards = rng.sample(FULL_DECK, rng.choice([5, 6]))
            cls.draw_cases.append((cards[:2], cards[2:]))
        boards = ["Kh 9h 2c", "Qh Jc 2s", "Kh 9h 2h 5c 7d", "6h 5s Kd 2c"]
        cls.range_cases = [(parse_cards("As Ad") + parse_cards(b), parse_cards(b), p)
                           for b in boards for p in (0.15, 0.4, 0.6)]
        cls.range_cases.append((parse_cards("Kd Jc"), [], 0.12))
        cls.made_cases = [(parse_cards(h), parse_cards(b)) for h, b, *_ in SCENARIOS if b]
        cls.guess_cases = [(s, p, t, 1) for s in ("preflop", "flop") for p, t in
                           [(1.5, 1), (7, 3), (30, 12), (100, 0), (100, 20), (100, 45), (300, 200)]]
        cls.js = run_js({
            "hands": [as_lists(h) for h in cls.hands],
            "pairs": [as_lists(p) for p in cls.pairs],
            "drawCases": [[as_lists(h), as_lists(b)] for h, b in cls.draw_cases],
            "rangeCases": [[as_lists(d), as_lists(b), p] for d, b, p in cls.range_cases],
            "madeCases": [[as_lists(h), as_lists(b)] for h, b in cls.made_cases],
            "guessCases": cls.guess_cases,
            "scenarios": [[as_lists(parse_cards(h)), as_lists(parse_cards(b)) if b else [], pot, tc, o]
                          for h, b, pot, tc, o in SCENARIOS],
        })

    def test_evaluator(self):
        for hand, js in zip(self.hands, self.js["evals"]):
            self.assertEqual(list(evaluate(hand)), js, hand)

    def test_chen(self):
        for (a, b), js in zip(self.pairs, self.js["chen"]):
            self.assertEqual(chen_score(a, b), js)

    def test_draws(self):
        for (h, b), js in zip(self.draw_cases, self.js["draws"]):
            self.assertEqual([_has_flush_draw(h, b), _has_open_ended_draw(h, b)], js, (h, b))

    def test_ranges_identical(self):
        for (dead, b, p), js in zip(self.range_cases, self.js["ranges"]):
            py = [as_lists(c) for c in build_range(set(dead), b, p)]
            self.assertEqual(py, js, (b, p))

    def test_made_hand_percentile(self):
        for (h, b), js in zip(self.made_cases, self.js["made"]):
            self.assertAlmostEqual(made_hand_percentile(h, b), js, places=9)

    def test_guess_range(self):
        for case, js in zip(self.guess_cases, self.js["guess"]):
            self.assertEqual(guess_opponent_range(*case), js)

    def test_decisions_match(self):
        for scen, js in zip(SCENARIOS, self.js["decisions"]):
            h, b, pot, tc, opp = scen
            py = decide(h, b, pot=pot, to_call=tc, opponents=opp, iterations=20000, seed=1)
            self.assertAlmostEqual(py.equity, js["equity"], delta=0.02, msg=scen)
            self.assertEqual(py.hand, js["hand"], scen)
            if "Close decision" not in " ".join(py.reasons):
                self.assertEqual((py.action, py.amount), (js["action"], js["amount"]), scen)


if __name__ == "__main__":
    unittest.main()
