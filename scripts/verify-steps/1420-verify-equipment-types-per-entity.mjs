export default {
  name: "verify:equipment-types-per-entity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-equipment-types-per-entity.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-equipment-types-per-entity.mjs"]);
  },
};
