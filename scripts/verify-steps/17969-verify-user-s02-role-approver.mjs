export default {
  name: "verify:user-s02-role-approver",
  run(ctx) {
    ctx.run("node", ["scripts/verify-user-s02-role-approver.mjs"]);
  },
};
