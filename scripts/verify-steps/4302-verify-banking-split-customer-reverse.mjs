export default {
  name: "verify:banking-split-customer-reverse",
  run(ctx) {
    ctx.run("node", ["scripts/verify-banking-split-customer-reverse.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-banking-split-customer-reverse.mjs"]);
  },
};
