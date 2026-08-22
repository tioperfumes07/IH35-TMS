export default {
  name: "verify:from-load-customer-left-join",
  run(ctx) {
    ctx.run("node", ["scripts/verify-from-load-customer-left-join.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-from-load-customer-left-join.mjs"]);
  },
};
