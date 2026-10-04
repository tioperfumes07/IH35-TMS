export default {
  name: "verify:drivers-leave-canonical-inbox",
  run(ctx) {
    ctx.run("node", ["scripts/verify-drivers-leave-canonical-inbox.mjs"]);
  },
};
