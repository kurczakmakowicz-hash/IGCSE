// Swift port of the poker engine (poker/ in Python, poker/web/engine.js in JavaScript).
// It must give the same answers: ios/tests/parity checks it against engine.js,
// including identical win chances for the same random seed.

import Foundation

struct Card: Hashable, Identifiable {
    let rank: Int  // 2...14, 14 = ace
    let suit: Int  // 0...3 = clubs, diamonds, hearts, spades

    var id: Int { (rank - 2) * 4 + suit }
    init(rank: Int, suit: Int) { self.rank = rank; self.suit = suit }
    init(id: Int) { self.init(rank: id / 4 + 2, suit: id % 4) }

    static let fullDeck: [Card] = (2...14).flatMap { r in (0..<4).map { Card(rank: r, suit: $0) } }

    var rankLabel: String { [14: "A", 13: "K", 12: "Q", 11: "J", 10: "10"][rank] ?? String(rank) }
    var suitSymbol: String { ["♣", "♦", "♥", "♠"][suit] }
    var suitName: String { ["clubs", "diamonds", "hearts", "spades"][suit] }
    var isRed: Bool { suit == 1 || suit == 2 }
    var name: String { "\(rankLabel) of \(suitName)" }
}

enum PokerEngine {
    // MARK: Hand evaluator

    static let categoryNames = ["High card", "One pair", "Two pair", "Three of a kind", "Straight",
                                "Flush", "Full house", "Four of a kind", "Straight flush"]
    static let rankNames = [2: "Twos", 3: "Threes", 4: "Fours", 5: "Fives", 6: "Sixes", 7: "Sevens",
                            8: "Eights", 9: "Nines", 10: "Tens", 11: "Jacks", 12: "Queens", 13: "Kings", 14: "Aces"]
    static let rankSingular = [2: "Two", 3: "Three", 4: "Four", 5: "Five", 6: "Six", 7: "Seven",
                               8: "Eight", 9: "Nine", 10: "Ten", 11: "Jack", 12: "Queen", 13: "King", 14: "Ace"]

    private static func straightHigh(_ maskIn: Int) -> Int {
        var mask = maskIn
        if mask & (1 << 14) != 0 { mask |= 1 << 1 }  // ace plays low in A-2-3-4-5
        for high in stride(from: 14, through: 5, by: -1) {
            let run = 0b11111 << (high - 4)
            if mask & run == run { return high }
        }
        return 0
    }

    /// Best hand from 5 to 7 cards as [category, tiebreak ranks...]. Higher is better.
    static func evaluate(_ cards: [Card]) -> [Int] {
        precondition((5...7).contains(cards.count), "Need 5 to 7 cards to evaluate")
        var bySuit: [[Int]] = [[], [], [], []]
        var counts = [Int](repeating: 0, count: 15)
        var mask = 0
        for c in cards { bySuit[c.suit].append(c.rank); counts[c.rank] += 1; mask |= 1 << c.rank }
        let flushRanks = bySuit.first { $0.count >= 5 }

        if let fr = flushRanks {
            let fm = fr.reduce(0) { $0 | (1 << $1) }
            let sf = straightHigh(fm)
            if sf != 0 { return [8, sf] }
        }

        var groups: [(count: Int, rank: Int)] = []
        for r in stride(from: 14, through: 2, by: -1) where counts[r] > 0 { groups.append((counts[r], r)) }
        groups.sort { $0.count != $1.count ? $0.count > $1.count : $0.rank > $1.rank }
        let ranksDesc = groups.map(\.rank).sorted(by: >)

        if groups[0].count == 4 {
            return [7, groups[0].rank, ranksDesc.first { $0 != groups[0].rank }!]
        }
        if groups[0].count == 3 && groups.count > 1 && groups[1].count >= 2 {
            return [6, groups[0].rank, groups[1].rank]
        }
        if let fr = flushRanks { return [5] + Array(fr.sorted(by: >).prefix(5)) }
        let st = straightHigh(mask)
        if st != 0 { return [4, st] }
        if groups[0].count == 3 {
            return [3, groups[0].rank] + Array(ranksDesc.filter { $0 != groups[0].rank }.prefix(2))
        }
        if groups[0].count == 2 && groups[1].count == 2 {
            let hi = groups[0].rank, lo = groups[1].rank
            return [2, hi, lo, ranksDesc.first { $0 != hi && $0 != lo }!]
        }
        if groups[0].count == 2 {
            return [1, groups[0].rank] + Array(ranksDesc.filter { $0 != groups[0].rank }.prefix(3))
        }
        return [0] + Array(ranksDesc.prefix(5))
    }

