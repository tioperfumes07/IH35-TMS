export default {
  name: "verify:matrix-fetch-timeout",
  run(ctx) {
    ctx.run("node", ["scripts/verify-matrix-fetch-timeout.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-matrix-fetch-timeout.mjs"]);
  },
};
