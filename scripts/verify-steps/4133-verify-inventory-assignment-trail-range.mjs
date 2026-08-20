export default {
  name: "verify:inventory-assignment-trail-range",
  run(ctx) {
    ctx.run("node", ["scripts/verify-inventory-assignment-trail-range.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-inventory-assignment-trail-range.mjs"]);
  },
};
