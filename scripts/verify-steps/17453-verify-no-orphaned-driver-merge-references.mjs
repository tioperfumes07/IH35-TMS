export default {
  name: "verify:no-orphaned-driver-merge-references",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-orphaned-driver-merge-references.mjs"]);
  },
};
