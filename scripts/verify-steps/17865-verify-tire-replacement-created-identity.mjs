export default {
  name: "verify:tire-replacement-created-identity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-tire-replacement-created-identity.mjs"]);
  },
};
