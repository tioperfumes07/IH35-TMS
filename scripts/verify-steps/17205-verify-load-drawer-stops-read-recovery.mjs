export default {
  name: "verify:load-drawer-stops-read-recovery",
  run(ctx) {
    ctx.run("node", ["scripts/verify-load-drawer-stops-read-recovery.mjs"]);
  },
};
