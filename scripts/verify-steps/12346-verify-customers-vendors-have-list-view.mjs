export default {
  name: "verify:customers-vendors-have-list-view",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customers-vendors-have-list-view.mjs"]);
  },
};
