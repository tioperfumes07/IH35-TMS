export default {
  name: "verify:drv04-medical-card-create-chains-to-upload",
  run(ctx) {
    ctx.run("node", ["scripts/verify-drv04-medical-card-create-chains-to-upload.mjs"]);
  },
};
