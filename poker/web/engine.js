// JavaScript port of the Python engine in poker/ (cards, evaluator, equity, engine).
// Keep the two in step: poker/tests/test_web_parity.py checks they agree.
(function (root) {
  "use strict";

  // A card is [rank, suit]: rank 2..14 (14 = ace), suit 0..3 = c d h s.
  const FULL_DECK = [];
  for (let r = 2; r <= 14; r++) for (let s = 0; s < 4; s++) FULL_DECK.push([r, s]);
  const cardId = (c) => (c[0] - 2) * 4 + c[1];

  // ---- evaluator ----
  const [HIGH_CARD, PAIR, TWO_PAIR, TRIPS, STRAIGHT, FLUSH, FULL_HOUSE, QUADS, STRAIGHT_FLUSH] =
    [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const CATEGORY_NAMES = ["High card", "One pair", "Two pair", "Three of a kind", "Straight",
    "Flush", "Full house", "Four of a kind", "Straight flush"];
  const RANK_NAMES = { 2: "Twos", 3: "Threes", 4: "Fours", 5: "Fives", 6: "Sixes", 7: "Sevens",
    8: "Eights", 9: "Nines", 10: "Tens", 11: "Jacks", 12: "Queens", 13: "Kings", 14: "Aces" };
  const RANK_SINGULAR = { 2: "Two", 3: "Three", 4: "Four", 5: "Five", 6: "Six", 7: "Seven",
    8: "Eight", 9: "Nine", 10: "Ten", 11: "Jack", 12: "Queen", 13: "King", 14: "Ace" };

  function straightHigh(mask) {
    if (mask & (1 << 14)) mask |= 1 << 1; // ace plays low in A-2-3-4-5
    for (let high = 14; high >= 5; high--) {
      const run = 0b11111 << (high - 4);
      if ((mask & run) === run) return high;
    }
    return 0;
  }

  // Returns an array (category, tiebreak ranks...) — compare with cmpValue.
  function evaluate(cards) {
    if (cards.length < 5 || cards.length > 7) throw new Error("Need 5 to 7 cards to evaluate");
    const bySuit = [[], [], [], []];
    const counts = new Array(15).fill(0);
    let mask = 0;
    for (const [r, s] of cards) { bySuit[s].push(r); counts[r]++; mask |= 1 << r; }
    const flushRanks = bySuit.find((rs) => rs.length >= 5) || null;

    if (flushRanks) {
      let fm = 0;
      for (const r of flushRanks) fm |= 1 << r;
      const sf = straightHigh(fm);
      if (sf) return [STRAIGHT_FLUSH, sf];
    }

    const groups = [];
    for (let r = 14; r >= 2; r--) if (counts[r]) groups.push([counts[r], r]);
    groups.sort((a, b) => b[0] - a[0] || b[1] - a[1]);
    const ranksDesc = groups.map((g) => g[1]).sort((a, b) => b - a);

    if (groups[0][0] === 4) {
      return [QUADS, groups[0][1], ranksDesc.find((r) => r !== groups[0][1])];
    }
    if (groups[0][0] === 3 && groups.length > 1 && groups[1][0] >= 2) {
      return [FULL_HOUSE, groups[0][1], groups[1][1]];
    }
    if (flushRanks) return [FLUSH, ...flushRanks.slice().sort((a, b) => b - a).slice(0, 5)];
    const st = straightHigh(mask);
    if (st) return [STRAIGHT, st];
    if (groups[0][0] === 3) {
      return [TRIPS, groups[0][1], ...ranksDesc.filter((r) => r !== groups[0][1]).slice(0, 2)];
    }
    if (groups[0][0] === 2 && groups[1][0] === 2) {
      const hi = groups[0][1], lo = groups[1][1];
      return [TWO_PAIR, hi, lo, ranksDesc.find((r) => r !== hi && r !== lo)];
    }
    if (groups[0][0] === 2) {
      return [PAIR, groups[0][1], ...ranksDesc.filter((r) => r !== groups[0][1]).slice(0, 3)];
    }
    return [HIGH_CARD, ...ranksDesc.slice(0, 5)];
  }

  // One number per hand value, ordered like the Python tuples.
  function score(v) {
    let n = 0;
    for (let i = 0; i < 6; i++) n = n * 16 + (v[i] || 0);
    return n;
  }
  const strength = (cards) => score(evaluate(cards));

  function describe(v) {
    const name = CATEGORY_NAMES[v[0]];
    if (v[0] === PAIR || v[0] === TRIPS || v[0] === QUADS) return `${name}, ${RANK_NAMES[v[1]]}`;
    if (v[0] === TWO_PAIR) return `${name}, ${RANK_NAMES[v[1]]} and ${RANK_NAMES[v[2]]}`;
    if (v[0] === FULL_HOUSE) return `${name}, ${RANK_NAMES[v[1]]} full of ${RANK_NAMES[v[2]]}`;
    return `${name}, ${RANK_SINGULAR[v[1]]} high`;
  }

  // ---- equity ----
  const HIGH_CARD_POINTS = { 14: 10, 13: 8, 12: 7, 11: 6 };
  const GAP_PENALTY = { 0: 0, 1: -1, 2: -2, 3: -4 };

  function chenScore(c1, c2) {
    const hi = Math.max(c1[0], c2[0]), lo = Math.min(c1[0], c2[0]);
    let s = HIGH_CARD_POINTS[hi] ?? hi / 2;
    if (hi === lo) return Math.max(Math.ceil(s * 2), 5);
    if (c1[1] === c2[1]) s += 2;
    const gap = hi - lo - 1;
    s += GAP_PENALTY[gap] ?? -5;
    if (gap <= 1 && hi < 12) s += 1;
    return Math.ceil(s);
  }

  function combos(deck) {
    const out = [];
    for (let i = 0; i < deck.length; i++)
      for (let j = i + 1; j < deck.length; j++) out.push([deck[i], deck[j]]);
    return out;
  }

  const ALL_SCORES = combos(FULL_DECK).map(([a, b]) => chenScore(a, b)).sort((a, b) => b - a);

  function handPercentile(c1, c2) {
    const s = chenScore(c1, c2);
    return ALL_SCORES.filter((x) => x > s).length / ALL_SCORES.length;
  }

  function hasFlushDraw(hole, board) {
    const cards = hole.concat(board);
    for (const suit of new Set(hole.map((c) => c[1]))) {
      if (cards.filter((c) => c[1] === suit).length === 4) return true;
    }
    return false;
  }

  function hasOpenEndedDraw(hole, board) {
    const ranks = new Set(hole.concat(board).map((c) => c[0]));
    if (ranks.has(14)) ranks.add(1);
    const holeRanks = new Set(hole.map((c) => c[0]));
    if (holeRanks.has(14)) holeRanks.add(1);
    for (let low = 2; low <= 10; low++) {
      const run = [low, low + 1, low + 2, low + 3];
      if (run.every((r) => ranks.has(r)) && run.some((r) => holeRanks.has(r)) &&
          !ranks.has(low - 1) && !ranks.has(low + 4)) return true;
    }
    return false;
  }

  const FLUSH_DRAW_FLOOR = 0.75, STRAIGHT_DRAW_FLOOR = 0.65, COMBO_DRAW_FLOOR = 0.85;

  function boardStrength(list, board) {
    const values = list.map((c) => strength(c.concat(board)));
    const order = values.slice().sort((a, b) => a - b);
    const n = order.length;
    const pos = new Map();
    order.forEach((v, i) => {
      const p = pos.get(v);
      if (p) { p[0] += i; p[1]++; } else pos.set(v, [i, 1]);
    });
    return list.map((combo, k) => {
      const [sum, cnt] = pos.get(values[k]);
      let sc = sum / cnt / Math.max(n - 1, 1);
      if (board.length < 5) {
        const fd = hasFlushDraw(combo, board), sd = hasOpenEndedDraw(combo, board);
        if (fd && sd) sc = Math.max(sc, COMBO_DRAW_FLOOR);
        else if (fd) sc = Math.max(sc, FLUSH_DRAW_FLOOR);
        else if (sd) sc = Math.max(sc, STRAIGHT_DRAW_FLOOR);
      }
      return sc;
    });
  }

  function buildRange(dead, board, rangePct) {
    const deadIds = new Set(dead.map(cardId));
    const all = combos(FULL_DECK.filter((c) => !deadIds.has(cardId(c))));
    if (rangePct >= 1) return all;
    const scores = board.length ? boardStrength(all, board) : all.map(([a, b]) => chenScore(a, b));
    const idx = all.map((_, i) => i).sort((a, b) => scores[b] - scores[a]); // stable
    const keep = Math.max(1, Math.ceil(rangePct * all.length));
    return idx.slice(0, keep).map((i) => all[i]);
  }

  function madeHandPercentile(hole, board) {
    const known = new Set(hole.concat(board).map(cardId));
    const deck = FULL_DECK.filter((c) => !known.has(cardId(c)));
    const mine = strength(hole.concat(board));
    let beaten = 0, tied = 0, total = 0;
    for (const combo of combos(deck)) {
      const v = strength(combo.concat(board));
      total++;
      if (mine > v) beaten++; else if (mine === v) tied++;
    }
    return (beaten + tied / 2) / total;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const BLUFF_SHARE = 0.15;

  function estimateEquity(hole, board, opponents = 1, rangePct = 1, iterations = 5000,
                          seed = 1, bluffShare = BLUFF_SHARE) {
    if (opponents < 1) throw new Error("Need at least one opponent");
    const rand = mulberry32(seed);
    const known = hole.concat(board);
    const knownIds = new Set(known.map(cardId));
    const deck = FULL_DECK.filter((c) => !knownIds.has(cardId(c)));
    const needBoard = 5 - board.length;
    if (deck.length < 2 * opponents + needBoard)
      throw new Error("Not enough cards left in the deck for that many opponents");
    const valueRange = buildRange(known, board, rangePct);
    if (rangePct >= 1) bluffShare = 1;
    const mineBase = hole.concat(board);

    let total = 0;
    for (let it = 0; it < iterations; it++) {
      const used = new Set();
      const opp = [];
      for (let o = 0; o < opponents; o++) {
        let a, b, ok = false;
        for (let attempt = 0; attempt < 1000; attempt++) {
          if (rand() < bluffShare) {
            const i = Math.floor(rand() * deck.length);
            let j = Math.floor(rand() * (deck.length - 1));
            if (j >= i) j++;
            a = deck[i]; b = deck[j];
          } else {
            [a, b] = valueRange[Math.floor(rand() * valueRange.length)];
          }
          if (!used.has(cardId(a)) && !used.has(cardId(b))) { ok = true; break; }
        }
        if (!ok) throw new Error("Opponent range too narrow for that many opponents");
        used.add(cardId(a)); used.add(cardId(b));
        opp.push([a, b]);
      }
      const rest = deck.filter((c) => !used.has(cardId(c)));
      const runout = [];
      for (let k = 0; k < needBoard; k++) {
        const i = k + Math.floor(rand() * (rest.length - k));
        [rest[k], rest[i]] = [rest[i], rest[k]];
        runout.push(rest[k]);
      }
      const mine = strength(mineBase.concat(runout));
      const vals = opp.map((h) => strength(h.concat(board, runout)));
      const best = Math.max(...vals);
      if (mine > best) total += 1;
      else if (mine === best) total += 1 / (vals.filter((v) => v === mine).length + 1);
    }
    const eq = total / iterations;
    return [eq, Math.sqrt(Math.max(eq * (1 - eq), 1e-9) / iterations)];
  }

  // ---- engine ----
  const STREETS = { 0: "preflop", 3: "flop", 4: "turn", 5: "river" };
  const pct0 = (x) => `${Math.round(x * 100)}%`;
  const g = (x) => String(+x.toFixed(6));

  function guessOpponentRange(street, pot, toCall, bigBlind) {
    if (street === "preflop") {
      const bbs = toCall / bigBlind;
      if (bbs <= 1) return 1.0;
      if (bbs <= 4) return 0.30;
      if (bbs <= 12) return 0.12;
      return 0.05;
    }
    if (toCall <= 0) return 1.0;
    const betVsPot = toCall / Math.max(pot - toCall, 1e-9);
    if (betVsPot <= 0.4) return 0.60;
    if (betVsPot <= 0.8) return 0.40;
    if (betVsPot <= 1.2) return 0.25;
    return 0.15;
  }

  function decide({ hole, board = [], pot = 0, toCall = 0, opponents = 1, stack = null,
                    bigBlind = 1, opponentRange = null, iterations = 5000, seed = 1 }) {
    if (hole.length !== 2) throw new Error("You need exactly 2 hole cards");
    if (!(board.length in STREETS)) throw new Error("Board must have 0, 3, 4 or 5 cards");
    const ids = hole.concat(board).map(cardId);
    if (new Set(ids).size !== ids.length) throw new Error("The same card appears twice");
    if (pot < 0 || toCall < 0) throw new Error("Pot and to-call can't be negative");
    if (toCall > pot) throw new Error("To-call can't be bigger than the pot (the pot includes the bet you face)");

    const street = STREETS[board.length];
    if (opponentRange == null) opponentRange = guessOpponentRange(street, pot, toCall, bigBlind);

    const [equity, err] = estimateEquity(hole, board, opponents, opponentRange, iterations, seed);
    const potOdds = toCall ? toCall / (pot + toCall) : 0;
    const fairShare = 1 / (opponents + 1);
    const raiseThreshold = fairShare + (1 - fairShare) * 0.35;

    let hand;
    if (board.length) {
      hand = `${describe(evaluate(hole.concat(board)))} ` +
        `(beats ${pct0(madeHandPercentile(hole, board))} of possible hands right now)`;
    } else {
      hand = `Starting hand in the top ${pct0(Math.max(handPercentile(hole[0], hole[1]), 0.01))}`;
    }

    const reasons = [];
    if (opponentRange < 1) {
      reasons.push(board.length
        ? `Their bet suggests one of the top ${pct0(opponentRange)} of hands on this board (made hands and draws), plus some bluffs`
        : `Their raise suggests a top-${pct0(opponentRange)} starting hand, plus some bluffs`);
    }
    reasons.push(`Against ${opponents} opponent(s) an average hand wins ${pct0(fairShare)}; raising needs about ${pct0(raiseThreshold)}`);

    let action, amount;
    if (toCall === 0) {
      if (equity >= raiseThreshold) {
        action = "RAISE";
        if (street === "preflop") amount = 3 * bigBlind;
        else if (street === "river" && equity > 0.85) amount = pot;
        else amount = Math.round(pot * 2 / 3 * 100) / 100;
        reasons.push("Strong hand and nobody has bet: bet for value");
      } else {
        action = "CHECK"; amount = 0;
        reasons.push("Not strong enough to bet, and checking is free — never fold here");
      }
    } else {
      reasons.push(`Calling ${g(toCall)} to win ${g(pot)} needs ${pct0(potOdds)} equity`);
      if (equity < potOdds) {
        action = "FOLD"; amount = 0;
        reasons.push(`You win ${pct0(equity)} but need ${pct0(potOdds)}: calling loses money`);
      } else if (equity >= raiseThreshold && equity >= potOdds + 0.15) {
        action = "RAISE";
        amount = street === "preflop" ? 3 * Math.max(toCall, bigBlind)
          : Math.round((toCall + (pot + toCall) * 2 / 3) * 100) / 100;
        reasons.push("Well ahead of what you need: raise to build the pot");
      } else {
        action = "CALL"; amount = toCall;
        reasons.push("Enough equity to call, not enough to raise");
      }
      if (Math.abs(equity - potOdds) < 2 * err + 0.02) {
        reasons.push("Close decision: equity is within a few percent of the pot odds");
      }
    }

    if (action === "RAISE" && street === "river") {
      // On the river nobody improves: a raise only makes money if you beat
      // the hands that would call it, which are stronger than the betting range.
      const [vsCallers] = estimateEquity(hole, board, opponents, Math.min(opponentRange, 1) / 2,
        iterations, seed, 0);
      if (vsCallers < 0.6) {
        reasons.push(`But the hands that would call a raise beat you too often (you win ${pct0(vsCallers)} against them)`);
        if (toCall === 0) {
          action = "CHECK"; amount = 0;
          reasons.push("Check: betting only gets called by better hands");
        } else {
          action = "CALL"; amount = toCall;
          reasons.push("Call instead: raising only gets called by better hands");
        }
      } else {
        reasons.push(`You still win ${pct0(vsCallers)} against hands that would call a raise`);
      }
    }

    if (stack != null && (action === "CALL" || action === "RAISE") && amount >= stack) {
      reasons.push(`That uses your whole stack (${g(stack)})`);
      action = "ALL-IN"; amount = stack;
    }

    return { action, amount, street, equity, equityError: err, potOdds, opponentRange, hand, reasons };
  }

  const api = { FULL_DECK, cardId, evaluate, describe, chenScore, handPercentile, hasFlushDraw,
    hasOpenEndedDraw, buildRange, madeHandPercentile, estimateEquity, guessOpponentRange, decide };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PokerEngine = api;
})(this);
