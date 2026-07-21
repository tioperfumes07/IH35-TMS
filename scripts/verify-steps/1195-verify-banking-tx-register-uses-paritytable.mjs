export default {
  name: "verify:banking-tx-register-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-banking-tx-register-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-banking-tx-register-uses-paritytable.mjs"]);
  },
};
