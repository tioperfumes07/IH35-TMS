export default {
  name: "verify:deadhead-cache-rls",
  run(ctx) {
    ctx.run("node", ["scripts/verify-deadhead-cache-rls.mjs"]);
  },
};
