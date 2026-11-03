export default {
  name: "verify:master-data-protected",
  run(ctx) {
    ctx.run("node", ["scripts/verify-master-data-protected.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-master-data-protected.mjs"]);
  },
};
