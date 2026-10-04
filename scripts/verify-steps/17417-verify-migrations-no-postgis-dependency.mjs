export default {
  name: "verify:migrations-no-postgis-dependency",
  run(ctx) {
    ctx.run("node", ["scripts/verify-migrations-no-postgis-dependency.mjs"]);
  },
};
