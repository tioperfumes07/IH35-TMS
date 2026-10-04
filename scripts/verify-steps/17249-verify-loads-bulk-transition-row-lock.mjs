export default {
  name: "verify:loads-bulk-transition-row-lock",
  run(ctx) {
    ctx.run("node", ["scripts/verify-loads-bulk-transition-row-lock.mjs"]);
  },
};
