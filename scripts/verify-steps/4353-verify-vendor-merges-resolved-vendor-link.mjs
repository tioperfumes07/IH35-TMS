export default {
  name: "verify:vendor-merges-resolved-vendor-link",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vendor-merges-resolved-vendor-link.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-vendor-merges-resolved-vendor-link.mjs"]);
  },
};
