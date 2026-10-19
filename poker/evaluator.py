"""Best-hand evaluator for 5 to 7 cards.

evaluate() returns a tuple that compares correctly with < and >:
(category, tiebreak ranks...). Higher is better.
"""

from collections import Counter

HIGH_CARD, PAIR, TWO_PAIR, TRIPS, STRAIGHT, FLUSH, FULL_HOUSE, QUADS, STRAIGHT_FLUSH = range(9)

CATEGORY_NAMES = ["High card", "One pair", "Two pair", "Three of a kind", "Straight",
                  "Flush", "Full house", "Four of a kind", "Straight flush"]
RANK_NAMES = {2: "Twos", 3: "Threes", 4: "Fours", 5: "Fives", 6: "Sixes", 7: "Sevens",
              8: "Eights", 9: "Nines", 10: "Tens", 11: "Jacks", 12: "Queens",
              13: "Kings", 14: "Aces"}
RANK_SINGULAR = {2: "Two", 3: "Three", 4: "Four", 5: "Five", 6: "Six", 7: "Seven",
                 8: "Eight", 9: "Nine", 10: "Ten", 11: "Jack", 12: "Queen",
                 13: "King", 14: "Ace"}


def _straight_high(ranks):
    """Highest card of the best straight in a set of ranks, or 0."""
    if 14 in ranks:
        ranks = ranks | {1}  # ace plays low in A-2-3-4-5
    for high in range(14, 4, -1):
        if all(r in ranks for r in range(high - 4, high + 1)):
            return high
    return 0


def evaluate(cards):
    if not 5 <= len(cards) <= 7:
        raise ValueError("Need 5 to 7 cards to evaluate")

    by_suit = {}
    for r, s in cards:
        by_suit.setdefault(s, []).append(r)
    flush_ranks = next((rs for rs in by_suit.values() if len(rs) >= 5), None)

    if flush_ranks:
        sf = _straight_high(set(flush_ranks))
        if sf:
            return (STRAIGHT_FLUSH, sf)

    counts = Counter(r for r, _ in cards)
    # Groups sorted by (count, rank) descending, e.g. [(3, 13), (2, 7), (1, 14)...]
    groups = sorted(((c, r) for r, c in counts.items()), reverse=True)

    if groups[0][0] == 4:
        kicker = max(r for r in counts if r != groups[0][1])
        return (QUADS, groups[0][1], kicker)

    if groups[0][0] == 3 and len(groups) > 1 and groups[1][0] >= 2:
        return (FULL_HOUSE, groups[0][1], groups[1][1])

    if flush_ranks:
        return (FLUSH, *sorted(flush_ranks, reverse=True)[:5])

    st = _straight_high(set(counts))
    if st:
        return (STRAIGHT, st)

    if groups[0][0] == 3:
        kickers = sorted((r for r in counts if r != groups[0][1]), reverse=True)[:2]
        return (TRIPS, groups[0][1], *kickers)

    if groups[0][0] == 2 and groups[1][0] == 2:
        hi, lo = groups[0][1], groups[1][1]
        kicker = max(r for r in counts if r not in (hi, lo))
        return (TWO_PAIR, hi, lo, kicker)

    if groups[0][0] == 2:
        kickers = sorted((r for r in counts if r != groups[0][1]), reverse=True)[:3]
        return (PAIR, groups[0][1], *kickers)

    return (HIGH_CARD, *sorted(counts, reverse=True)[:5])


def describe(value):
    cat = value[0]
    name = CATEGORY_NAMES[cat]
    if cat in (PAIR, TRIPS, QUADS):
        return f"{name}, {RANK_NAMES[value[1]]}"
    if cat == TWO_PAIR:
        return f"{name}, {RANK_NAMES[value[1]]} and {RANK_NAMES[value[2]]}"
    if cat == FULL_HOUSE:
        return f"{name}, {RANK_NAMES[value[1]]} full of {RANK_NAMES[value[2]]}"
    return f"{name}, {RANK_SINGULAR[value[1]]} high"
