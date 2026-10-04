export default {
  name: "verify:upl06-dot-inspection-create-upload",
  run(ctx) {
    ctx.run("node", ["scripts/verify-upl06-dot-inspection-create-upload.mjs"]);
  },
};
