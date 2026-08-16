// verify-steps wrapper — LV-DOCS-FILES-NOT-HASHED · claim 3618
export default {
  name: "verify-docs-upload-sha256-required",
  run(ctx) {
    ctx.run("node", ["scripts/verify-docs-upload-sha256-required.mjs"]);
  },
};
