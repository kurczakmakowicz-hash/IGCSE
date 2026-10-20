import SwiftUI
import SwiftData

struct GamesListView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \Game.startedAt, order: .reverse) private var games: [Game]
    @State private var path: [Game] = []
    @State private var showingNew = false
    @State private var showingSettings = false
    @State private var pendingDelete: Game?

    var body: some View {
        NavigationStack(path: $path) {
            List {
                let running = games.filter { !$0.isFinished }
                let finished = games.filter(\.isFinished)
                if !running.isEmpty {
                    Section("In progress") {
                        ForEach(running) { game in
                            NavigationLink(value: game) { GameRow(game: game) }
                                .swipeActions {
                                    Button(role: .destructive) { pendingDelete = game } label: {
                                        Label("Delete", systemImage: "trash")
                                    }
                                }
                        }
                    }
                }
                if !finished.isEmpty {
                    Section("Finished") {
                        ForEach(finished) { game in
                            NavigationLink(value: game) { GameRow(game: game) }
                                .swipeActions {
                                    Button(role: .destructive) { pendingDelete = game } label: {
                                        Label("Delete", systemImage: "trash")
                                    }
                                }
                        }
                    }
                }
            }
            .overlay {
                if games.isEmpty {
                    ContentUnavailableView {
                        Label("No games yet", systemImage: "suit.spade")
                    } description: {
                        Text("Start a game to track buy-ins, rebuys and who ends up ahead.")
                    } actions: {
                        Button("Start a game") { showingNew = true }
                            .buttonStyle(.borderedProminent)
                    }
                }
            }
            .navigationTitle("Games")
            .navigationDestination(for: Game.self) { GameDetailView(game: $0) }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { showingSettings = true } label: { Label("Settings", systemImage: "gearshape") }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button { showingNew = true } label: { Label("New game", systemImage: "plus") }
                }
            }
            .sheet(isPresented: $showingNew) {
                NewGameView { game in path.append(game) }
            }
            .sheet(isPresented: $showingSettings) { SettingsView() }
            .confirmationDialog("Delete this game?", isPresented: Binding(
                get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }
            ), titleVisibility: .visible) {
                Button("Delete game", role: .destructive) {
                    if let game = pendingDelete { context.delete(game) }
                    pendingDelete = nil
                }
            } message: {
                Text(pendingDelete?.isFinished == true
                     ? "Its results are removed from every player's balance and stats."
                     : "The game and its buy-ins are removed.")
            }
        }
    }
}

struct GameRow: View {
    let game: Game

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(game.title).font(.headline)
                Spacer()
                MoneyText(cents: game.entries.reduce(0) { $0 + $1.totalIn })
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            HStack(spacing: 6) {
                Text(game.startedAt, format: .dateTime.day().month().year())
                Text("·")
                Text("\(game.entries.count) players")
                if let best = game.entries.filter({ ($0.net ?? 0) > 0 }).max(by: { ($0.net ?? 0) < ($1.net ?? 0) }),
                   game.isFinished, let net = best.net {
                    Text("·")
                    Image(systemName: "crown.fill").foregroundStyle(.yellow)
                    Text(best.player?.name ?? "")
                    MoneyText(cents: net, signed: true)
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }
}

struct NewGameView: View {
    var onCreate: (Game) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var context
    @Query(sort: \Player.name) private var players: [Player]
    @State private var title = "Poker night, " + Date().formatted(.dateTime.day().month(.abbreviated))
    @State private var buyIn: Int? = AppSettings.defaultBuyIn
    @State private var selected: Set<UUID> = []
    @State private var newName = ""

    private var canStart: Bool { selected.count >= 2 && (buyIn ?? 0) > 0 }

    var body: some View {
        NavigationStack {
            Form {
                Section("Game") {
                    TextField("Name", text: $title)
                    HStack {
                        Text("Buy-in per player")
                        MoneyField("50", cents: $buyIn)
                    }
                }
                Section {
                    ForEach(players) { player in
                        Button {
                            if selected.contains(player.uid) { selected.remove(player.uid) } else { selected.insert(player.uid) }
                        } label: {
                            HStack {
                                Text(player.name).foregroundStyle(Color.primary)
                                Spacer()
                                Image(systemName: selected.contains(player.uid) ? "checkmark.circle.fill" : "circle")
                                    .foregroundStyle(selected.contains(player.uid) ? Theme.accent : Color.secondary)
                                    .font(.title3)
                            }
                        }
                    }
                    HStack {
                        TextField("New player's name", text: $newName)
                            .onSubmit(addPlayer)
                        Button("Add", action: addPlayer)
                            .disabled(newName.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                } header: {
                    Text("Who's playing (\(selected.count))")
                } footer: {
                    Text("Everyone starts with one buy-in. Add rebuys and late players during the game.")
                }
            }
            .navigationTitle("New game")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Start", action: start).disabled(!canStart)
                }
            }
        }
    }

    private func addPlayer() {
        let name = newName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return }
        if let existing = players.first(where: { $0.name.localizedCaseInsensitiveCompare(name) == .orderedSame }) {
            selected.insert(existing.uid)
        } else {
            let player = Player(name: name)
            context.insert(player)
            selected.insert(player.uid)
        }
        newName = ""
    }

    private func start() {
        guard let buyIn, buyIn > 0 else { return }
        let game = Game(title: title.trimmingCharacters(in: .whitespaces).isEmpty ? "Poker night" : title,
                        defaultBuyIn: buyIn)
        context.insert(game)
        for player in players where selected.contains(player.uid) {
            GameActions.addPlayer(player, to: game, buyIn: buyIn, context: context)
        }
        try? context.save()
        dismiss()
        onCreate(game)
    }
}

enum GameActions {
    static func addPlayer(_ player: Player, to game: Game, buyIn: Int, context: ModelContext) {
        let entry = GameEntry()
        context.insert(entry)
        entry.player = player
        entry.game = game
        addBuyIn(buyIn, to: entry, context: context)
    }

    static func addBuyIn(_ amount: Int, to entry: GameEntry, context: ModelContext) {
        let buy = BuyIn(amount: amount)
        context.insert(buy)
        buy.entry = entry
    }
}
