# Poker decision engine (Texas Hold'em)

Tells you whether to **fold, check, call or raise**, from your two cards, the
board (0, 3, 4 or 5 cards = preflop, flop, turn, river), the pot and the bet
you face. Pure Python 3, no dependencies.

```
python3 -m poker --hand "As Kd" --board "Qh Jc 2s" --pot 100 --to-call 30
python3 -m poker --hand "7c 2d" --pot 1.5 --to-call 1          # preflop
python3 -m poker --hand "Ah 5h" --board "Kh 9h 2c 3d" --pot 80 --to-call 40 --opponents 2 --stack 200
```

| Flag | Meaning |
|---|---|
| `--hand` | your two cards: `As`, `Td` / `10d`, `7c` … |
| `--board` | community cards, empty preflop |
| `--pot` | everything in the middle now, **including the bet you face** |
| `--to-call` | what you must add to stay in (0 = nobody bet) |
| `--opponents` | players still in the hand besides you |
| `--stack` | your chips left (turns big calls/raises into ALL-IN) |
| `--bb` | big blind size, used to read preflop raises (default 1) |
| `--range` | override how strong opponents are: top X of hands, 0–1 |

From Python: `from poker import decide; print(decide("As Kd", "Qh Jc 2s", pot=100, to_call=30))`

## How it decides

1. **Hand evaluator** finds your best 5 of 7 cards.
2. **Opponent range** is guessed from the bet. How wide: preflop by raise size in
   big blinds (limp = any hand, open raise = top 30%, 3-bet = top 12%, bigger =
   top 5%); after the flop by bet/pot (≤40% pot → top 60% … overbet → top 15%).
   Which hands: preflop the best starting hands; **after the flop, the hands that
   fit this board best** — every possible hand is ranked against the board, and
   flush draws / open-ended straight draws count as strong because people bet
   them. 15% of the time a bettor is bluffing with any two cards.
3. **Equity** = Monte Carlo: deal opponents hands from that range and the rest
   of the board 5,000 times, count how often you win (ties split).
4. **Pot odds** = `to_call / (pot + to_call)`: the win chance you need to break even.
5. Decision:
   - nothing to call → **RAISE** (bet ⅔ pot) if equity is well above your fair
     share, else **CHECK** (never fold for free)
   - facing a bet → **FOLD** if equity < pot odds; **RAISE** if equity is far above
     both pot odds and your fair share; otherwise **CALL**
   - on the river a raise must also win ≥60% against the hands that would *call*
     it (the top half of the betting range); if not, it checks/calls instead

## Limits — read these

- Board ranges ignore what happened earlier in the hand: a player who raised
  preflop and bets three streets is read the same as one who only bet the river.
  Gutshots and backdoor draws are not counted as draws.
- No position, no bluffing, no implied odds, no player reads. It plays an honest
  "do I have the price?" game. It will not beat good players; it will stop you
  making clearly unprofitable calls.
- Equity is a simulation: expect ±1–2% noise. Near-even spots are flagged.

Tests: `python3 -m unittest discover -s poker/tests -t .`
