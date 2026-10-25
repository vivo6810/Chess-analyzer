/**
 * Opening names.
 *
 * Games store SAN only, so an opening is not a fact the-data can hold; it is a
 * fact derived from the move list against a table. The table here is a curated
 * subset of the ECO sequence book — the lines that cover the openings most
 * games actually reach in their first few plies. It is deliberately compact:
 * every line must be correct (each SAN sequence legal, each ECO code the
 * commonly published one), because a wrong label is worse than no label.
 *
 * The matcher takes the longest prefix that fits, so a specific line wins over
 * the family line above it, and anything that reaches past the table falls
 * through to null — nothing is labelled that the table cannot honestly say.
 */

export type Opening = {
  eco: string;
  name: string;
  /** SAN moves from the standard position. */
  sans: string[];
};

/** `eco name`, the stored form of an opening, e.g. "C50 Italian Game". */
export const openingLabel = (opening: Opening): string => `${opening.eco} ${opening.name}`;

export type OpeningLookup = { opening: Opening; plies: number } | null;

export const OPENINGS: Opening[] = [
  // ── King's pawn, open games ────────────────────────────────────────────
  { eco: 'C20', name: "King's Pawn Game", sans: ['e4', 'e5'] },
  { eco: 'C40', name: "King's Knight Opening", sans: ['e4', 'e5', 'Nf3'] },
  { eco: 'C44', name: "King's Knight: Normal Variation", sans: ['e4', 'e5', 'Nf3', 'Nc6'] },
  { eco: 'C42', name: "Petrov's Defence", sans: ['e4', 'e5', 'Nf3', 'Nf6'] },
  { eco: 'C25', name: 'Vienna Game', sans: ['e4', 'e5', 'Nc3'] },
  { eco: 'C30', name: "King's Gambit", sans: ['e4', 'e5', 'f4'] },
  { eco: 'C33', name: "King's Gambit Accepted", sans: ['e4', 'e5', 'f4', 'exf4'] },
  { eco: 'C23', name: "Bishop's Opening", sans: ['e4', 'e5', 'Bc4'] },
  { eco: 'C40', name: 'Latvian Gambit', sans: ['e4', 'e5', 'Nf3', 'f5'] },

  { eco: 'C50', name: 'Italian Game', sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'] },
  { eco: 'C53', name: 'Italian Game: Giuoco Piano', sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'] },
  { eco: 'C55', name: 'Italian Game: Two Knights Defence', sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6'] },
  { eco: 'C57', name: 'Two Knights Defence: Knight Attack', sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5'] },

  { eco: 'C60', name: 'Ruy López', sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'] },
  { eco: 'C70', name: 'Ruy López: Morphy Defence', sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'] },
  { eco: 'C65', name: 'Ruy López: Berlin Defence', sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6'] },

  { eco: 'C45', name: 'Scotch Game', sans: ['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'Nxd4'] },
  {
    eco: 'C45',
    name: 'Scotch Game: Classical Variation',
    sans: ['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'Nxd4', 'Bc5'],
  },
  { eco: 'C41', name: 'Philidor Defence', sans: ['e4', 'e5', 'Nf3', 'd6'] },

  // ── King's pawn, closed and semi-open ─────────────────────────────────
  { eco: 'B20', name: 'Sicilian Defence', sans: ['e4', 'c5'] },
  { eco: 'B23', name: 'Sicilian: Closed', sans: ['e4', 'c5', 'Nc3'] },
  { eco: 'B50', name: 'Sicilian: Modern Lines', sans: ['e4', 'c5', 'Nf3', 'd6'] },
  {
    eco: 'B90',
    name: 'Sicilian: Najdorf',
    sans: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'],
  },
  {
    eco: 'B56',
    name: 'Sicilian: Classical',
    sans: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'Nc6'],
  },
  {
    eco: 'B70',
    name: 'Sicilian: Dragon',
    sans: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'g6'],
  },
  { eco: 'B30', name: 'Sicilian: Old Sicilian Lines', sans: ['e4', 'c5', 'Nf3', 'Nc6'] },
  {
    eco: 'B34',
    name: 'Sicilian: Accelerated Dragon',
    sans: ['e4', 'c5', 'Nf3', 'Nc6', 'd4', 'cxd4', 'Nxd4', 'g6'],
  },
  { eco: 'B40', name: 'Sicilian: French Variation', sans: ['e4', 'c5', 'Nf3', 'e6'] },
  {
    eco: 'B45',
    name: 'Sicilian: Taimanov',
    sans: ['e4', 'c5', 'Nf3', 'e6', 'd4', 'cxd4', 'Nxd4', 'Nc6'],
  },

  { eco: 'B10', name: 'Caro-Kann Defence', sans: ['e4', 'c6'] },
  {
    eco: 'B12',
    name: 'Caro-Kann: Advance',
    sans: ['e4', 'c6', 'd4', 'd5', 'e5'],
  },
  {
    eco: 'B18',
    name: 'Caro-Kann: Classical',
    sans: ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4'],
  },

  { eco: 'C00', name: 'French Defence', sans: ['e4', 'e6'] },
  { eco: 'C01', name: 'French: Main Lines', sans: ['e4', 'e6', 'd4', 'd5'] },
  { eco: 'C02', name: 'French: Advance', sans: ['e4', 'e6', 'd4', 'd5', 'e5'] },
  { eco: 'C03', name: 'French: Tarrasch Lines', sans: ['e4', 'e6', 'd4', 'd5', 'exd5'] },
  { eco: 'C10', name: 'French: Paulsen Lines', sans: ['e4', 'e6', 'd4', 'd5', 'Nc3'] },
  { eco: 'C11', name: 'French: Classical Lines', sans: ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Nf6'] },
  { eco: 'C15', name: 'French: Winawer', sans: ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Bb4'] },

  { eco: 'B01', name: 'Scandinavian Defence', sans: ['e4', 'd5'] },
  {
    eco: 'B01',
    name: 'Scandinavian: Modern',
    sans: ['e4', 'd5', 'exd5', 'Qxd5', 'Nc3'],
  },
  { eco: 'B07', name: 'Pirc Defence', sans: ['e4', 'd6'] },
  { eco: 'B08', name: 'Pirc: Classical', sans: ['e4', 'd6', 'd4', 'Nf6'] },
  { eco: 'B06', name: 'Modern Defence', sans: ['e4', 'g6'] },
  { eco: 'B02', name: 'Alekhine Defence', sans: ['e4', 'Nf6'] },

  // ── Queen's pawn ──────────────────────────────────────────────────────
  { eco: 'D00', name: "Queen's Pawn Game", sans: ['d4', 'd5'] },
  { eco: 'D02', name: "Queen's Pawn: Zukertort", sans: ['d4', 'd5', 'Nf3'] },
  { eco: 'D02', name: 'London System', sans: ['d4', 'd5', 'Bf4'] },
  { eco: 'D06', name: "Queen's Gambit", sans: ['d4', 'd5', 'c4'] },
  { eco: 'D20', name: "Queen's Gambit Accepted", sans: ['d4', 'd5', 'c4', 'dxc4'] },
  { eco: 'D30', name: "Queen's Gambit Declined", sans: ['d4', 'd5', 'c4', 'e6'] },
  { eco: 'D10', name: 'Slav Defence', sans: ['d4', 'd5', 'c4', 'c6'] },
  { eco: 'D80', name: 'Grünfeld Defence', sans: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'd5'] },
  { eco: 'A40', name: "Queen's Pawn: e6 Lines", sans: ['d4', 'e6'] },
  { eco: 'A40', name: 'Englund Lines', sans: ['d4', 'e5'] },
  { eco: 'A41', name: "Queen's Pawn: d6 Lines", sans: ['d4', 'd6'] },

  { eco: 'A45', name: 'Indian Game', sans: ['d4', 'Nf6'] },
  { eco: 'E10', name: 'Indian Defence: e6 Lines', sans: ['d4', 'Nf6', 'c4', 'e6'] },
  { eco: 'E20', name: 'Nimzo-Indian Defence', sans: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4'] },
  { eco: 'E12', name: "Queen's Indian Defence", sans: ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'b6'] },
  { eco: 'E60', name: "King's Indian Defence", sans: ['d4', 'Nf6', 'c4', 'g6'] },
  {
    eco: 'E60',
    name: "King's Indian: Fianchetto Lines",
    sans: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7'],
  },
  { eco: 'A56', name: 'Benoni Defence', sans: ['d4', 'Nf6', 'c4', 'c5'] },
  { eco: 'A80', name: 'Dutch Defence', sans: ['d4', 'f5'] },

  // ── Flank and other first moves ───────────────────────────────────────
  { eco: 'A10', name: 'English Opening', sans: ['c4'] },
  { eco: 'A20', name: 'English: e5 Lines', sans: ['c4', 'e5'] },
  { eco: 'A30', name: 'English: Symmetrical', sans: ['c4', 'c5'] },
  { eco: 'A15', name: 'English: Anglo-Indian', sans: ['c4', 'Nf6'] },
  { eco: 'A13', name: 'English: e6 Lines', sans: ['c4', 'e6'] },
  { eco: 'A06', name: 'Nimzo-Larsen Lines: Réti', sans: ['Nf3', 'd5'] },
  { eco: 'A04', name: 'Zukertort Opening', sans: ['Nf3'] },
  { eco: 'A02', name: "Bird's Opening", sans: ['f4'] },
  { eco: 'A00', name: 'Van Geet Opening', sans: ['Nc3'] },
];

/**
 * The opening a move list reaches.
 *
 * Longest prefix wins, so "Sicilian: Najdorf" is found before plain "Sicilian
 * Defence" on the same board. Matching is positional, not fuzzy: exactly the
 * SAN in the table, in order, from the start of the list.
 */
export function classifyOpening(sans: string[]): OpeningLookup {
  let best: OpeningLookup = null;

  for (const opening of OPENINGS) {
    if (sans.length < opening.sans.length) continue;

    let matched = true;
    for (let index = 0; index < opening.sans.length; index += 1) {
      if (sans[index] !== opening.sans[index]) {
        matched = false;
        break;
      }
    }

    if (matched && (best == null || opening.sans.length > best.plies)) {
      best = { opening, plies: opening.sans.length };
    }
  }

  return best;
}

/** The stored label for a move list, or null when nothing fits. */
export function openingForMoves(sans: string[]): string | null {
  const found = classifyOpening(sans);
  return found ? openingLabel(found.opening) : null;
}
