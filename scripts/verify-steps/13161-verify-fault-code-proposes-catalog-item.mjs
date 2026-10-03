export default {
  name: "verify:fault-code-proposes-catalog-item",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fault-code-proposes-catalog-item.mjs"]);
  },
};
