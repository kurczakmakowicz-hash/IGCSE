// Money maths for home games, kept free of SwiftUI/SwiftData so it can be tested anywhere.
// All amounts are whole cents (Int), so totals never drift.

import Foundation

enum Ledger {
    struct Entry {
        var playerID: UUID
        var name: String
        var buyIn: Int        // total put in: first buy-in plus every rebuy
        var cashOut: Int?     // chips counted at the end; nil while the game runs

        var net: Int? { cashOut.map { $0 - buyIn } }
    }

    struct GameRecord {
        var id: UUID
        var title: String
        var date: Date
        var isFinished: Bool
        var entries: [Entry]

        var totalIn: Int { entries.reduce(0) { $0 + $1.buyIn } }
        var totalOut: Int { entries.reduce(0) { $0 + ($1.cashOut ?? 0) } }
        /// Chips counted minus money in. 0 means the count matches.
        var difference: Int { totalOut - totalIn }
    }

    struct Transfer: Equatable {
        var from: String
        var to: String
        var amount: Int
    }

    /// Fewest simple payments that settle a game: biggest loser pays biggest winner first.
    static func settleUp(_ nets: [(name: String, net: Int)]) -> [Transfer] {
        var debtors = nets.filter { $0.net < 0 }.map { (name: $0.name, owes: -$0.net) }
            .sorted { $0.owes != $1.owes ? $0.owes > $1.owes : $0.name < $1.name }
        var creditors = nets.filter { $0.net > 0 }.map { (name: $0.name, gets: $0.net) }
            .sorted { $0.gets != $1.gets ? $0.gets > $1.gets : $0.name < $1.name }
        var out: [Transfer] = []
        var i = 0, j = 0
        while i < debtors.count && j < creditors.count {
            let amount = min(debtors[i].owes, creditors[j].gets)
            if amount > 0 { out.append(Transfer(from: debtors[i].name, to: creditors[j].name, amount: amount)) }
            debtors[i].owes -= amount
            creditors[j].gets -= amount
            if debtors[i].owes == 0 { i += 1 }
            if creditors[j].gets == 0 { j += 1 }
        }
        return out
    }

    struct PlayerStats: Identifiable {
        var id: UUID
        var name: String
        var games = 0
        var wins = 0          // finished with more than they put in
        var losses = 0        // finished with less
        var net = 0           // the saldo: total won minus total lost
        var totalBuyIn = 0
        var biggestWin = 0
        var biggestLoss = 0   // negative or 0
        var average: Int { games == 0 ? 0 : Int((Double(net) / Double(games)).rounded()) }
        var winRate: Double { games == 0 ? 0 : Double(wins) / Double(games) }
    }

    /// Stats over finished games only. Players with no finished games still appear (all zero).
    static func stats(games: [GameRecord], players: [(id: UUID, name: String)]) -> [PlayerStats] {
        var byID: [UUID: PlayerStats] = [:]
        for p in players { byID[p.id] = PlayerStats(id: p.id, name: p.name) }
        for g in games where g.isFinished {
            for e in g.entries {
                guard let net = e.net else { continue }
                var s = byID[e.playerID] ?? PlayerStats(id: e.playerID, name: e.name)
                s.games += 1
                s.net += net
                s.totalBuyIn += e.buyIn
                if net > 0 { s.wins += 1 }
                if net < 0 { s.losses += 1 }
                s.biggestWin = max(s.biggestWin, net)
                s.biggestLoss = min(s.biggestLoss, net)
                byID[e.playerID] = s
            }
        }
        return byID.values.sorted { $0.net != $1.net ? $0.net > $1.net : $0.name < $1.name }
    }

    struct BalancePoint: Identifiable {
        var id: String { "\(playerID)-\(index)" }
        var playerID: UUID
        var name: String
        var index: Int     // game number for this player, 0 = before their first game
        var gameNumber: Int // position among all finished games, 1 = oldest; start points use the game before
        var date: Date
        var balance: Int   // running saldo after this game
    }

    /// Running saldo per player after each finished game, oldest first.
    static func balanceHistory(games: [GameRecord]) -> [BalancePoint] {
        var running: [UUID: (name: String, balance: Int, count: Int)] = [:]
        var points: [BalancePoint] = []
        for (n, g) in games.filter(\.isFinished).sorted(by: { $0.date < $1.date }).enumerated() {
            for e in g.entries {
                guard let net = e.net else { continue }
                var r = running[e.playerID] ?? (e.name, 0, 0)
                if r.count == 0 {
                    points.append(BalancePoint(playerID: e.playerID, name: e.name, index: 0,
                                              gameNumber: n, date: g.date, balance: 0))
                }
                r.balance += net
                r.count += 1
                running[e.playerID] = r
                points.append(BalancePoint(playerID: e.playerID, name: e.name, index: r.count,
                                          gameNumber: n + 1, date: g.date, balance: r.balance))
            }
        }
        return points
    }

    /// Parse what someone types into a money field ("12", "12.5", "12,50") into cents.
    static func cents(from text: String) -> Int? {
        let cleaned = text.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")
        guard !cleaned.isEmpty, let value = Double(cleaned), value.isFinite, value >= 0 else { return nil }
        return Int((value * 100).rounded())
    }

    /// Cents back to an editable string: 1250 -> "12.5", 1200 -> "12".
    static func text(fromCents c: Int) -> String {
        c % 100 == 0 ? String(c / 100) : String(format: "%.2f", Double(c) / 100)
    }
}
