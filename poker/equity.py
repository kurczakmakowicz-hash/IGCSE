"""Monte Carlo equity: how often your hand wins against N opponents.

Opponents' hole cards are drawn from a range: the top X% of starting hands by
the Chen formula. range_pct=1.0 means any two cards.
"""

import itertools
import math
import random

from .cards import FULL_DECK
from .evaluator import evaluate

HIGH_CARD_POINTS = {14: 10, 13: 8, 12: 7, 11: 6}
GAP_PENALTY = {0: 0, 1: -1, 2: -2, 3: -4}


def chen_score(c1, c2):
    """Bill Chen's quick preflop strength score (roughly -1 to 20)."""
    hi, lo = max(c1[0], c2[0]), min(c1[0], c2[0])
    score = HIGH_CARD_POINTS.get(hi, hi / 2)
    if hi == lo:
        return max(math.ceil(score * 2), 5)
    if c1[1] == c2[1]:
        score += 2
    gap = hi - lo - 1
    score += GAP_PENALTY.get(gap, -5)
    if gap <= 1 and hi < 12:
        score += 1
    return math.ceil(score)


_ALL_SCORES = sorted((chen_score(a, b) for a, b in itertools.combinations(FULL_DECK, 2)),
                     reverse=True)


def range_threshold(range_pct):
    """Minimum Chen score of a hand inside the top range_pct of all 1326 combos."""
    if range_pct >= 1.0:
        return -100
    idx = max(0, math.ceil(range_pct * len(_ALL_SCORES)) - 1)
    return _ALL_SCORES[idx]


def hand_percentile(c1, c2):
    """Fraction of starting hands at least as strong as this one (0.0 = best)."""
    s = chen_score(c1, c2)
    return sum(1 for x in _ALL_SCORES if x > s) / len(_ALL_SCORES)


def estimate_equity(hole, board, opponents=1, range_pct=1.0, iterations=5000, seed=None):
    """Return (equity, std_error). Ties count as a fraction of a win."""
    if opponents < 1:
        raise ValueError("Need at least one opponent")
    rng = random.Random(seed)
    known = set(hole) | set(board)
    deck = [c for c in FULL_DECK if c not in known]
    need_board = 5 - len(board)
    if len(deck) < 2 * opponents + need_board:
        raise ValueError("Not enough cards left in the deck for that many opponents")
    threshold = range_threshold(range_pct)

    total = 0.0
    for _ in range(iterations):
        used = set()
        opp_hands = []
        for _ in range(opponents):
            for attempt in range(500):
                a, b = rng.sample(deck, 2)
                if a in used or b in used:
                    continue
                if chen_score(a, b) >= threshold or attempt == 499:
                    break
            used.add(a)
            used.add(b)
            opp_hands.append((a, b))
        rest = [c for c in deck if c not in used]
        full_board = list(board) + rng.sample(rest, need_board)

        mine = evaluate(list(hole) + full_board)
        best_opp = max(evaluate(list(h) + full_board) for h in opp_hands)
        if mine > best_opp:
            total += 1.0
        elif mine == best_opp:
            tied = sum(1 for h in opp_hands if evaluate(list(h) + full_board) == mine)
            total += 1.0 / (tied + 1)

    equity = total / iterations
    return equity, math.sqrt(max(equity * (1 - equity), 1e-9) / iterations)
