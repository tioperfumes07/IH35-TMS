export default {
  name: "verify:checks-list-shows-every-check",
  run(ctx) {
    ctx.run("node", ["scripts/verify-checks-list-shows-every-check.mjs"]);
  },
};
