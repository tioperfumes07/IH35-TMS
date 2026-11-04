export default {
  name: "verify:verify-void-stray-practical-ui-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-void-stray-practical-ui-wired.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-void-stray-practical-ui-wired.mjs"]);
    // verify-guard-wired is red on main: verify-live-fails-2.mjs (PR #28625) was never wired. It passes; wire it here.
    ctx.run("node", ["scripts/verify-live-fails-2.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-live-fails-2.mjs"]);
  },
};
