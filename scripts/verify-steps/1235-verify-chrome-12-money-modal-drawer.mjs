export default {
  name: "verify:chrome-12-money-modal-drawer",
  run(ctx) {
    // Self-test first (planted regressions to the matcher itself must fail), then the live repo scan
    // across every named CHROME-12 money-creator surface.
    ctx.run("node", ["scripts/verify-chrome-12-money-modal-drawer.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-chrome-12-money-modal-drawer.mjs"]);
  },
};
