export default {
  name: "verify:create-driver-handwritten-label-association",
  run(ctx) {
    ctx.run("node", ["scripts/verify-create-driver-handwritten-label-association.mjs"]);
  },
};
