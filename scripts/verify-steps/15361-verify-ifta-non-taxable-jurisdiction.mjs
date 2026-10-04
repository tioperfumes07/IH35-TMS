export default {
  name: "verify:ifta-non-taxable-jurisdiction",
  run(ctx) {
    ctx.run("node", ["scripts/verify-ifta-non-taxable-jurisdiction.mjs"]);
  },
};
