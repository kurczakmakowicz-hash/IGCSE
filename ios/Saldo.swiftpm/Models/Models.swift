import Foundation
import SwiftData

@Model
final class Player {
    var uid: UUID = UUID()
    var name: String = ""
    var createdAt: Date = Date()
    @Relationship(deleteRule: .cascade, inverse: \GameEntry.player)
    var entries: [GameEntry] = []

    init(name: String) {
        self.name = name
    }
}

@Model
final class Game {
    var uid: UUID = UUID()
    var title: String = ""
    var startedAt: Date = Date()
    var endedAt: Date?
    /// Default amount for a buy-in or rebuy, in cents.
    var defaultBuyIn: Int = 0
    @Relationship(deleteRule: .cascade, inverse: \GameEntry.game)
    var entries: [GameEntry] = []

    var isFinished: Bool { endedAt != nil }

    init(title: String, defaultBuyIn: Int) {
        self.title = title
        self.defaultBuyIn = defaultBuyIn
    }

    var sortedEntries: [GameEntry] {
        entries.sorted { ($0.player?.name ?? "").localizedCaseInsensitiveCompare($1.player?.name ?? "") == .orderedAscending }
    }

    var record: Ledger.GameRecord {
        Ledger.GameRecord(id: uid, title: title, date: startedAt, isFinished: isFinished,
                          entries: entries.compactMap(\.ledgerEntry))
    }
}

@Model
final class GameEntry {
    var player: Player?
    var game: Game?
    /// Chips counted at the end, in cents. nil while the game runs.
    var cashOut: Int?
    @Relationship(deleteRule: .cascade, inverse: \BuyIn.entry)
    var buyIns: [BuyIn] = []

    // Relationships are set after insert (see GameActions): linking objects before
    // they are in a context can crash SwiftData on iOS 17.
    init() {}

    var totalIn: Int { buyIns.reduce(0) { $0 + $1.amount } }
    var net: Int? { cashOut.map { $0 - totalIn } }
    var sortedBuyIns: [BuyIn] { buyIns.sorted { $0.at < $1.at } }

    var ledgerEntry: Ledger.Entry? {
        guard let player else { return nil }
        return Ledger.Entry(playerID: player.uid, name: player.name, buyIn: totalIn, cashOut: cashOut)
    }
}

@Model
final class BuyIn {
    /// Cents.
    var amount: Int = 0
    var at: Date = Date()
    var entry: GameEntry?

    init(amount: Int) {
        self.amount = amount
    }
}
