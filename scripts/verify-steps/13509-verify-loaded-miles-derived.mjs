export default {
  name: "verify:loaded-miles-derived",
  run(ctx) {
    ctx.run("node", ["scripts/verify-loaded-miles-derived.mjs"]);
  },
};
