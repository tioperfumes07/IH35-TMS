export default {
  name: "verify:internal-fine-liability-backlink-checked",
  run(ctx) {
    ctx.run("node", ["scripts/verify-internal-fine-liability-backlink-checked.mjs"]);
  },
};
