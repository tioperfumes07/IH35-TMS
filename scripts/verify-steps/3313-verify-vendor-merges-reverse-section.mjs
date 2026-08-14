// LINK-F5183 / LINK-F5171 — factoring:home.vendor_merges reverse (driver + vendor) surface
// (verify-step 3313 — CC-1 band, claimed in #6883).
export default {
  name: "vendor-merges-reverse-section",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vendor-merges-reverse-section.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-vendor-merges-reverse-section.mjs"]);
  },
};
