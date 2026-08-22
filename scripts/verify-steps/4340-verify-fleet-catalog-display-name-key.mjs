export default {
  name: "verify:fleet-catalog-display-name-key",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fleet-catalog-display-name-key.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-fleet-catalog-display-name-key.mjs"]);
  },
};
