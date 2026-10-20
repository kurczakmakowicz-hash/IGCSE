import SwiftUI
import SwiftData
import Charts

struct PlayersListView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \Player.name) private var players: [Player]
    @Query private var games: [Game]
    @State private var showingAdd = false
    @State private var newName = ""
    @State private var cannotDelete: Player?

    private var statsByID: [UUID: Ledger.PlayerStats] {
        let all = Ledger.stats(games: games.map(\.record), players: players.map { ($0.uid, $0.name) })
        return Dictionary(uniqueKeysWithValues: all.map { ($0.id, $0) })
    }

    var body: some View {
        NavigationStack {
            let stats = statsByID
            List {
                ForEach(players) { player in
                    let s = stats[player.uid]
                    NavigationLink(value: player) {
                        HStack {
                            Avatar(name: player.name)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(player.name).font(.headline)
                                Text(gamesLabel(s?.games ?? 0)).font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            MoneyText(cents: s?.net ?? 0, signed: true).font(.headline)
                        }
                    }
                    .swipeActions {
                        Button(role: .destructive) {
                            if player.entries.isEmpty { context.delete(player) } else { cannotDelete = player }
                        } label: { Label("Delete", systemImage: "trash") }
                    }
                }
            }
            .overlay {
                if players.isEmpty {
                    ContentUnavailableView {
                        Label("No players yet", systemImage: "person.2")
                    } description: {
                        Text("Add the people you play with. You can also add them when you start a game.")
                    } actions: {
                        Button("Add player") { showingAdd = true }.buttonStyle(.borderedProminent)
                    }
                }
            }
            .navigationTitle("Players")
            .navigationDestination(for: Player.self) { PlayerDetailView(player: $0) }
            .navigationDestination(for: Game.self) { GameDetailView(game: $0) }
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { showingAdd = true } label: { Label("Add player", systemImage: "plus") }
                }
            }
            .alert("New player", isPresented: $showingAdd) {
                TextField("Name", text: $newName)
                Button("Add") { addPlayer() }
                Button("Cancel", role: .cancel) { newName = "" }
            }
            .alert("Can't delete \(cannotDelete?.name ?? "")", isPresented: Binding(
                get: { cannotDelete != nil }, set: { if !$0 { cannotDelete = nil } }
            )) {
                Button("OK", role: .cancel) {}
            } message: {
                Text("They have played in games. Deleting them would change those games' results. Delete their games first if you really want to remove them.")
            }
        }
    }

    private func gamesLabel(_ n: Int) -> String { n == 1 ? "1 game" : "\(n) games" }

    private func addPlayer() {
        let name = newName.trimmingCharacters(in: .whitespaces)
        newName = ""
        guard !name.isEmpty,
              !players.contains(where: { $0.name.localizedCaseInsensitiveCompare(name) == .orderedSame }) else { return }
        context.insert(Player(name: name))
    }
}

struct Avatar: View {
    let name: String
    var size: CGFloat = 36

    private var color: Color {
        let palette: [Color] = [.teal, .orange, .purple, .pink, .blue, .indigo, .mint, .brown, .cyan, .red]
        let sum = name.unicodeScalars.reduce(0) { $0 + Int($1.value) }
        return palette[sum % palette.count]
    }

    var body: some View {
        Text(name.prefix(1).uppercased())
            .font(.system(size: size * 0.45, weight: .bold, design: .rounded))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(color.gradient, in: Circle())
    }
}

struct PlayerDetailView: View {
    let player: Player
    @Query private var games: [Game]
    @State private var renaming = false
    @State private var newName = ""

    private var stats: Ledger.PlayerStats {
        Ledger.stats(games: games.map(\.record), players: [(player.uid, player.name)])
            .first { $0.id == player.uid } ?? Ledger.PlayerStats(id: player.uid, name: player.name)
    }

    private var history: [Ledger.BalancePoint] {
        Ledger.balanceHistory(games: games.map(\.record)).filter { $0.playerID == player.uid }
    }

    private var finishedEntries: [GameEntry] {
        player.entries.filter { $0.game?.isFinished == true }
            .sorted { ($0.game?.startedAt ?? .distantPast) > ($1.game?.startedAt ?? .distantPast) }
    }

    var body: some View {
        let s = stats
        List {
            Section {
                HStack(spacing: 14) {
                    Avatar(name: player.name, size: 56)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Balance").font(.caption).foregroundStyle(.secondary)
                        MoneyText(cents: s.net, signed: true)
                            .font(.system(.largeTitle, design: .rounded, weight: .bold))
                    }
                }
                .padding(.vertical, 4)
            }

            Section {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 140), spacing: 12)], spacing: 12) {
                    StatTile(title: "Games") { Text("\(s.games)") }
                    StatTile(title: "Won / lost") { Text("\(s.wins) / \(s.losses)") }
                    StatTile(title: "Win rate") { Text(s.winRate, format: .percent.precision(.fractionLength(0))) }
                    StatTile(title: "Average per game") { MoneyText(cents: s.average, signed: true) }
                    StatTile(title: "Biggest win") { MoneyText(cents: s.biggestWin, signed: true) }
                    StatTile(title: "Biggest loss") { MoneyText(cents: s.biggestLoss, signed: true) }
                    StatTile(title: "Total bought in") { MoneyText(cents: s.totalBuyIn) }
                }
                .padding(.vertical, 4)
            }

            if history.count > 1 {
                Section("Balance over time") {
                    Chart {
                        RuleMark(y: .value("Zero", 0.0)).foregroundStyle(Color.secondary.opacity(0.4))
                        ForEach(history) { p in
                            LineMark(x: .value("Game", p.index), y: .value("Balance", Double(p.balance) / 100))
                                .interpolationMethod(.monotone)
                                .foregroundStyle(Theme.accent)
                            PointMark(x: .value("Game", p.index), y: .value("Balance", Double(p.balance) / 100))
                                .foregroundStyle(Theme.color(forNet: p.balance))
                                .symbolSize(30)
                        }
                    }
                    .chartXAxisLabel("Game")
                    .frame(height: 200)
                    .padding(.vertical, 6)
                }
            }

            Section("Games") {
                if finishedEntries.isEmpty {
                    Text("No finished games yet.").foregroundStyle(.secondary)
                }
                ForEach(finishedEntries) { entry in
                    if let game = entry.game {
                        NavigationLink(value: game) {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(game.title)
                                    Text(game.startedAt, format: .dateTime.day().month().year())
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                MoneyText(cents: entry.net ?? 0, signed: true)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle(player.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("Rename") { newName = player.name; renaming = true }
            }
        }
        .alert("Rename player", isPresented: $renaming) {
            TextField("Name", text: $newName)
            Button("Save") {
                let name = newName.trimmingCharacters(in: .whitespaces)
                if !name.isEmpty { player.name = name }
            }
            Button("Cancel", role: .cancel) {}
        }
    }
}

struct StatTile<Value: View>: View {
    let title: String
    @ViewBuilder var value: Value

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.caption).foregroundStyle(.secondary)
            value.font(.system(.title3, design: .rounded, weight: .semibold))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
    }
}
