export default {
  name: "verify:no-hardcoded-list-counts",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-no-hardcoded-list-counts.mjs"]);
  },
};
