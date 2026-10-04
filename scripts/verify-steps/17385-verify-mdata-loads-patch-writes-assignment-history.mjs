export default {
  name: "verify:mdata-loads-patch-writes-assignment-history",
  run(ctx) {
    ctx.run("node", ["scripts/verify-mdata-loads-patch-writes-assignment-history.mjs"]);
  },
};
