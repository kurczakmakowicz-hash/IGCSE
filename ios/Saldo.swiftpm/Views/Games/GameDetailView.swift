import SwiftUI
import SwiftData

struct GameDetailView: View {
    let game: Game
    @Environment(\.modelContext) private var context
    @AppStorage(AppSettings.currencyKey) private var currency = AppSettings.localCurrency
    @State private var rebuyFor: GameEntry?
    @State private var showingAddPlayers = false
    @State private var showingCashOut = false
    @State private var rebuyTick = 0

    private var totalIn: Int { game.entries.reduce(0) { $0 + $1.totalIn } }

    var body: some View {
        List {
            Section {
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(game.isFinished ? "Money in" : "On the table").font(.caption).foregroundStyle(.secondary)
                        MoneyText(cents: totalIn).font(.system(.largeTitle, design: .rounded, weight: .bold))
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("\(game.entries.count) players").font(.subheadline)
                        Text(game.startedAt, format: .dateTime.day().month().hour().minute())
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
            }

            if game.isFinished { results } else { running }
        }
        .navigationTitle(game.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if game.isFinished {
                ToolbarItem(placement: .primaryAction) {
                    ShareLink(item: shareText) { Label("Share results", systemImage: "square.and.arrow.up") }
                }
                ToolbarItem(placement: .secondaryAction) {
                    Button { showingCashOut = true } label: { Label("Edit results", systemImage: "pencil") }
                }
                ToolbarItem(placement: .secondaryAction) {
                    Button { game.endedAt = nil } label: { Label("Reopen game", systemImage: "arrow.uturn.backward") }
                }
            } else {
                ToolbarItem(placement: .primaryAction) {
                    Button { showingAddPlayers = true } label: { Label("Add player", systemImage: "person.badge.plus") }
                }
            }
        }
        .sheet(item: $rebuyFor) { entry in BuyInSheet(entry: entry, defaultAmount: game.defaultBuyIn) }
        .sheet(isPresented: $showingAddPlayers) { AddPlayersSheet(game: game) }
        .sheet(isPresented: $showingCashOut) { CashOutView(game: game) }
        .sensoryFeedback(.increase, trigger: rebuyTick)
    }

    // MARK: Running game

