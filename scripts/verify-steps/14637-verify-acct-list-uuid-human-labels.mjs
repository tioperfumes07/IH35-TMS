export default {
  name: "verify:acct-list-uuid-human-labels",
  run(ctx) {
    ctx.run("node", ["scripts/verify-acct-list-uuid-human-labels.mjs"]);
  },
};
