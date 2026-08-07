// BANK-F17 / CLS-UNIT-SCALE — no cents column may be projected under a dollar-contract alias. Prod
// rendered $147,593.00 for a $1,475.93 transaction. Step 2529 · CC-1 lane (n%4==1), claimed by #4357.
export default {
  name: "cents-dollar-scale",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cents-dollar-scale.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-cents-dollar-scale.mjs"]);
  },
};