    @ViewBuilder private var running: some View {
        Section {
            ForEach(game.sortedEntries) { entry in
                Button { rebuyFor = entry } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(entry.player?.name ?? "Unknown").foregroundStyle(Color.primary)
                            Text(entry.buyIns.count == 1 ? "1 buy-in" : "\(entry.buyIns.count) buy-ins")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        MoneyText(cents: entry.totalIn)
                        Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
                    }
                }
                .swipeActions(edge: .leading) {
                    Button {
                        GameActions.addBuyIn(game.defaultBuyIn, to: entry, context: context)
                        rebuyTick += 1
                    } label: {
                        Label("Rebuy \(Money.format(game.defaultBuyIn, code: currency))", systemImage: "plus.circle")
                    }
                    .tint(Theme.accent)
                }
            }
        } header: {
            Text("Players")
        } footer: {
            Text("Tap a player to add a rebuy of any size, or swipe right for a quick \(Money.format(game.defaultBuyIn, code: currency)) rebuy.")
        }

        Section {
            Button { showingCashOut = true } label: {
                Label("End game and count chips", systemImage: "flag.checkered")
                    .frame(maxWidth: .infinity)
                    .fontWeight(.semibold)
            }
        }
    }

    // MARK: Finished game

    @ViewBuilder private var results: some View {
        let record = game.record
        let ranked = game.entries.sorted { ($0.net ?? 0) > ($1.net ?? 0) }
        Section("Results") {
            ForEach(ranked) { entry in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(entry.player?.name ?? "Unknown")
                        HStack(spacing: 4) {
                            Text("in"); MoneyText(cents: entry.totalIn)
                            Text("· out"); MoneyText(cents: entry.cashOut ?? 0)
                        }
                        .font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    MoneyText(cents: entry.net ?? 0, signed: true).font(.headline)
                }
            }
        }
        if record.difference != 0 {
            Section {
                Label {
                    Text("Chips counted were \(Money.format(abs(record.difference), code: currency)) \(record.difference > 0 ? "more" : "less") than the money put in, so the results don't add up to zero.")
                } icon: {
                    Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
                }
                .font(.callout)
            }
        }
        let transfers = Ledger.settleUp(record.entries.map { ($0.name, $0.net ?? 0) })
        Section {
            if transfers.isEmpty {
                Text("Nobody owes anything.").foregroundStyle(.secondary)
            }
            ForEach(Array(transfers.enumerated()), id: \.offset) { _, t in
                HStack {
                    Text(t.from).fontWeight(.medium)
                    Image(systemName: "arrow.right").foregroundStyle(.secondary)
                    Text(t.to).fontWeight(.medium)
                    Spacer()
                    MoneyText(cents: t.amount)
                }
            }
        } header: {
            Text("Settle up")
        } footer: {
            Text("The fewest payments that square everyone up.")
        }
    }

    private var shareText: String {
        let record = game.record
        var lines = ["\(game.title) — \(game.startedAt.formatted(date: .abbreviated, time: .omitted))"]
        for e in record.entries.sorted(by: { ($0.net ?? 0) > ($1.net ?? 0) }) {
            lines.append("\(e.name): \(Money.format(e.net ?? 0, code: currency, signed: true))")
        }
        let transfers = Ledger.settleUp(record.entries.map { ($0.name, $0.net ?? 0) })
        if !transfers.isEmpty {
            lines.append("")
            lines.append("Settle up:")
            for t in transfers { lines.append("\(t.from) → \(t.to): \(Money.format(t.amount, code: currency))") }
        }
        return lines.joined(separator: "\n")
    }
}

struct BuyInSheet: View {
    let entry: GameEntry
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var context
    @State private var amount: Int?

    init(entry: GameEntry, defaultAmount: Int) {
        self.entry = entry
        self._amount = State(initialValue: defaultAmount)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack {
                        Text("Amount")
                        MoneyField("50", cents: $amount)
                    }
                    Button {
                        if let amount, amount > 0 {
                            GameActions.addBuyIn(amount, to: entry, context: context)
                            dismiss()
                        }
                    } label: {
                        Label("Add rebuy", systemImage: "plus.circle.fill").fontWeight(.semibold)
                    }
                    .disabled((amount ?? 0) <= 0)
                } header: {
                    Text("Add money")
                }
                Section {
                    ForEach(entry.sortedBuyIns) { buy in
                        HStack {
                            Text(buy.at, format: .dateTime.hour().minute())
                                .foregroundStyle(.secondary)
                            Spacer()
                            MoneyText(cents: buy.amount)
                        }
                    }
                    .onDelete { offsets in
                        let list = entry.sortedBuyIns
                        for i in offsets { context.delete(list[i]) }
                    }
                    HStack {
                        Text("Total").fontWeight(.semibold)
                        Spacer()
                        MoneyText(cents: entry.totalIn).fontWeight(.semibold)
                    }
                } header: {
                    Text("Buy-ins so far")
                } footer: {
                    Text("Swipe left on a buy-in to remove one added by mistake.")
                }
            }
            .navigationTitle(entry.player?.name ?? "Player")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

struct AddPlayersSheet: View {
    let game: Game
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var context
    @Query(sort: \Player.name) private var players: [Player]
    @State private var buyIn: Int?
    @State private var newName = ""

    init(game: Game) {
        self.game = game
        self._buyIn = State(initialValue: game.defaultBuyIn)
    }

