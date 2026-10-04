export default {
  name: "verify:list-empty-settled",
  run(ctx) {
    ctx.run("node", ["scripts/verify-list-empty-settled.mjs"]);
  },
};
