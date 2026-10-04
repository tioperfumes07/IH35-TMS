export default {
  name: "verify:sidebar-items-locked",
  run(ctx) {
    ctx.run("node", ["scripts/verify-sidebar-items-locked.mjs"]);
  },
};
