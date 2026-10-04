export default {
  name: "verify:bulk-action-bar-mounted",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bulk-action-bar-mounted.mjs"]);
  },
};
