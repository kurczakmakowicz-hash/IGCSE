import SwiftUI

struct AdvisorView: View {
    @Environment(\.horizontalSizeClass) private var sizeClass
    // 7 spots: 0-1 your hand, 2-6 the board. Starts on an example hand.
    @State private var spots: [Card?] = [Card(rank: 14, suit: 3), Card(rank: 13, suit: 1),
                                         Card(rank: 12, suit: 2), Card(rank: 11, suit: 0), Card(rank: 2, suit: 3), nil, nil]
    @State private var active: Int? = 5
    @State private var potText = "100"
    @State private var toCallText = "30"
    @State private var stackText = ""
    @State private var bigBlindText = "1"
    @State private var opponents = 1
    @State private var outcome: Outcome = .message("Working it out…")

    enum Outcome {
        case decision(PokerEngine.Decision, toCall: Double)
        case message(String)
    }

    private var inputsKey: String {
        spots.map { $0.map { String($0.id) } ?? "-" }.joined(separator: ",")
            + "|\(potText)|\(toCallText)|\(stackText)|\(bigBlindText)|\(opponents)"
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                Group {
                    if sizeClass == .regular {
                        HStack(alignment: .top, spacing: 20) {
                            VStack(spacing: 20) { table; deck }
                            VStack(spacing: 20) { verdict; numbers; note }
                        }
                    } else {
                        VStack(spacing: 16) { table; deck; verdict; numbers; note }
                    }
                }
                .padding()
                .frame(maxWidth: 1100)
                .frame(maxWidth: .infinity)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Advisor")
            .scrollDismissesKeyboard(.interactively)
            .task(id: inputsKey) { await recompute() }
        }
    }

    // MARK: Table

    private var street: String {
        let n = spots[2...].compactMap { $0 }.count
        return PokerEngine.street(boardCount: n)?.rawValue ?? "\(n) board cards"
    }

    private var tip: String {
        guard let active else { return "All cards placed. Tap any card to change it." }
        if active < 2 { return "Pick your card from the deck." }
        let name = active < 5 ? "flop" : active == 5 ? "turn" : "river"
        return "Pick the \(name) card, or leave the board empty for preflop."
    }

    private var table: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text(street.uppercased())
                    .font(.caption.weight(.bold)).tracking(1)
                    .padding(.horizontal, 10).padding(.vertical, 3)
                    .overlay(Capsule().stroke(.white.opacity(0.5)))
                Spacer()
                if case .decision(let d, _) = outcome, sizeClass != .regular {
                    Text(d.label + (d.amount > 0 ? " \(PokerEngine.num(d.amount))" : ""))
                        .font(.headline.weight(.heavy))
                        .foregroundStyle(color(for: d.action))
                        .padding(.horizontal, 10).padding(.vertical, 3)
                        .background(.white, in: RoundedRectangle(cornerRadius: 8))
                }
            }
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .bottom, spacing: 24) { handGroup; boardGroup }
                VStack(alignment: .leading, spacing: 14) { handGroup; boardGroup }
            }
            Text(tip).font(.callout).foregroundStyle(.white.opacity(0.85))
            HStack {
                Button("New hand") { spots = Array(repeating: nil, count: 7); active = 0 }
                Button("Clear board") {
                    for i in 2..<7 { spots[i] = nil }
                    active = spots[0] == nil ? 0 : spots[1] == nil ? 1 : 2
                }
            }
            .buttonStyle(.bordered)
            .tint(.white)
        }
        .foregroundStyle(.white)
        .padding(18)
        .background(
            RoundedRectangle(cornerRadius: 26)
                .fill(LinearGradient(colors: [Theme.feltTop, Theme.feltBottom], startPoint: .top, endPoint: .bottom))
        )
        .overlay(RoundedRectangle(cornerRadius: 26).stroke(Theme.feltBottom.opacity(0.9), lineWidth: 5))
    }

    private var handGroup: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("YOUR HAND").font(.caption.weight(.semibold)).tracking(1).opacity(0.8)
            HStack(spacing: 8) { slot(0, "card"); slot(1, "card") }
        }
    }

    private var boardGroup: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("BOARD").font(.caption.weight(.semibold)).tracking(1).opacity(0.8)
            HStack(spacing: 8) {
                slot(2, "flop"); slot(3, "flop"); slot(4, "flop")
                slot(5, "turn").padding(.leading, 4)
                slot(6, "river").padding(.leading, 4)
            }
        }
    }

    private func slot(_ i: Int, _ hint: String) -> some View {
        let width: CGFloat = sizeClass == .regular ? 58 : 46
        return Button {
            if spots[i] != nil { spots[i] = nil }
            active = i
        } label: {
            ZStack {
                if let card = spots[i] {
                    RoundedRectangle(cornerRadius: 7).fill(.white)
                    CardFace(card: card, size: width)
                } else {
                    RoundedRectangle(cornerRadius: 7)
                        .strokeBorder(.white.opacity(0.5), style: StrokeStyle(lineWidth: 1.5, dash: [5, 4]))
                    Text(hint.uppercased()).font(.system(size: 9, weight: .semibold)).opacity(0.7)
                }
            }
            .frame(width: width, height: width * 1.4)
            .overlay {
                if active == i {
                    RoundedRectangle(cornerRadius: 9).stroke(Color.yellow, lineWidth: 3).padding(-4)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(spots[i].map { "\($0.name), tap to remove" } ?? "Empty \(hint) spot")
    }

    // MARK: Deck

    private var deck: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Tap a card to place it. Tap a placed card to take it back.")
                .font(.footnote).foregroundStyle(.secondary)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 13), spacing: 4) {
                ForEach([3, 2, 1, 0], id: \.self) { suit in
                    ForEach(Array(stride(from: 14, through: 2, by: -1)), id: \.self) { rank in
                        deckCard(Card(rank: rank, suit: suit))
                    }
                }
            }
        }
        .padding()
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
    }

    private func deckCard(_ card: Card) -> some View {
        let at = spots.firstIndex(of: card)
        return Button { pick(card) } label: {
            CardFace(card: card, size: 30)
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(Color.white, in: RoundedRectangle(cornerRadius: 6))
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(at.map { $0 < 2 } == true ? Color.yellow : Color.gray.opacity(0.3),
                                                                  lineWidth: at.map { $0 < 2 } == true ? 2 : 1))
                .opacity(at == nil || at! < 2 ? 1 : 0.3)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(card.name + (at == nil ? "" : ", in use"))
    }

    private func pick(_ card: Card) {
        if let at = spots.firstIndex(of: card) {
            spots[at] = nil
            active = at
            return
        }
        if active == nil || spots[active!] != nil { active = nextEmpty(from: 0) }
        guard let slot = active else { return }
        spots[slot] = card
        active = nextEmpty(from: slot)
    }

    private func nextEmpty(from start: Int) -> Int? {
        (0..<7).map { (start + $0) % 7 }.first { spots[$0] == nil }
    }

    // MARK: Numbers

    private var numbers: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Pot and bet").font(.headline)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 140), spacing: 12, alignment: .top)], spacing: 12) {
                numberField("Pot", "All chips in the middle, including the bet you face", $potText)
                numberField("To call", "0 if nobody has bet", $toCallText)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Opponents").font(.subheadline.weight(.semibold))
                    Stepper("\(opponents)", value: $opponents, in: 1...8)
                        .monospacedDigit()
                    Text("Players still in the hand besides you").font(.caption).foregroundStyle(.secondary)
                }
                numberField("Your stack", "Optional: chips you have left", $stackText)
                numberField("Big blind", "Used to read preflop raises", $bigBlindText)
            }
            Text("Bet you face, as a share of the pot before it:").font(.caption).foregroundStyle(.secondary)
            HStack {
                ForEach([("No bet", 0.0), ("⅓", 1.0 / 3), ("½", 0.5), ("¾", 0.75), ("Pot", 1.0)], id: \.0) { label, f in
                    Button(label) { quickBet(f) }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                }
            }
        }
        .padding()
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
    }

    private func numberField(_ title: String, _ help: String, _ text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.subheadline.weight(.semibold))
            TextField("0", text: text)
                .keyboardType(.decimalPad)
                .monospacedDigit()
                .padding(8)
                .background(Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 8))
            Text(help).font(.caption).foregroundStyle(.secondary)
        }
    }

    private func value(_ text: String) -> Double? {
        Double(text.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: "."))
    }

    private func quickBet(_ fraction: Double) {
        let pot = value(potText) ?? 0, toCall = value(toCallText) ?? 0
        let before = max(pot - toCall, 0) > 0 ? pot - toCall : pot
        let bet = (before * fraction * 100).rounded() / 100
        toCallText = PokerEngine.num(bet)
        potText = PokerEngine.num(((before + bet) * 100).rounded() / 100)
    }

    // MARK: Verdict

    private func color(for action: PokerEngine.Action) -> Color {
        switch action {
        case .fold: return Theme.loss
        case .call: return .blue
        case .raise, .allIn: return Theme.win
        case .check: return .gray
        }
    }

    @ViewBuilder private var verdict: some View {
        Group {
            switch outcome {
            case .message(let text):
                Text(text).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading)
            case .decision(let d, let toCall):
                VStack(alignment: .leading, spacing: 14) {
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Text(d.label)
                            .font(.system(size: 48, weight: .heavy, design: .rounded))
                            .foregroundStyle(color(for: d.action))
                        if d.amount > 0 {
                            Text("put in \(PokerEngine.num(d.amount))")
                                .font(.title3.monospacedDigit()).foregroundStyle(.secondary)
                        }
                    }
                    Text(d.hand).font(.headline)
                    Meter(decision: d, showNeeded: toCall > 0, tint: color(for: d.action))
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(d.reasons, id: \.self) { r in
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                Text("•").foregroundStyle(.secondary)
                                Text(r)
                            }
                            .font(.subheadline)
                        }
                    }
                }
            }
        }
        .padding()
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
        .overlay {
            if case .decision(let d, _) = outcome {
                RoundedRectangle(cornerRadius: 14).stroke(color(for: d.action), lineWidth: 2)
            }
        }
        .animation(.easeOut(duration: 0.2), value: inputsKey)
    }

    private var note: some View {
        Text("This plays a \"do I have the price?\" game: it doesn't use your seat, bluffs, player reads, or what happened earlier in the hand. It's a learning aid. Don't use it during online games, where tools like this are against the rules. Win chances come from 10,000 simulated deals, so expect about ±1% noise.")
            .font(.footnote).foregroundStyle(.secondary)
    }

    // MARK: Compute

    @MainActor private func recompute() async {
        try? await Task.sleep(for: .milliseconds(150))
        if Task.isCancelled { return }
        let hole = spots[0..<2].compactMap { $0 }
        let board = spots[2...].compactMap { $0 }
        if hole.count < 2 { outcome = .message("Pick your two cards to get a call."); return }
        if board.count == 1 || board.count == 2 {
            outcome = .message("The flop is three cards: add \(3 - board.count) more, or clear the board for preflop.")
            return
        }
        guard let pot = value(potText) else { outcome = .message("Enter the pot size."); return }
        let toCall = value(toCallText) ?? 0
        let stack = value(stackText)
        let bigBlind = value(bigBlindText).flatMap { $0 > 0 ? $0 : nil } ?? 1
        let opp = opponents
        let job = Task.detached(priority: .userInitiated) {
            try PokerEngine.decide(hole: hole, board: board, pot: pot, toCall: toCall, opponents: opp,
                                   stack: stack, bigBlind: bigBlind, iterations: 10_000)
        }
        do {
            let d = try await job.value
            if !Task.isCancelled { outcome = .decision(d, toCall: toCall) }
        } catch {
            outcome = .message(error.localizedDescription)
        }
    }
}

