export default {
  name: "verify:bank-kpi-authoritative-cash-no-fake-zero",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bank-kpi-authoritative-cash-no-fake-zero.mjs"]);
  },
};
