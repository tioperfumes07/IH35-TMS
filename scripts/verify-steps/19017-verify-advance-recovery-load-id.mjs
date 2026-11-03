export default {
  name: "verify:advance-recovery-load-id",
  run(ctx) {
    ctx.run("node", ["scripts/verify-advance-recovery-load-id.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-advance-recovery-load-id.mjs"]);
  },
};
