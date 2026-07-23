export default {
  name: "verify:asset-safety-reverse-section",
  run(ctx) {
    ctx.run("node", ["scripts/verify-asset-safety-reverse-section.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-asset-safety-reverse-section.mjs"]);
  },
};
