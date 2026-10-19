"""Monte Carlo equity: how often your hand wins against N opponents.

Opponents' hole cards are drawn from a range: the top X% of possible hands.
Preflop that means the strongest starting hands (Chen formula); after the flop
it means the hands that fit the board best. range_pct=1.0 means any two cards.
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


def hand_percentile(c1, c2):
    """Fraction of starting hands at least as strong as this one (0.0 = best)."""
    s = chen_score(c1, c2)
    return sum(1 for x in _ALL_SCORES if x > s) / len(_ALL_SCORES)


def _has_flush_draw(hole, board):
    cards = list(hole) + list(board)
    for suit in {c[1] for c in hole}:
        if sum(1 for c in cards if c[1] == suit) == 4:
            return True
    return False


def _has_open_ended_draw(hole, board):
    ranks = {c[0] for c in list(hole) + list(board)}
    if 14 in ranks:
        ranks |= {1}
    hole_ranks = {c[0] for c in hole} | ({1} if any(c[0] == 14 for c in hole) else set())
    for low in range(2, 11):  # four in a row with room on both ends
        run = set(range(low, low + 4))
        if run <= ranks and run & hole_ranks and low - 1 not in ranks and low + 4 not in ranks:
            return True
    return False


# A drawing hand bets like a made hand at least this strong (as a percentile).
FLUSH_DRAW_FLOOR = 0.75
STRAIGHT_DRAW_FLOOR = 0.65
COMBO_DRAW_FLOOR = 0.85


def board_strength(combos, board):
    """Score each combo 0..1 by how well it fits the board right now.

    Made hands are ranked against every other possible hand on this board.
    Before the river, flush and open-ended straight draws are scored as if
    they were decent made hands, because people bet them.
    """
    values = [evaluate(list(c) + list(board)) for c in combos]
    order = sorted(values)
    n = len(order)
    pos = {}
    for i, v in enumerate(order):  # ties share their average position
        pos.setdefault(v, []).append(i)
    pct = {v: (sum(ix) / len(ix)) / max(n - 1, 1) for v, ix in pos.items()}

    scores = []
    for combo, v in zip(combos, values):
        score = pct[v]
        if len(board) < 5:
            fd = _has_flush_draw(combo, board)
            sd = _has_open_ended_draw(combo, board)
            if fd and sd:
                score = max(score, COMBO_DRAW_FLOOR)
            elif fd:
                score = max(score, FLUSH_DRAW_FLOOR)
            elif sd:
                score = max(score, STRAIGHT_DRAW_FLOOR)
        scores.append(score)
    return scores


def build_range(dead, board, range_pct):
    """The opponent hands we think are possible: the top range_pct of combos.

    Preflop, combos are ranked by starting-hand strength. After the flop they are
    ranked by how well they fit the board, so a bet on a three-heart board is
    read as flushes, sets and strong pairs, not as random high cards.
    """
    deck = [c for c in FULL_DECK if c not in dead]
    combos = list(itertools.combinations(deck, 2))
    if range_pct >= 1.0:
        return combos
    if board:
        scores = board_strength(combos, board)
    else:
        scores = [chen_score(a, b) for a, b in combos]
    ranked = [c for _, c in sorted(zip(scores, combos), key=lambda x: x[0], reverse=True)]
    keep = max(1, math.ceil(range_pct * len(ranked)))
    return ranked[:keep]


def made_hand_percentile(hole, board):
    """Share of possible opponent hands yours beats on this board right now."""
    deck = [c for c in FULL_DECK if c not in set(hole) | set(board)]
    mine = evaluate(list(hole) + list(board))
    beaten = tied = total = 0
    for combo in itertools.combinations(deck, 2):
        v = evaluate(list(combo) + list(board))
        total += 1
        if mine > v:
            beaten += 1
        elif mine == v:
            tied += 1
    return (beaten + tied / 2) / total


# Share of a betting opponent's hands that are bluffs / random holdings.
BLUFF_SHARE = 0.15


def estimate_equity(hole, board, opponents=1, range_pct=1.0, iterations=5000, seed=None,
                    bluff_share=BLUFF_SHARE):
    """Return (equity, std_error). Ties count as a fraction of a win.

    When range_pct < 1, each opponent hand comes from the top range_pct of
    hands (see build_range), except bluff_share of the time it is any hand.
    """
    if opponents < 1:
        raise ValueError("Need at least one opponent")
    rng = random.Random(seed)
    known = set(hole) | set(board)
    deck = [c for c in FULL_DECK if c not in known]
    need_board = 5 - len(board)
    if len(deck) < 2 * opponents + need_board:
        raise ValueError("Not enough cards left in the deck for that many opponents")
    value_range = build_range(known, board, range_pct)
    if range_pct >= 1.0:
        bluff_share = 1.0

    total = 0.0
    for _ in range(iterations):
        used = set()
        opp_hands = []
        for _ in range(opponents):
            for _ in range(1000):
                if rng.random() < bluff_share:
                    a, b = rng.sample(deck, 2)
                else:
                    a, b = rng.choice(value_range)
                if a not in used and b not in used:
                    break
            else:
                raise ValueError("Opponent range too narrow for that many opponents")
            used.add(a)
            used.add(b)
            opp_hands.append((a, b))
        rest = [c for c in deck if c not in used]
        full_board = list(board) + rng.sample(rest, need_board)

        mine = evaluate(list(hole) + full_board)
        opp_values = [evaluate(list(h) + full_board) for h in opp_hands]
        best_opp = max(opp_values)
        if mine > best_opp:
            total += 1.0
        elif mine == best_opp:
            total += 1.0 / (opp_values.count(mine) + 1)

    equity = total / iterations
    return equity, math.sqrt(max(equity * (1 - equity), 1e-9) / iterations)
