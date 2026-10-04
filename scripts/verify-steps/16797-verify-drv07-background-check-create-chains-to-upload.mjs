export default {
  name: "verify:drv07-background-check-create-chains-to-upload",
  run(ctx) {
    ctx.run("node", ["scripts/verify-drv07-background-check-create-chains-to-upload.mjs"]);
  },
};
