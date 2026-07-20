export default {
  name: "verify:safety-lists-date-range-parity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-lists-date-range-parity.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-safety-lists-date-range-parity.mjs"]);
  },
};
