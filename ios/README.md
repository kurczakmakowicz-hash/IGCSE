# Saldo — home poker games tracker

An iPhone and iPad app (SwiftUI, iOS 17+) for poker nights with friends:

- **Games** (main screen). Start a game, pick the players and the buy-in. During
  the game, tap a player to add a rebuy of any size, or swipe right for a quick
  one. You can add late players. At the end, enter what everyone has. The app
  checks that the chips add up, then shows the results and **who pays whom**.
  You can share the results as text.
- **Players**. An account per person with their balance ("saldo"), games
  played, wins and losses, best and worst night, a balance-over-time chart, and
  their game history.
- **Stats**. A leaderboard table (sort by balance, wins or per game), a bar
  chart of everyone's balance, and a line chart of balances over time.
- **Advisor**. The fold / check / call / raise engine from `poker/`, rewritten in
  Swift.

Data is stored on the device with SwiftData. Nothing is sent anywhere.

## Open it on your iPad (no Mac needed)

1. Install **Swift Playgrounds** from the App Store (free).
2. Get the `Saldo.swiftpm` folder onto the iPad. For example, download the repo
   as a ZIP from GitHub in Safari, unzip it in the Files app, and move
   `ios/Saldo.swiftpm` into *iCloud Drive → Playgrounds*.
3. Open it in Swift Playgrounds and press ▶︎ to run.

On a Mac, double-click `Saldo.swiftpm` to open it in Xcode, pick an iPhone
simulator and press Run.

## Before the App Store

- Change `bundleIdentifier` in `Package.swift` (now `com.example.saldo`) to your
  own, such as `com.yourname.saldo`.
- Add an app icon: in Swift Playgrounds, open *App Settings*.
- You need an Apple Developer Program membership ($99 a year, account holder 18+).
  Then Swift Playgrounds can upload to App Store Connect: *App Settings → Upload
  to App Store Connect*. On a Mac, use Xcode's *Product → Archive*.
- Test with friends through TestFlight first.
- Expect an age rating of 17+ (simulated gambling). The Advisor is described
  as a learning aid; don't advertise it for use during online games.

## Code layout

| Folder | What's in it |
|---|---|
| `App/` | App entry and tab bar |
| `Models/` | SwiftData models: `Player`, `Game`, `GameEntry` (a player in a game), `BuyIn` |
| `Logic/Ledger.swift` | Money maths in whole cents: results, settle-up, stats, balance history |
| `Engine/PokerEngine.swift` | Swift port of the poker engine |
| `Views/` | Screens for Games, Players, Stats, Advisor |

## Tests

`tests/run.sh` compiles the engine and the ledger with `swiftc` (works on Linux
too) and runs the checks. It also compares the Swift engine against
`poker/web/engine.js`. Both use the same random-number generator, so for the
same seed they must give *identical* win chances and decisions. You need
`swiftc` and `node`.

The SwiftUI screens can only be built with Apple's tools (Xcode or Swift
Playgrounds).
