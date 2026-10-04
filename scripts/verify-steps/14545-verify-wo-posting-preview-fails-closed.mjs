export default {
  name: "verify:wo-posting-preview-fails-closed",
  run(ctx) {
    ctx.run("node", ["scripts/verify-wo-posting-preview-fails-closed.mjs"]);
  },
};
