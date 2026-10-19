"""The decision: fold, check, call or raise.

All amounts are in the same unit (chips or big blinds — your choice).
  pot      = everything in the middle right now, including any bet you face
  to_call  = what you must add to stay in (0 if nobody has bet)
"""

from dataclasses import dataclass, field

from .cards import parse_cards
from .equity import estimate_equity, hand_percentile, made_hand_percentile
from .evaluator import evaluate, describe

STREETS = {0: "preflop", 3: "flop", 4: "turn", 5: "river"}


@dataclass
class Decision:
    action: str            # FOLD, CHECK, CALL, RAISE (a bet when nobody has bet), ALL-IN
    amount: float          # chips to put in now (0 for FOLD/CHECK)
    street: str
    equity: float          # chance to win the pot at showdown, 0..1
    equity_error: float    # Monte Carlo standard error
    pot_odds: float        # equity needed to break even on a call, 0..1
    opponent_range: float  # assumed share of starting hands opponents hold
    hand: str              # what you currently have
    reasons: list = field(default_factory=list)

    def __str__(self):
        amt = f" {self.amount:g}" if self.amount else ""
        lines = [
            f"{self.action}{amt}",
            f"  Street:         {self.street}",
            f"  Your hand:      {self.hand}",
            f"  Win chance:     {self.equity:.1%} (±{2 * self.equity_error:.1%})",
            f"  Needed to call: {self.pot_odds:.1%}",
            f"  Opponent range: top {self.opponent_range:.0%} of hands",
        ]
        lines += [f"  - {r}" for r in self.reasons]
        return "\n".join(lines)


def guess_opponent_range(street, pot, to_call, big_blind):
    """How strong opponents probably are, judged by how much they bet."""
    if street == "preflop":
        bbs = to_call / big_blind
        if bbs <= 1:
            return 1.0    # nobody raised
        if bbs <= 4:
            return 0.30   # a normal open raise
        if bbs <= 12:
            return 0.12   # a 3-bet
        return 0.05       # 4-bet or shove
    if to_call <= 0:
        return 1.0
    bet_vs_pot = to_call / max(pot - to_call, 1e-9)
    if bet_vs_pot <= 0.4:
        return 0.60
    if bet_vs_pot <= 0.8:
        return 0.40
    if bet_vs_pot <= 1.2:
        return 0.25
    return 0.15


def decide(hole, board=(), pot=0.0, to_call=0.0, opponents=1, stack=None,
           big_blind=1.0, opponent_range=None, iterations=5000, seed=None):
    hole = parse_cards(hole)
    board = parse_cards(board) if board else []
    if len(hole) != 2:
        raise ValueError("You need exactly 2 hole cards")
    if len(board) not in STREETS:
        raise ValueError("Board must have 0, 3, 4 or 5 cards")
    if set(hole) & set(board):
        raise ValueError("A hole card is also on the board")
    if pot < 0 or to_call < 0:
        raise ValueError("Pot and to_call can't be negative")
    if to_call > pot:
        raise ValueError("to_call can't be bigger than the pot (the pot includes the bet you face)")

    street = STREETS[len(board)]
    if opponent_range is None:
        opponent_range = guess_opponent_range(street, pot, to_call, big_blind)

    equity, err = estimate_equity(hole, board, opponents, opponent_range, iterations, seed)
    pot_odds = to_call / (pot + to_call) if to_call else 0.0
    fair_share = 1 / (opponents + 1)
    raise_threshold = fair_share + (1 - fair_share) * 0.35

    if board:
        hand = (f"{describe(evaluate(hole + board))} "
                f"(beats {made_hand_percentile(hole, board):.0%} of possible hands right now)")
    else:
        pct = hand_percentile(*hole)
        hand = f"Starting hand in the top {max(pct, 0.01):.0%}"

    reasons = []
    if opponent_range < 1:
        if board:
            reasons.append(f"Their bet suggests one of the top {opponent_range:.0%} of hands "
                           f"on this board (made hands and draws), plus some bluffs")
        else:
            reasons.append(f"Their raise suggests a top-{opponent_range:.0%} starting hand, "
                           f"plus some bluffs")
    reasons.append(f"Against {opponents} opponent(s) an average hand wins {fair_share:.0%}; "
                   f"raising needs about {raise_threshold:.0%}")

    if to_call == 0:
        if equity >= raise_threshold:
            action = "RAISE"
            if street == "preflop":
                amount = 3 * big_blind
            elif street == "river" and equity > 0.85:
                amount = pot
            else:
                amount = round(pot * 2 / 3, 2)
            reasons.append("Strong hand and nobody has bet: bet for value")
        else:
            action, amount = "CHECK", 0.0
            reasons.append("Not strong enough to bet, and checking is free — never fold here")
    else:
        reasons.append(f"Calling {to_call:g} to win {pot:g} needs {pot_odds:.0%} equity")
        if equity < pot_odds:
            action, amount = "FOLD", 0.0
            reasons.append(f"You win {equity:.0%} but need {pot_odds:.0%}: calling loses money")
        elif equity >= raise_threshold and equity >= pot_odds + 0.15:
            action = "RAISE"
            if street == "preflop":
                amount = 3 * max(to_call, big_blind)
            else:
                amount = round(to_call + (pot + to_call) * 2 / 3, 2)
            reasons.append("Well ahead of what you need: raise to build the pot")
        else:
            action, amount = "CALL", to_call
            reasons.append("Enough equity to call, not enough to raise")
        if abs(equity - pot_odds) < 2 * err + 0.02:
            reasons.append("Close decision: equity is within a few percent of the pot odds")

    if action == "RAISE" and street == "river":
        # On the river nobody improves: a raise only makes money if you beat
        # the hands that would call it, which are stronger than the betting range.
        calling_range = min(opponent_range, 1.0) / 2
        vs_callers, _ = estimate_equity(hole, board, opponents, calling_range,
                                        iterations, seed, bluff_share=0.0)
        if vs_callers < 0.6:
            reasons.append(f"But the hands that would call a raise beat you too often "
                           f"(you win {vs_callers:.0%} against them)")
            if to_call == 0:
                action, amount = "CHECK", 0.0
                reasons.append("Check: betting only gets called by better hands")
            else:
                action, amount = "CALL", to_call
                reasons.append("Call instead: raising only gets called by better hands")
        else:
            reasons.append(f"You still win {vs_callers:.0%} against hands that would call a raise")

    if stack is not None and action in ("CALL", "RAISE") and amount >= stack:
        reasons.append(f"That uses your whole stack ({stack:g})")
        action, amount = "ALL-IN", stack

    return Decision(action, amount, street, equity, err, pot_odds,
                    opponent_range, hand, reasons)
