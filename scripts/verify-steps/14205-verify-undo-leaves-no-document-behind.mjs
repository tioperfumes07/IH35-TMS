export default {
  name: "verify:undo-leaves-no-document-behind",
  run(ctx) {
    ctx.run("node", ["scripts/verify-undo-leaves-no-document-behind.mjs"]);
  },
};
