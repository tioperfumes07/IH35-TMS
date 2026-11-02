export default {
  name: "verify:qbo-sync-panels-credentialed",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-sync-panels-credentialed.mjs"]);
  },
};
