export default {
  name: "verify:revrec-and-payrun-close-tag-source",
  run(ctx) {
    ctx.run("node", ["scripts/verify-revrec-and-payrun-close-tag-source.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-revrec-and-payrun-close-tag-source.mjs"]);
  },
};
