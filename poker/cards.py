"""Card parsing. A card is a (rank, suit) tuple: rank 2..14 (14 = ace), suit 0..3."""

RANKS = {"2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
         "T": 10, "10": 10, "J": 11, "Q": 12, "K": 13, "A": 14}
SUITS = {"c": 0, "d": 1, "h": 2, "s": 3,
         "♣": 0, "♦": 1, "♥": 2, "♠": 3}
RANK_CHARS = {v: k for k, v in RANKS.items() if k != "10"}
SUIT_CHARS = "cdhs"

FULL_DECK = [(r, s) for r in range(2, 15) for s in range(4)]


def parse_card(text):
    """'As' -> (14, 3). Accepts 'Td' or '10d', any case, and suit symbols."""
    t = text.strip()
    if len(t) < 2:
        raise ValueError(f"Not a card: {text!r}")
    rank_part, suit_part = t[:-1].upper(), t[-1]
    suit_key = suit_part.lower() if suit_part.isalpha() else suit_part
    if rank_part not in RANKS or suit_key not in SUITS:
        raise ValueError(f"Not a card: {text!r} (use e.g. As, Td, 10h, 7c)")
    return (RANKS[rank_part], SUITS[suit_key])


def parse_cards(cards):
    """Parse a list of card strings, or one string like 'As Kd' / 'AsKd'."""
    if isinstance(cards, str):
        s = cards.replace(",", " ").split()
        if len(s) == 1 and len(s[0]) > 3:  # 'AsKd' with no spaces
            s = [s[0][i:i + 2] for i in range(0, len(s[0]), 2)]
        cards = s
    parsed = [c if isinstance(c, tuple) else parse_card(c) for c in cards]
    if len(set(parsed)) != len(parsed):
        raise ValueError("The same card appears twice")
    return parsed


def card_str(card):
    return RANK_CHARS[card[0]] + SUIT_CHARS[card[1]]
