export default {
  name: "verify:drivers-reference-catalogs-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-drivers-reference-catalogs-wired.mjs"]);
  },
};