    /// One number per hand value, ordered the same way as the arrays.
    static func score(_ v: [Int]) -> Int {
        var n = 0
        for i in 0..<6 { n = n * 16 + (i < v.count ? v[i] : 0) }
        return n
    }

    static func strength(_ cards: [Card]) -> Int { score(evaluate(cards)) }

    static func describe(_ v: [Int]) -> String {
        let name = categoryNames[v[0]]
        switch v[0] {
        case 1, 3, 7: return "\(name), \(rankNames[v[1]]!)"
        case 2: return "\(name), \(rankNames[v[1]]!) and \(rankNames[v[2]]!)"
        case 6: return "\(name), \(rankNames[v[1]]!) full of \(rankNames[v[2]]!)"
        default: return "\(name), \(rankSingular[v[1]]!) high"
        }
    }

    // MARK: Starting hands and ranges

    private static let highCardPoints: [Int: Double] = [14: 10, 13: 8, 12: 7, 11: 6]
    private static let gapPenalty: [Int: Double] = [0: 0, 1: -1, 2: -2, 3: -4]

    /// Bill Chen's quick preflop strength score.
    static func chenScore(_ c1: Card, _ c2: Card) -> Int {
        let hi = max(c1.rank, c2.rank), lo = min(c1.rank, c2.rank)
        var s = highCardPoints[hi] ?? Double(hi) / 2
        if hi == lo { return max(Int((s * 2).rounded(.up)), 5) }
        if c1.suit == c2.suit { s += 2 }
        let gap = hi - lo - 1
        s += gapPenalty[gap] ?? -5
        if gap <= 1 && hi < 12 { s += 1 }
        return Int(s.rounded(.up))
    }

    static func combos(_ deck: [Card]) -> [(Card, Card)] {
        var out: [(Card, Card)] = []
        out.reserveCapacity(deck.count * (deck.count - 1) / 2)
        for i in 0..<deck.count { for j in (i + 1)..<deck.count { out.append((deck[i], deck[j])) } }
        return out
    }

    private static let allScores: [Int] = combos(Card.fullDeck).map { chenScore($0.0, $0.1) }.sorted(by: >)

    /// Fraction of starting hands stronger than this one (0 = best).
    static func handPercentile(_ c1: Card, _ c2: Card) -> Double {
        let s = chenScore(c1, c2)
        return Double(allScores.filter { $0 > s }.count) / Double(allScores.count)
    }

    static func hasFlushDraw(_ hole: [Card], _ board: [Card]) -> Bool {
        let cards = hole + board
        for suit in Set(hole.map(\.suit)) where cards.filter({ $0.suit == suit }).count == 4 { return true }
        return false
    }

    static func hasOpenEndedDraw(_ hole: [Card], _ board: [Card]) -> Bool {
        var ranks = Set((hole + board).map(\.rank))
        if ranks.contains(14) { ranks.insert(1) }
        var holeRanks = Set(hole.map(\.rank))
        if holeRanks.contains(14) { holeRanks.insert(1) }
        for low in 2...10 {
            let run = [low, low + 1, low + 2, low + 3]
            if run.allSatisfy(ranks.contains) && run.contains(where: holeRanks.contains)
                && !ranks.contains(low - 1) && !ranks.contains(low + 4) { return true }
        }
        return false
    }

    static let flushDrawFloor = 0.75, straightDrawFloor = 0.65, comboDrawFloor = 0.85

