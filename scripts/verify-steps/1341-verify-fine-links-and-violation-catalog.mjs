export default {
  name: "verify:fine-links-and-violation-catalog",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fine-links-and-violation-catalog.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-fine-links-and-violation-catalog.mjs"]);
  },
};
