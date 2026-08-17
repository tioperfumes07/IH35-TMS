export default {
  name: "verify:settlement-manual-paid-reopen-confirmed",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-manual-paid-reopen-confirmed.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-settlement-manual-paid-reopen-confirmed.mjs"]);
  },
};
