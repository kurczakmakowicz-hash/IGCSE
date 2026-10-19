"""Command line: python -m poker --hand "As Kd" --board "Qh Jc 2s" --pot 100 --to-call 30"""

import argparse
import sys

from .engine import decide


def main(argv=None):
    p = argparse.ArgumentParser(prog="python -m poker",
                                description="Should you fold, check, call or raise?")
    p.add_argument("--hand", required=True, help='your two cards, e.g. "As Kd"')
    p.add_argument("--board", default="", help='community cards, e.g. "Qh Jc 2s" (empty preflop)')
    p.add_argument("--pot", type=float, required=True,
                   help="chips in the middle now, including the bet you face")
    p.add_argument("--to-call", type=float, default=0, help="chips you must add to call (0 = no bet)")
    p.add_argument("--opponents", type=int, default=1, help="players still in the hand besides you")
    p.add_argument("--stack", type=float, help="your remaining chips")
    p.add_argument("--bb", type=float, default=1, help="big blind size (default 1)")
    p.add_argument("--range", type=float, dest="opp_range",
                   help="override: opponents hold the top X of hands, 0..1")
    p.add_argument("--iterations", type=int, default=5000)
    p.add_argument("--seed", type=int)
    a = p.parse_args(argv)
    try:
        d = decide(a.hand, a.board, a.pot, a.to_call, a.opponents, a.stack,
                   a.bb, a.opp_range, a.iterations, a.seed)
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 2
    print(d)
    return 0


if __name__ == "__main__":
    sys.exit(main())
