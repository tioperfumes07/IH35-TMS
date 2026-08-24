export default {
  name: "verify-inventory-part-drawer-mutation-errors-surfaced",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-inventory-part-drawer-mutation-errors-surfaced.mjs"]) !== 0) {
      throw new Error("verify-inventory-part-drawer-mutation-errors-surfaced failed");
    }
  },
};
