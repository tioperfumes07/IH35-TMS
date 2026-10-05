export default {
  name: "verify:void-document-door-is-whole",
  run(ctx) {
    ctx.run("node", ["scripts/verify-void-document-door-is-whole.mjs"]);
  },
};
