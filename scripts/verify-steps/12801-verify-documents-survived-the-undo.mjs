export default {
  name: "verify:documents-survived-the-undo",
  run(ctx) {
    ctx.run("node", ["scripts/verify-documents-survived-the-undo.mjs"]);
  },
};
