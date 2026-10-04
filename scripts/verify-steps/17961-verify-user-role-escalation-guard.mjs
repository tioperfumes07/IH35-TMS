export default {
  name: "verify:user-role-escalation-guard",
  run(ctx) {
    ctx.run("node", ["scripts/verify-user-role-escalation-guard.mjs"]);
  },
};
