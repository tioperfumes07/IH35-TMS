export default {
  name: "verify:bills-page-human-labels",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bills-page-human-labels.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-bills-page-human-labels.mjs"]);
  },
};