    static func boardStrength(_ list: [(Card, Card)], _ board: [Card]) -> [Double] {
        let values = list.map { strength([$0.0, $0.1] + board) }
        let order = values.sorted()
        let n = order.count
        var pos: [Int: (sum: Int, count: Int)] = [:]
        for (i, v) in order.enumerated() {
            let p = pos[v] ?? (0, 0)
            pos[v] = (p.sum + i, p.count + 1)
        }
        return list.enumerated().map { k, combo in
            let p = pos[values[k]]!
            var sc = Double(p.sum) / Double(p.count) / Double(max(n - 1, 1))
            if board.count < 5 {
                let hole = [combo.0, combo.1]
                let fd = hasFlushDraw(hole, board), sd = hasOpenEndedDraw(hole, board)
                if fd && sd { sc = max(sc, comboDrawFloor) }
                else if fd { sc = max(sc, flushDrawFloor) }
                else if sd { sc = max(sc, straightDrawFloor) }
            }
            return sc
        }
    }

    /// The opponent hands we think are possible: the top rangePct of combos.
    static func buildRange(dead: [Card], board: [Card], rangePct: Double) -> [(Card, Card)] {
        let deadIDs = Set(dead.map(\.id))
        let all = combos(Card.fullDeck.filter { !deadIDs.contains($0.id) })
        if rangePct >= 1 { return all }
        let scores: [Double] = board.isEmpty
            ? all.map { Double(chenScore($0.0, $0.1)) }
            : boardStrength(all, board)
        let idx = all.indices.sorted { scores[$0] != scores[$1] ? scores[$0] > scores[$1] : $0 < $1 }
        let keep = max(1, Int((rangePct * Double(all.count)).rounded(.up)))
        return idx.prefix(keep).map { all[$0] }
    }

    /// Share of possible opponent hands yours beats on this board right now.
    static func madeHandPercentile(_ hole: [Card], _ board: [Card]) -> Double {
        let known = Set((hole + board).map(\.id))
        let deck = Card.fullDeck.filter { !known.contains($0.id) }
        let mine = strength(hole + board)
        var beaten = 0, tied = 0, total = 0
        for c in combos(deck) {
            let v = strength([c.0, c.1] + board)
            total += 1
            if mine > v { beaten += 1 } else if mine == v { tied += 1 }
        }
        return (Double(beaten) + Double(tied) / 2) / Double(total)
    }

    // MARK: Equity

    /// Same generator as engine.js, so both give identical results for a seed.
    struct Mulberry32 {
        var a: UInt32
        init(seed: UInt32) { a = seed }
        mutating func next() -> Double {
            a = a &+ 0x6D2B79F5
            var t = a
            t = (t ^ (t >> 15)) &* (t | 1)
            t ^= t &+ ((t ^ (t >> 7)) &* (t | 61))
            return Double(t ^ (t >> 14)) / 4294967296
        }
    }

    static let bluffShare = 0.15

    enum EngineError: LocalizedError {
        case message(String)
        var errorDescription: String? { if case .message(let m) = self { return m }; return nil }
    }

