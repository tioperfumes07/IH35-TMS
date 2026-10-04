export default {
  name: "verify:user-s02-role-approver-backend-enforced",
  run(ctx) {
    ctx.run("node", ["scripts/verify-user-s02-role-approver-backend-enforced.mjs"]);
  },
};
