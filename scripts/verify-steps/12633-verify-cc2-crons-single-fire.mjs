export default {
  name: "verify:cc2-crons-single-fire",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cc2-crons-single-fire.mjs"]);
  },
};
