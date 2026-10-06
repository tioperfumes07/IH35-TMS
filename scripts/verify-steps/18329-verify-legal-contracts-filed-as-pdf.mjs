export default {
  name: "verify:legal-contracts-filed-as-pdf",
  run(ctx) {
    ctx.run("node", ["scripts/verify-legal-contracts-filed-as-pdf.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-legal-contracts-filed-as-pdf.mjs"]);
  },
};
