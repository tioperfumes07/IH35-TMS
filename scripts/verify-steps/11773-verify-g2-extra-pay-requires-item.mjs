// G2 (ROUND 292/293, AUTH-168) -- the engine fix's own guard. Asserts
// settlement_lines_extra_pay_requires_item exists and the live null-item extra_pay count never
// grows past the known, grandfathered legacy baseline (17).
export default {
  name: "verify:g2-extra-pay-requires-item",
  run(ctx) {
    ctx.run("node", ["scripts/verify-g2-extra-pay-requires-item.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-g2-extra-pay-requires-item.mjs"]);
  },
};
