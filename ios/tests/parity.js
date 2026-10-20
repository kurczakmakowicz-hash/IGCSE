// Builds parity input and engine.js output for ios/tests/main.swift.
const fs = require("fs");
const path = require("path");
const E = require(path.join(__dirname, "../../poker/web/engine.js"));
let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const sample = (n) => { const d = E.FULL_DECK.slice(); const out = []; for (let i = 0; i < n; i++) out.push(d.splice(Math.floor(rand() * d.length), 1)[0]); return out; };
const P = (s) => s.split(" ").map((c) => ["23456789TJQKA".indexOf(c[0]) + 2, "cdhs".indexOf(c[1])]);
const hands = Array.from({ length: 3000 }, (_, i) => sample(5 + (i % 3)));
const rangeCases = [];
for (const b of ["Kh 9h 2c", "Qh Jc 2s", "Kh 9h 2h 5c 7d", "6h 5s Kd 2c"])
  for (const pct of [0.15, 0.4, 0.6]) rangeCases.push({ dead: P("As Ad").concat(P(b)), board: P(b), pct });
rangeCases.push({ dead: P("Kd Jc"), board: [], pct: 0.12 });
const S = [["As Kd", "Qh Jc 2s", 100, 30, 1], ["7c 2d", "", 1.5, 1, 1], ["Ks Qd", "Kh 9h 2h 5c 7d", 200, 100, 1],
  ["Ks Qd", "Kh 9h 2h 5c 7d", 120, 20, 1], ["Ah 5h", "Kh 9h 2c", 125, 25, 2], ["As Ks", "Qs Js Ts 2d 3c", 150, 50, 3],
  ["Jc Jd", "", 7, 3, 2], ["8c 7d", "6h 5s Kd 2c", 60, 0, 1], ["Ah Kd", "Ac 8s 3d 2c 9h", 100, 0, 1], ["9s 9d", "", 30, 20, 1]];
const scenarios = S.map(([h, b, pot, toCall, opponents]) => ({ hole: P(h), board: b ? P(b) : [], pot, toCall, opponents }));
const input = { hands, rangeCases, scenarios };
const out = {
  evals: hands.map((h) => E.evaluate(h)),
  ranges: rangeCases.map((r) => E.buildRange(r.dead, r.board, r.pct)),
  decisions: scenarios.map((s) => E.decide({ hole: s.hole, board: s.board, pot: s.pot, toCall: s.toCall, opponents: s.opponents, iterations: 4000 })),
};
fs.writeFileSync(process.argv[2], JSON.stringify(input));
fs.writeFileSync(process.argv[3], JSON.stringify(out));