struct CardFace: View {
    let card: Card
    let size: CGFloat

    var body: some View {
        VStack(spacing: 0) {
            Text(card.rankLabel).font(.system(size: size * 0.42, weight: .bold, design: .rounded))
            Text(card.suitSymbol).font(.system(size: size * 0.36))
        }
        .foregroundStyle(card.isRed ? Color(red: 0.78, green: 0.2, blue: 0.17) : Color(red: 0.09, green: 0.13, blue: 0.11))
        .minimumScaleFactor(0.6)
    }
}

/// Win chance bar with ticks for "needed to call" and the raise line.
struct Meter: View {
    let decision: PokerEngine.Decision
    let showNeeded: Bool
    let tint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            GeometryReader { geo in
                let w = geo.size.width
                ZStack(alignment: .leading) {
                    Capsule().fill(Color(.tertiarySystemFill))
                    Capsule().fill(tint).frame(width: max(0, w * decision.equity))
                    if showNeeded {
                        Rectangle().fill(Color.primary).frame(width: 2, height: 26).offset(x: w * decision.potOdds - 1)
                    }
                    Rectangle().fill(Color.orange).frame(width: 2, height: 26).offset(x: w * decision.raiseLine - 1)
                }
            }
            .frame(height: 16)
            .padding(.vertical, 5)
            HStack(spacing: 14) {
                legend("Win chance", decision.equity, nil)
                if showNeeded { legend("Needed", decision.potOdds, .primary) }
                legend("Raise line", decision.raiseLine, .orange)
            }
            .font(.caption)
            Text("Opponents assumed on the top \(PokerEngine.pct(decision.opponentRange)) of hands")
                .font(.caption).foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
    }

    private func legend(_ title: String, _ value: Double, _ key: Color?) -> some View {
        HStack(spacing: 4) {
            if let key { RoundedRectangle(cornerRadius: 1).fill(key).frame(width: 8, height: 8) }
            Text(title).foregroundStyle(.secondary)
            Text(PokerEngine.pct(value)).monospacedDigit().fontWeight(.semibold)
        }
    }
}
