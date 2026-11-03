export default {
  name: "verify:inventory-assignments-honesty",
  run(ctx) {
    ctx.run("node", ["scripts/verify-inventory-assignments-honesty.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-inventory-assignments-honesty.mjs"]);
  },
};
