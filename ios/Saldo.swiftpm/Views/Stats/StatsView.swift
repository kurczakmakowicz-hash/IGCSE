import SwiftUI
import SwiftData
import Charts

struct StatsView: View {
    @Query private var games: [Game]
    @Query(sort: \Player.name) private var players: [Player]
    @AppStorage(AppSettings.currencyKey) private var currency = AppSettings.localCurrency
    @State private var sort: SortKey = .balance

    enum SortKey: String, CaseIterable, Identifiable {
        case balance = "Balance", wins = "Wins", average = "Per game"
        var id: String { rawValue }
    }

    private var stats: [Ledger.PlayerStats] {
        let all = Ledger.stats(games: games.map(\.record), players: players.map { ($0.uid, $0.name) })
            .filter { $0.games > 0 }
        switch sort {
        case .balance: return all
        case .wins: return all.sorted { $0.wins != $1.wins ? $0.wins > $1.wins : $0.net > $1.net }
        case .average: return all.sorted { $0.average != $1.average ? $0.average > $1.average : $0.net > $1.net }
        }
    }

    var body: some View {
        NavigationStack {
            let rows = stats
            let finishedCount = games.filter(\.isFinished).count
            ScrollView {
                if rows.isEmpty {
                    ContentUnavailableView("No results yet", systemImage: "chart.bar",
                                           description: Text("Finish a game and the leaderboard and charts appear here."))
                        .padding(.top, 60)
                } else {
                    VStack(alignment: .leading, spacing: 20) {
                        highlights(rows)
                        card("Leaderboard") {
                            Picker("Sort by", selection: $sort) {
                                ForEach(SortKey.allCases) { Text($0.rawValue).tag($0) }
                            }
                            .pickerStyle(.segmented)
                            Leaderboard(rows: rows)
                        }
                        card("Balance by player") { BalanceBars(rows: rows.sorted { $0.net > $1.net }) }
                        if finishedCount > 1 {
                            card("Balance over time") { BalanceLines(games: games) }
                        }
                        Text("\(finishedCount) finished \(finishedCount == 1 ? "game" : "games"). Games in progress are not counted until they end.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                    .padding()
                    .frame(maxWidth: 900)
                    .frame(maxWidth: .infinity)
                }
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Stats")
        }
    }

    @ViewBuilder
    private func highlights(_ rows: [Ledger.PlayerStats]) -> some View {
        let top = rows.max { $0.net < $1.net }
        let mostWins = rows.max { $0.wins != $1.wins ? $0.wins < $1.wins : $0.net < $1.net }
        let bestNight = rows.max { $0.biggestWin < $1.biggestWin }
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 160), spacing: 12)], spacing: 12) {
            if let top {
                Highlight(icon: "crown.fill", tint: .yellow, title: "Biggest winner", name: top.name) {
                    MoneyText(cents: top.net, signed: true)
                }
            }
            if let mostWins, mostWins.wins > 0 {
                Highlight(icon: "trophy.fill", tint: .orange, title: "Most winning nights", name: mostWins.name) {
                    Text("\(mostWins.wins) of \(mostWins.games)")
                }
            }
            if let bestNight, bestNight.biggestWin > 0 {
                Highlight(icon: "flame.fill", tint: .red, title: "Best single night", name: bestNight.name) {
                    MoneyText(cents: bestNight.biggestWin, signed: true)
                }
            }
        }
    }

    private func card<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title).font(.headline)
            content()
        }
        .padding()
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
    }
}

struct Highlight<Value: View>: View {
    let icon: String
    let tint: Color
    let title: String
    let name: String
    @ViewBuilder var value: Value

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label(title, systemImage: icon)
                .font(.caption.weight(.semibold))
                .foregroundStyle(tint)
            Text(name).font(.title3.weight(.bold)).lineLimit(1)
            value.font(.subheadline.weight(.semibold))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
    }
}

struct Leaderboard: View {
    let rows: [Ledger.PlayerStats]

    var body: some View {
        Grid(alignment: .leading, horizontalSpacing: 10, verticalSpacing: 10) {
            GridRow {
                Text("#")
                Text("Player")
                Text("Games").gridColumnAlignment(.trailing)
                Text("Won").gridColumnAlignment(.trailing)
                Text("Per game").gridColumnAlignment(.trailing)
                Text("Balance").gridColumnAlignment(.trailing)
            }
            .font(.caption.weight(.semibold))
            .foregroundStyle(.secondary)
            Divider()
            ForEach(Array(rows.enumerated()), id: \.element.id) { i, s in
                GridRow {
                    Text("\(i + 1)").foregroundStyle(.secondary).monospacedDigit()
                    HStack(spacing: 8) {
                        Avatar(name: s.name, size: 24)
                        Text(s.name).lineLimit(1)
                    }
                    Text("\(s.games)").monospacedDigit()
                    Text("\(s.wins)").monospacedDigit()
                    MoneyText(cents: s.average, signed: true)
                    MoneyText(cents: s.net, signed: true).fontWeight(.semibold)
                }
                .font(.subheadline)
            }
        }
    }
}

struct BalanceBars: View {
    let rows: [Ledger.PlayerStats]
    @AppStorage(AppSettings.currencyKey) private var currency = AppSettings.localCurrency

    var body: some View {
        Chart(rows) { s in
            BarMark(x: .value("Balance", Double(s.net) / 100), y: .value("Player", s.name))
                .foregroundStyle(Theme.color(forNet: s.net).gradient)
                .cornerRadius(4)
                .annotation(position: s.net >= 0 ? .trailing : .leading) {
                    Text(Money.format(s.net, code: currency, signed: true))
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
        }
        .chartXAxis { AxisMarks { _ in AxisGridLine(); AxisValueLabel() } }
        .chartXScale(range: .plotDimension(padding: 40))
        .frame(height: CGFloat(rows.count) * 38 + 30)
    }
}

struct BalanceLines: View {
    let games: [Game]

    var body: some View {
        let points = Ledger.balanceHistory(games: games.map(\.record))
        Chart {
            RuleMark(y: .value("Zero", 0.0)).foregroundStyle(Color.secondary.opacity(0.4))
            ForEach(points) { p in
                LineMark(x: .value("Game", p.gameNumber), y: .value("Balance", Double(p.balance) / 100))
                    .foregroundStyle(by: .value("Player", p.name))
                    .interpolationMethod(.monotone)
                PointMark(x: .value("Game", p.gameNumber), y: .value("Balance", Double(p.balance) / 100))
                    .foregroundStyle(by: .value("Player", p.name))
                    .symbolSize(20)
            }
        }
        .chartXAxisLabel("Game number")
        .chartLegend(position: .bottom, alignment: .leading)
        .frame(height: 240)
    }
}
