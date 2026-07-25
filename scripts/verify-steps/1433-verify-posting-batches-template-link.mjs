// ACCT-LINK-05: catalogs.posting_templates had 0 inbound FKs (island catalog, no consumer write path).
// This guard proves every accounting.posting_batches writer stamps posting_template_id + source_template_code.
export default {
  name: "verify:posting-batches-template-link",
  run(ctx) {
    ctx.run("node", ["scripts/verify-posting-batches-template-link.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-posting-batches-template-link.mjs"]);
  },
};
