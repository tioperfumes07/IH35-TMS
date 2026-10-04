export default {
  name: "verify:upl04-create-evidence-uploads",
  run(ctx) {
    ctx.run("node", ["scripts/verify-upl04-create-evidence-uploads.mjs"]);
  },
};
