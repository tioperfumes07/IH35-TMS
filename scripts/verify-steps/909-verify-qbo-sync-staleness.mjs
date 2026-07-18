export default {
  name: "verify:qbo-sync-staleness",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-sync-staleness.mjs"]);
  },
};
