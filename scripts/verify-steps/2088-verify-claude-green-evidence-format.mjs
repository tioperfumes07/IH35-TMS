export default {
  name: "verify-claude-green-evidence-format",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-no-guard-file-deletion.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-claude-green-evidence-shape.mjs", "--selftest"]);
    ctx.run("node", ["scripts/cursor-pr-body-gate.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-cursor-claude-parity-ship.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-money-pr-local-gate.mjs", "--selftest"]);
    // Live shape checks need a tip commit — selftests above cover the contracts.
    return ctx.run("node", ["scripts/verify-cursor-claude-parity-ship.mjs"]);
  },
};
