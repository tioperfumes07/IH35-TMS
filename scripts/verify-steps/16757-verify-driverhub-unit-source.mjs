export default {
  name: "verify:driverhub-unit-source",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driverhub-unit-source.mjs"]);
  },
};
