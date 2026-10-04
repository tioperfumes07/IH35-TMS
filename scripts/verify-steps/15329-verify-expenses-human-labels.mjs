export default {
  name: "verify:expenses-human-labels",
  run(ctx) {
    ctx.run("node", ["scripts/verify-expenses-human-labels.mjs"]);
  },
};
