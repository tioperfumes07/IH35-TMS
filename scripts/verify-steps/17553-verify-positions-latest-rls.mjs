export default {
  name: "verify:positions-latest-rls",
  run(ctx) {
    ctx.run("node", ["scripts/verify-positions-latest-rls.mjs"]);
  },
};
