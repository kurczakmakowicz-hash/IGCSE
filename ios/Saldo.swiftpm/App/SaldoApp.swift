import SwiftUI
import SwiftData

@main
struct SaldoApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
        }
        .modelContainer(for: [Player.self, Game.self, GameEntry.self, BuyIn.self])
    }
}

struct RootView: View {
    var body: some View {
        TabView {
            GamesListView()
                .tabItem { Label("Games", systemImage: "suit.spade.fill") }
            PlayersListView()
                .tabItem { Label("Players", systemImage: "person.2.fill") }
            StatsView()
                .tabItem { Label("Stats", systemImage: "chart.bar.fill") }
            AdvisorView()
                .tabItem { Label("Advisor", systemImage: "brain.head.profile") }
        }
        .tint(Theme.accent)
    }
}
