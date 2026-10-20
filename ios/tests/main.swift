// Linux-runnable checks for the app's plain-Swift code (engine + ledger).
// Run: ios/tests/run.sh   (needs swiftc and node)

import Foundation

var failures = 0
func check(_ ok: Bool, _ msg: @autoclosure () -> String, line: Int = #line) {
    if !ok { failures += 1; print("FAIL line \(line): \(msg())") }
}

// MARK: Ledger

do {
    let a = UUID(), b = UUID(), c = UUID()
    let t = Ledger.settleUp([("Ann", 50_00), ("Bob", -30_00), ("Cat", -20_00)])
    check(t == [.init(from: "Bob", to: "Ann", amount: 30_00), .init(from: "Cat", to: "Ann", amount: 20_00)], "\(t)")

    let t2 = Ledger.settleUp([("Ann", 70_00), ("Bob", 10_00), ("Cat", -45_00), ("Dan", -35_00)])
    check(t2.reduce(0) { $0 + $1.amount } == 80_00, "settle total \(t2)")
    check(t2.count <= 3, "settle count \(t2)")
    check(Ledger.settleUp([("Ann", 0)]).isEmpty, "zero")

    let d0 = Date(timeIntervalSince1970: 0), d1 = Date(timeIntervalSince1970: 86_400)
    let g1 = Ledger.GameRecord(id: UUID(), title: "1", date: d0, isFinished: true, entries: [
        .init(playerID: a, name: "Ann", buyIn: 100_00, cashOut: 180_00),
        .init(playerID: b, name: "Bob", buyIn: 150_00, cashOut: 70_00),
    ])
    let g2 = Ledger.GameRecord(id: UUID(), title: "2", date: d1, isFinished: true, entries: [
        .init(playerID: a, name: "Ann", buyIn: 50_00, cashOut: 0),
        .init(playerID: b, name: "Bob", buyIn: 50_00, cashOut: 100_00),
    ])
    let running = Ledger.GameRecord(id: UUID(), title: "3", date: d1, isFinished: false, entries: [
        .init(playerID: a, name: "Ann", buyIn: 999_00, cashOut: nil),
    ])
    check(g1.difference == 0 && g1.totalIn == 250_00, "difference")
    let s = Ledger.stats(games: [g1, g2, running], players: [(a, "Ann"), (b, "Bob"), (c, "Cat")])
    let ann = s.first { $0.id == a }!, bob = s.first { $0.id == b }!, cat = s.first { $0.id == c }!
    check(ann.net == 30_00 && ann.games == 2 && ann.wins == 1 && ann.losses == 1, "ann \(ann)")
    check(ann.biggestWin == 80_00 && ann.biggestLoss == -50_00, "ann extremes")
    check(bob.net == -30_00 && bob.average == -15_00, "bob \(bob)")
    check(cat.games == 0 && cat.net == 0, "cat")
    check(s.map(\.name) == ["Ann", "Cat", "Bob"], "order \(s.map(\.name))")
    let h = Ledger.balanceHistory(games: [g2, g1, running])
    check(h.filter { $0.playerID == a }.map(\.balance) == [0, 80_00, 30_00], "history \(h.map(\.balance))")
    check(h.filter { $0.playerID == a }.map(\.gameNumber) == [0, 1, 2], "game numbers")
    check(Ledger.cents(from: "12,50") == 1250 && Ledger.cents(from: " 7 ") == 700, "parse")
    check(Ledger.cents(from: "-3") == nil && Ledger.cents(from: "abc") == nil, "parse bad")
    check(Ledger.text(fromCents: 1250) == "12.50" && Ledger.text(fromCents: 1200) == "12", "text")
}

// MARK: Engine sanity

func cards(_ s: String) -> [Card] {
    let ranks: [Character: Int] = ["2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
                                   "T": 10, "J": 11, "Q": 12, "K": 13, "A": 14]
    let suits: [Character: Int] = ["c": 0, "d": 1, "h": 2, "s": 3]
    return s.split(separator: " ").map { Card(rank: ranks[$0.first!]!, suit: suits[$0.last!]!) }
}

do {
    check(PokerEngine.evaluate(cards("As Ks Qs Js Ts 2d 3c"))[0] == 8, "royal")
    check(PokerEngine.evaluate(cards("Kc Kd Kh 7s 7d 7c 2h")) == [6, 13, 7], "full house")
    let d = try PokerEngine.decide(hole: cards("7c 2d"), board: cards("As Kh Qd"), pot: 100, toCall: 80)
    check(d.action == .fold, "trash folds")
    let n = try PokerEngine.decide(hole: cards("As Ks"), board: cards("Qs Js Ts 2d 3c"), pot: 150, toCall: 50)
    check(n.action == .raise, "nuts raise")
}

// MARK: Parity with engine.js (input JSON on argv[1], JS output on argv[2])

if CommandLine.arguments.count >= 3 {
    struct Scenario: Decodable { let hole: [[Int]]; let board: [[Int]]; let pot: Double; let toCall: Double; let opponents: Int }
    struct Input: Decodable { let hands: [[[Int]]]; let scenarios: [Scenario]; let rangeCases: [RangeCase] }
    struct RangeCase: Decodable { let dead: [[Int]]; let board: [[Int]]; let pct: Double }
    struct JSDecision: Decodable { let action: String; let amount: Double; let equity: Double; let hand: String; let reasons: [String] }
    struct JSOut: Decodable { let evals: [[Int]]; let decisions: [JSDecision]; let ranges: [[[[Int]]]] }

    let conv = { (x: [[Int]]) in x.map { Card(rank: $0[0], suit: $0[1]) } }
    let input = try JSONDecoder().decode(Input.self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1])))
    let js = try JSONDecoder().decode(JSOut.self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[2])))

    for (h, want) in zip(input.hands, js.evals) {
        let got = PokerEngine.evaluate(conv(h))
        check(got == want, "eval \(h): \(got) vs \(want)")
    }
    for (rc, want) in zip(input.rangeCases, js.ranges) {
        let got = PokerEngine.buildRange(dead: conv(rc.dead), board: conv(rc.board), rangePct: rc.pct)
            .map { [[$0.0.rank, $0.0.suit], [$0.1.rank, $0.1.suit]] }
        check(got == want, "range \(rc.board) \(rc.pct)")
    }
    for (sc, want) in zip(input.scenarios, js.decisions) {
        let d = try PokerEngine.decide(hole: conv(sc.hole), board: conv(sc.board), pot: sc.pot,
                                       toCall: sc.toCall, opponents: sc.opponents, iterations: 4000)
        check(d.equity == want.equity, "equity \(sc.hole) \(sc.board): \(d.equity) vs \(want.equity)")
        check(d.action.rawValue == want.action && d.amount == want.amount, "action \(d.action) \(d.amount) vs \(want.action) \(want.amount)")
        check(d.hand == want.hand, "hand \(d.hand) vs \(want.hand)")
        check(d.reasons == want.reasons, "reasons \(d.reasons) vs \(want.reasons)")
    }
    print("parity: \(input.hands.count) hands, \(input.rangeCases.count) ranges, \(input.scenarios.count) decisions compared")
}

print(failures == 0 ? "ALL PASSED" : "\(failures) FAILED")
exit(failures == 0 ? 0 : 1)
