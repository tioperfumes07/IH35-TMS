export default {
  name: "verify:purge-window-exemption",
  run(ctx) {
    ctx.run("node", ["scripts/verify-purge-window-exemption.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-purge-window-exemption.mjs"]);
  },
};
