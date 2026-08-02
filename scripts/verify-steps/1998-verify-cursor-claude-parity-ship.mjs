export default {
  name: "verify-cursor-claude-parity-ship",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cursor-claude-parity-ship.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-cursor-claude-parity-ship.mjs"]);
  },
};
