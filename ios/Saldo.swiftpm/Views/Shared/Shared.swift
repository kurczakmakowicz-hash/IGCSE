import SwiftUI

enum Theme {
    static let accent = Color(red: 0.11, green: 0.48, blue: 0.33)
    static let feltTop = Color(red: 0.16, green: 0.42, blue: 0.32)
    static let feltBottom = Color(red: 0.09, green: 0.29, blue: 0.21)
    static let win = Color(red: 0.13, green: 0.6, blue: 0.36)
    static let loss = Color(red: 0.82, green: 0.24, blue: 0.2)

    static func color(forNet cents: Int) -> Color {
        cents > 0 ? win : cents < 0 ? loss : .secondary
    }
}

enum AppSettings {
    static let currencyKey = "currencyCode"
    static let defaultBuyInKey = "defaultBuyInCents"
    static var localCurrency: String { Locale.current.currency?.identifier ?? "EUR" }
    static var defaultBuyIn: Int { UserDefaults.standard.object(forKey: defaultBuyInKey) as? Int ?? 5000 }
}

enum Money {
    static func format(_ cents: Int, code: String, signed: Bool = false) -> String {
        let text = (Decimal(cents) / 100).formatted(.currency(code: code))
        return signed && cents > 0 ? "+" + text : text
    }
}

/// An amount of money in the chosen currency. Signed amounts are green/red.
struct MoneyText: View {
    let cents: Int
    var signed = false
    @AppStorage(AppSettings.currencyKey) private var currency = AppSettings.localCurrency

    var body: some View {
        Text(Money.format(cents, code: currency, signed: signed))
            .monospacedDigit()
            .foregroundStyle(signed ? Theme.color(forNet: cents) : Color.primary)
    }
}

/// Text field for an amount of money, stored as cents. nil when empty or invalid.
struct MoneyField: View {
    let title: String
    @Binding var cents: Int?
    @State private var text = ""

    init(_ title: String, cents: Binding<Int?>) {
        self.title = title
        self._cents = cents
    }

    var body: some View {
        TextField(title, text: $text)
            .keyboardType(.decimalPad)
            .multilineTextAlignment(.trailing)
            .monospacedDigit()
            .onAppear { text = cents.map(Ledger.text(fromCents:)) ?? "" }
            .onChange(of: text) { _, new in cents = Ledger.cents(from: new) }
    }
}

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @AppStorage(AppSettings.currencyKey) private var currency = AppSettings.localCurrency
    @AppStorage(AppSettings.defaultBuyInKey) private var defaultBuyIn = 5000
    @State private var buyIn: Int? = AppSettings.defaultBuyIn

    private var currencies: [String] {
        var list = ["PLN", "EUR", "GBP", "USD", "CHF", "CZK", "SEK", "NOK", "DKK", "HUF", "CAD", "AUD"]
        if !list.contains(AppSettings.localCurrency) { list.insert(AppSettings.localCurrency, at: 0) }
        return list
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Currency", selection: $currency) {
                        ForEach(currencies, id: \.self) { code in
                            Text("\(code) · \(Money.format(1000, code: code))").tag(code)
                        }
                    }
                    HStack {
                        Text("Usual buy-in")
                        MoneyField("50", cents: $buyIn)
                    }
                } footer: {
                    Text("The usual buy-in is filled in when you start a game or add a rebuy. You can change it each time.")
                }
                Section("About") {
                    Text("Saldo keeps track of home poker games: who bought in, who rebought, what everyone left with, and who owes whom. Everything stays on this device.")
                    Text("The Advisor gives a fold, check, call or raise suggestion from your cards and the pot. It is a learning aid; don't use it during online games, where tools like this are against the rules.")
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
            .onChange(of: buyIn) { _, new in if let new, new > 0 { defaultBuyIn = new } }
        }
    }
}
