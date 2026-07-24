export default {
  name: "verify:fleet-catalog-no-metadata-phantom",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fleet-catalog-no-metadata-phantom.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-fleet-catalog-no-metadata-phantom.mjs"]);
  },
};
