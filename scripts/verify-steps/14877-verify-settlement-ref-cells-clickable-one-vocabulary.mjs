// UI-F395 (owner, ROUND 395). Wired because the Tour column is rendered by TWO cells and ROUND 167's
// PENDING vocabulary only ever landed in one of them — so the retired status word kept shipping on
// ~15 screens for a week — and because PENDING and the closed-unnumbered dash were dead <span>s in
// both cells, leaving two of the column's three live states unreachable.
export default {
  name: "verify:settlement-ref-cells-clickable-one-vocabulary",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-ref-cells-clickable-one-vocabulary.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-settlement-ref-cells-clickable-one-vocabulary.mjs"]);
  },
};
