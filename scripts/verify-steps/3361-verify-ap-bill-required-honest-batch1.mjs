// LINK-F5188 — ap_bill Required-column honesty audit, batch 1 (accounting + maintenance +
// reports).
// (verify-step 3361 — CC-1 band, claimed in commit da089ceb6 "FINDING: claim verify-step
// 3361 (cc-1 band)" #7006).
export default {
  name: "ap-bill-required-honest-batch1",
  run(ctx) {
    ctx.run("node", ["scripts/verify-ap-bill-required-honest-batch1.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-ap-bill-required-honest-batch1.mjs"]);
  },
};
