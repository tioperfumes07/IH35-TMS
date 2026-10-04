export default {
  name: "verify:fuel-upload-creator-draft-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fuel-upload-creator-draft-lifecycle.mjs"]);
  },
};