    /// Returns (equity, standard error). Ties count as a fraction of a win.
    static func estimateEquity(hole: [Card], board: [Card], opponents: Int = 1, rangePct: Double = 1,
                               iterations: Int = 5000, seed: UInt32 = 1,
                               bluffShare bluffIn: Double = bluffShare) throws -> (Double, Double) {
        guard opponents >= 1 else { throw EngineError.message("Need at least one opponent") }
        var rng = Mulberry32(seed: seed)
        let known = hole + board
        let knownIDs = Set(known.map(\.id))
        let deck = Card.fullDeck.filter { !knownIDs.contains($0.id) }
        let needBoard = 5 - board.count
        guard deck.count >= 2 * opponents + needBoard else {
            throw EngineError.message("Not enough cards left in the deck for that many opponents")
        }
        let valueRange = buildRange(dead: known, board: board, rangePct: rangePct)
        let bluff = rangePct >= 1 ? 1 : bluffIn
        let mineBase = hole + board

        var total = 0.0
        for _ in 0..<iterations {
            var used = Set<Int>()
            var opp: [[Card]] = []
            for _ in 0..<opponents {
                var a = deck[0], b = deck[1], ok = false
                for _ in 0..<1000 {
                    if rng.next() < bluff {
                        let i = Int((rng.next() * Double(deck.count)).rounded(.down))
                        var j = Int((rng.next() * Double(deck.count - 1)).rounded(.down))
                        if j >= i { j += 1 }
                        a = deck[i]; b = deck[j]
                    } else {
                        let pick = valueRange[Int((rng.next() * Double(valueRange.count)).rounded(.down))]
                        a = pick.0; b = pick.1
                    }
                    if !used.contains(a.id) && !used.contains(b.id) { ok = true; break }
                }
                guard ok else { throw EngineError.message("Opponent range too narrow for that many opponents") }
                used.insert(a.id); used.insert(b.id)
                opp.append([a, b])
            }
            var rest = deck.filter { !used.contains($0.id) }
            var runout: [Card] = []
            for k in 0..<needBoard {
                let i = k + Int((rng.next() * Double(rest.count - k)).rounded(.down))
                rest.swapAt(k, i)
                runout.append(rest[k])
            }
            let mine = strength(mineBase + runout)
            let vals = opp.map { strength($0 + board + runout) }
            let best = vals.max()!
            if mine > best { total += 1 }
            else if mine == best { total += 1 / Double(vals.filter { $0 == mine }.count + 1) }
        }
        let eq = total / Double(iterations)
        return (eq, (max(eq * (1 - eq), 1e-9) / Double(iterations)).squareRoot())
    }

    // MARK: Decision

    enum Street: String { case preflop = "Preflop", flop = "Flop", turn = "Turn", river = "River" }

    static func street(boardCount: Int) -> Street? {
        [0: .preflop, 3: .flop, 4: .turn, 5: .river][boardCount]
    }

    static func guessOpponentRange(street: Street, pot: Double, toCall: Double, bigBlind: Double) -> Double {
        if street == .preflop {
            let bbs = toCall / bigBlind
            if bbs <= 1 { return 1.0 }
            if bbs <= 4 { return 0.30 }
            if bbs <= 12 { return 0.12 }
            return 0.05
        }
        if toCall <= 0 { return 1.0 }
        let betVsPot = toCall / max(pot - toCall, 1e-9)
        if betVsPot <= 0.4 { return 0.60 }
        if betVsPot <= 0.8 { return 0.40 }
        if betVsPot <= 1.2 { return 0.25 }
        return 0.15
    }

    enum Action: String { case fold = "FOLD", check = "CHECK", call = "CALL", raise = "RAISE", allIn = "ALL-IN" }

    struct Decision {
        var action: Action
        var amount: Double
        var street: Street
        var equity: Double
        var equityError: Double
        var potOdds: Double
        var opponentRange: Double
        var raiseLine: Double
        var hand: String
        var reasons: [String]
        /// "BET" when nobody had bet, otherwise the action name.
        var label: String { action == .raise && potOdds == 0 ? "BET" : action.rawValue }
    }

    static func pct(_ x: Double) -> String { "\(Int((x * 100).rounded()))%" }
    static func num(_ x: Double) -> String {
        let r = (x * 1_000_000).rounded() / 1_000_000
        return r == r.rounded() ? String(Int(r)) : String(r)
    }

