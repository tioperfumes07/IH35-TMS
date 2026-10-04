export default {
  name: "verify:no-merge-conflict-markers",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-merge-conflict-markers.mjs"]);
  },
};
