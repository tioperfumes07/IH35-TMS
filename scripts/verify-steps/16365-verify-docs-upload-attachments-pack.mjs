export default {
  name: "verify:docs-upload-attachments-pack",
  run(ctx) {
    ctx.run("node", ["scripts/verify-docs-upload-attachments-pack.mjs"]);
  },
};
