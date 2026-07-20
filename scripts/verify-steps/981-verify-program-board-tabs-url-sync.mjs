export default {
  name: "verify:program-board-tabs-url-sync",
  run(ctx) {
    ctx.run("node", ["scripts/verify-program-board-tabs-url-sync.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-program-board-tabs-url-sync.mjs"]);
  },
};
