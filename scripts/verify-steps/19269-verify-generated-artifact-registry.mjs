export default {
  name: "verify:generated-artifact-registry",
  run(ctx) {
    ctx.run("node", ["scripts/verify-generated-artifact-registry.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-generated-artifact-registry.mjs"]);
  },
};
