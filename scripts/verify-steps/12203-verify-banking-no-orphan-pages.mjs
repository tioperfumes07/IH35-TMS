export default {
  name: "verify:banking-no-orphan-pages",
  run(ctx) {
    ctx.run("node", ["scripts/verify-banking-no-orphan-pages.mjs"]);
  },
};
