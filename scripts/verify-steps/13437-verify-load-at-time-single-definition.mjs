export default {
  name: "verify:load-at-time-single-definition",
  run(ctx) {
    ctx.run("node", ["scripts/verify-load-at-time-single-definition.mjs"]);
  },
};
