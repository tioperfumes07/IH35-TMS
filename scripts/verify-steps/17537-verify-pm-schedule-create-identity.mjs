export default {
  name: "verify:pm-schedule-create-identity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-pm-schedule-create-identity.mjs"]);
  },
};
