import unittest

from poker import decide, evaluate, parse_cards, estimate_equity
from poker.evaluator import (HIGH_CARD, PAIR, TWO_PAIR, TRIPS, STRAIGHT, FLUSH,
                             FULL_HOUSE, QUADS, STRAIGHT_FLUSH)


def ev(s):
    return evaluate(parse_cards(s))


class TestParsing(unittest.TestCase):
    def test_formats(self):
        self.assertEqual(parse_cards("As 10d"), [(14, 3), (10, 1)])
        self.assertEqual(parse_cards("AsKd"), [(14, 3), (13, 1)])
        self.assertEqual(parse_cards(["th", "2c"]), [(10, 2), (2, 0)])

    def test_rejects_bad_and_duplicate(self):
        with self.assertRaises(ValueError):
            parse_cards("Xs")
        with self.assertRaises(ValueError):
            parse_cards("As As")


class TestEvaluator(unittest.TestCase):
    def test_categories(self):
        cases = {
            "As Ks Qs Js Ts 2d 3c": STRAIGHT_FLUSH,
            "9c 9d 9h 9s 2d 3c 4h": QUADS,
            "Kc Kd Kh 7s 7d 2c 3h": FULL_HOUSE,
            "Ah 9h 6h 3h 2h Kd Qc": FLUSH,
            "5c 6d 7h 8s 9d Kc 2h": STRAIGHT,
            "Ac 2d 3h 4s 5d Kc 9h": STRAIGHT,
            "Qc Qd Qh 7s 2d 3c 9h": TRIPS,
            "Jc Jd 4h 4s 2d 8c 9h": TWO_PAIR,
            "Tc Td 4h 6s 2d 8c Kh": PAIR,
            "Ac Td 4h 6s 2d 8c Kh": HIGH_CARD,
        }
        for cards, cat in cases.items():
            self.assertEqual(ev(cards)[0], cat, cards)

    def test_wheel_is_lowest_straight(self):
        self.assertLess(ev("Ac 2d 3h 4s 5d"), ev("2c 3d 4h 5s 6d"))

    def test_kickers_and_ties(self):
        self.assertGreater(ev("Ac Ad Kh 7s 2d"), ev("As Ah Qh 7d 2c"))
        self.assertEqual(ev("Ac Ad Kh 7s 2d"), ev("As Ah Kd 7c 2h"))
        # two full houses available: pick the best
        self.assertEqual(ev("Kc Kd Kh 7s 7d 7c 2h"), (FULL_HOUSE, 13, 7))
        # three pairs: best two plus best kicker
        self.assertEqual(ev("Kc Kd 7h 7s 4d 4c Qh"), (TWO_PAIR, 13, 7, 12))


class TestEquity(unittest.TestCase):
    def test_aces_vs_random(self):
        eq, _ = estimate_equity(parse_cards("As Ah"), [], 1, iterations=4000, seed=1)
        self.assertAlmostEqual(eq, 0.85, delta=0.03)

    def test_made_nuts_on_river(self):
        eq, _ = estimate_equity(parse_cards("As Ks"), parse_cards("Qs Js Ts 2d 3c"),
                                3, iterations=500, seed=1)
        self.assertEqual(eq, 1.0)

    def test_tighter_range_lowers_equity(self):
        hole = parse_cards("Kd Jc")
        loose, _ = estimate_equity(hole, [], 1, 1.0, 4000, seed=2)
        tight, _ = estimate_equity(hole, [], 1, 0.1, 4000, seed=2)
        self.assertLess(tight, loose - 0.1)


class TestDecide(unittest.TestCase):
    def test_trash_folds_to_bet(self):
        d = decide("7c 2d", "As Kh Qd", pot=100, to_call=80, seed=1)
        self.assertEqual(d.action, "FOLD")

    def test_never_folds_when_check_is_free(self):
        d = decide("7c 2d", "As Kh Qd", pot=100, to_call=0, seed=1)
        self.assertEqual(d.action, "CHECK")

    def test_nuts_bets_and_raises(self):
        self.assertEqual(decide("As Ks", "Qs Js Ts 2d 3c", pot=100, seed=1).action, "RAISE")
        self.assertEqual(decide("As Ks", "Qs Js Ts 2d 3c", pot=150, to_call=50, seed=1).action, "RAISE")

    def test_drawing_hand_calls_small_bet(self):
        # nut flush draw facing a quarter-pot bet: easily priced in
        d = decide("Ah 5h", "Kh 9h 2c", pot=125, to_call=25, seed=1)
        self.assertEqual(d.action, "CALL")

    def test_all_in_when_short(self):
        d = decide("As Ad", [], pot=10, to_call=6, stack=8, seed=1)
        self.assertEqual((d.action, d.amount), ("ALL-IN", 8))

    def test_streets(self):
        self.assertEqual(decide("As Kd", "", 3, 1, seed=1).street, "preflop")
        self.assertEqual(decide("As Kd", "2c 3d 4h 5s", 3, 1, seed=1).street, "turn")

    def test_bad_input(self):
        with self.assertRaises(ValueError):
            decide("As Kd", "2c 3d", 10, 1)
        with self.assertRaises(ValueError):
            decide("As Kd", "As 3d 4h", 10, 1)
        with self.assertRaises(ValueError):
            decide("As Kd", "", pot=10, to_call=20)


if __name__ == "__main__":
    unittest.main()
