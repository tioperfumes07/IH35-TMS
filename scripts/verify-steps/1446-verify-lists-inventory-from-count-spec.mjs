export default {
  name: "verify:lists-inventory-from-count-spec",
  run(ctx) {
    ctx.run("node", ["scripts/verify-lists-inventory-from-count-spec.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-lists-inventory-from-count-spec.mjs"]);
  },
};