    private var available: [Player] {
        let inGame = Set(game.entries.compactMap { $0.player?.uid })
        return players.filter { !inGame.contains($0.uid) }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack {
                        Text("Buy-in")
                        MoneyField("50", cents: $buyIn)
                    }
                }
                Section("Tap to add") {
                    ForEach(available) { player in
                        Button { add(player) } label: {
                            Label(player.name, systemImage: "plus.circle").foregroundStyle(Color.primary)
                        }
                    }
                    HStack {
                        TextField("New player's name", text: $newName).onSubmit(addNew)
                        Button("Add", action: addNew)
                            .disabled(newName.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
            }
            .navigationTitle("Add player")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
        }
    }

    private func add(_ player: Player) {
        guard let buyIn, buyIn > 0 else { return }
        GameActions.addPlayer(player, to: game, buyIn: buyIn, context: context)
    }

    private func addNew() {
        let name = newName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return }
        if let existing = players.first(where: { $0.name.localizedCaseInsensitiveCompare(name) == .orderedSame }) {
            if available.contains(where: { $0.uid == existing.uid }) { add(existing) }
        } else {
            let player = Player(name: name)
            context.insert(player)
            add(player)
        }
        newName = ""
    }
}

struct CashOutView: View {
    let game: Game
    @Environment(\.dismiss) private var dismiss
    @AppStorage(AppSettings.currencyKey) private var currency = AppSettings.localCurrency
    @State private var counts: [UUID: Int]
    @State private var confirmMismatch = false
    @State private var finished = 0

    init(game: Game) {
        self.game = game
        var start: [UUID: Int] = [:]
        for e in game.entries { if let p = e.player, let c = e.cashOut { start[p.uid] = c } }
        self._counts = State(initialValue: start)
    }

    private var entries: [GameEntry] { game.sortedEntries }
    private var allFilled: Bool { entries.allSatisfy { e in e.player.map { counts[$0.uid] != nil } ?? true } }
    private var totalIn: Int { entries.reduce(0) { $0 + $1.totalIn } }
    private var counted: Int { entries.reduce(0) { $0 + ($1.player.flatMap { counts[$0.uid] } ?? 0) } }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    ForEach(entries) { entry in
                        if let player = entry.player {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(player.name)
                                    HStack(spacing: 4) { Text("put in"); MoneyText(cents: entry.totalIn) }
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                                MoneyField("0", cents: Binding(
                                    get: { counts[player.uid] },
                                    set: { counts[player.uid] = $0 }
                                ))
                            }
                        }
                    }
                } header: {
                    Text("What does everyone have now?")
                } footer: {
                    Text("Enter each player's chips at the end, as money. Enter 0 for anyone who lost everything.")
                }

                Section {
                    LabeledContent("Money in") { MoneyText(cents: totalIn) }
                    LabeledContent("Chips counted") { MoneyText(cents: counted) }
                    if allFilled {
                        let diff = counted - totalIn
                        if diff == 0 {
                            Label("Everything adds up", systemImage: "checkmark.seal.fill").foregroundStyle(Theme.win)
                        } else {
                            Label("\(Money.format(abs(diff), code: currency)) \(diff > 0 ? "too much" : "missing")",
                                  systemImage: "exclamationmark.triangle.fill")
                                .foregroundStyle(.orange)
                        }
                    }
                }
            }
            .navigationTitle("Count chips")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Finish") {
                        if counted != totalIn { confirmMismatch = true } else { finish() }
                    }
                    .disabled(!allFilled)
                }
            }
            .confirmationDialog("The count doesn't match", isPresented: $confirmMismatch, titleVisibility: .visible) {
                Button("Finish anyway") { finish() }
                Button("Recount", role: .cancel) {}
            } message: {
                Text("Chips counted are \(Money.format(abs(counted - totalIn), code: currency)) \(counted > totalIn ? "more" : "less") than the money put in. Results won't add up to zero.")
            }
            .sensoryFeedback(.success, trigger: finished)
        }
    }

    private func finish() {
        for e in entries { if let p = e.player { e.cashOut = counts[p.uid] } }
        if game.endedAt == nil { game.endedAt = Date() }
        finished += 1
        dismiss()
    }
}