    static func decide(hole: [Card], board: [Card] = [], pot: Double, toCall: Double = 0,
                       opponents: Int = 1, stack: Double? = nil, bigBlind: Double = 1,
                       opponentRange rangeIn: Double? = nil, iterations: Int = 5000,
                       seed: UInt32 = 1) throws -> Decision {
        guard hole.count == 2 else { throw EngineError.message("You need exactly 2 hole cards") }
        guard let street = street(boardCount: board.count) else {
            throw EngineError.message("Board must have 0, 3, 4 or 5 cards")
        }
        let ids = (hole + board).map(\.id)
        guard Set(ids).count == ids.count else { throw EngineError.message("The same card appears twice") }
        guard pot >= 0, toCall >= 0 else { throw EngineError.message("Pot and to-call can't be negative") }
        guard toCall <= pot else {
            throw EngineError.message("To-call can't be bigger than the pot (the pot includes the bet you face)")
        }

        let opponentRange = rangeIn ?? guessOpponentRange(street: street, pot: pot, toCall: toCall, bigBlind: bigBlind)
        let (equity, err) = try estimateEquity(hole: hole, board: board, opponents: opponents,
                                               rangePct: opponentRange, iterations: iterations, seed: seed)
        let potOdds = toCall > 0 ? toCall / (pot + toCall) : 0
        let fairShare = 1 / Double(opponents + 1)
        let raiseThreshold = fairShare + (1 - fairShare) * 0.35

        let hand: String
        if board.isEmpty {
            hand = "Starting hand in the top \(pct(max(handPercentile(hole[0], hole[1]), 0.01)))"
        } else {
            hand = "\(describe(evaluate(hole + board))) (beats \(pct(madeHandPercentile(hole, board))) of possible hands right now)"
        }

        var reasons: [String] = []
        if opponentRange < 1 {
            reasons.append(board.isEmpty
                ? "Their raise suggests a top-\(pct(opponentRange)) starting hand, plus some bluffs"
                : "Their bet suggests one of the top \(pct(opponentRange)) of hands on this board (made hands and draws), plus some bluffs")
        }
        reasons.append("Against \(opponents) opponent(s) an average hand wins \(pct(fairShare)); raising needs about \(pct(raiseThreshold))")

        var action: Action
        var amount: Double
        if toCall == 0 {
            if equity >= raiseThreshold {
                action = .raise
                if street == .preflop { amount = 3 * bigBlind }
                else if street == .river && equity > 0.85 { amount = pot }
                else { amount = (pot * 2 / 3 * 100).rounded() / 100 }
                reasons.append("Strong hand and nobody has bet: bet for value")
            } else {
                action = .check; amount = 0
                reasons.append("Not strong enough to bet, and checking is free — never fold here")
            }
        } else {
            reasons.append("Calling \(num(toCall)) to win \(num(pot)) needs \(pct(potOdds)) equity")
            if equity < potOdds {
                action = .fold; amount = 0
                reasons.append("You win \(pct(equity)) but need \(pct(potOdds)): calling loses money")
            } else if equity >= raiseThreshold && equity >= potOdds + 0.15 {
                action = .raise
                amount = street == .preflop ? 3 * max(toCall, bigBlind)
                    : ((toCall + (pot + toCall) * 2 / 3) * 100).rounded() / 100
                reasons.append("Well ahead of what you need: raise to build the pot")
            } else {
                action = .call; amount = toCall
                reasons.append("Enough equity to call, not enough to raise")
            }
            if abs(equity - potOdds) < 2 * err + 0.02 {
                reasons.append("Close decision: equity is within a few percent of the pot odds")
            }
        }

        if action == .raise && street == .river {
            // On the river nobody improves: a raise only makes money if you beat
            // the hands that would call it, which are stronger than the betting range.
            let (vsCallers, _) = try estimateEquity(hole: hole, board: board, opponents: opponents,
                                                    rangePct: min(opponentRange, 1) / 2,
                                                    iterations: iterations, seed: seed, bluffShare: 0)
            if vsCallers < 0.6 {
                reasons.append("But the hands that would call a raise beat you too often (you win \(pct(vsCallers)) against them)")
                if toCall == 0 {
                    action = .check; amount = 0
                    reasons.append("Check: betting only gets called by better hands")
                } else {
                    action = .call; amount = toCall
                    reasons.append("Call instead: raising only gets called by better hands")
                }
            } else {
                reasons.append("You still win \(pct(vsCallers)) against hands that would call a raise")
            }
        }

        if let stack, action == .call || action == .raise, amount >= stack {
            reasons.append("That uses your whole stack (\(num(stack)))")
            action = .allIn; amount = stack
        }

        return Decision(action: action, amount: amount, street: street, equity: equity, equityError: err,
                        potOdds: potOdds, opponentRange: opponentRange, raiseLine: raiseThreshold,
                        hand: hand, reasons: reasons)
    }
}
