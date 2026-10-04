export default {
  name: "verify:reefer-persistence-identity-class",
  run(ctx) {
    ctx.run("node", ["scripts/verify-reefer-persistence-identity-class.mjs"]);
  },
};
