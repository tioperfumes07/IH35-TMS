export default {
  name: "verify:global-by-design-catalogs",
  run(ctx) {
    ctx.run("node", ["scripts/verify-global-by-design-catalogs.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-global-by-design-catalogs.mjs"]);
  },
};
