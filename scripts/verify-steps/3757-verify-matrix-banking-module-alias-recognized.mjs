export default {
  name: "verify:matrix-banking-module-alias-recognized",
  run(ctx) {
    ctx.run("node", ["scripts/verify-matrix-banking-module-alias-recognized.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-matrix-banking-module-alias-recognized.mjs"]);
  },
};
