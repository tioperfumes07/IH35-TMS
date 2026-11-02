export default {
  name: "verify:safety-read-recovery-dead-ends",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-read-recovery-dead-ends.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-safety-read-recovery-dead-ends.mjs"]);
  },
};
