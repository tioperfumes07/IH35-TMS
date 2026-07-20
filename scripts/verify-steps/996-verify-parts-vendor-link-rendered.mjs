export default {
  name: "verify:parts-vendor-link-rendered",
  run(ctx) {
    ctx.run("node", ["scripts/verify-parts-vendor-link-rendered.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-parts-vendor-link-rendered.mjs"]);
  },
};
