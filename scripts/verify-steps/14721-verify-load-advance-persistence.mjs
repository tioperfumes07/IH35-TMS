export default {
  name: "verify:load-advance-persistence",
  run(ctx) {
    ctx.run("node", ["scripts/verify-load-advance-persistence.mjs"]);
  },
};
