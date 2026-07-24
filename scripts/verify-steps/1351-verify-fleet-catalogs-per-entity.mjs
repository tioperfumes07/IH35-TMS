export default {
  name: "verify:fleet-catalogs-per-entity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fleet-catalogs-per-entity.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-fleet-catalogs-per-entity.mjs"]);
  },
};
