export default {
  name: "verify:legal-matters-role-gate",
  run(ctx) {
    ctx.run("node", ["scripts/verify-legal-matters-role-gate.mjs"]);
  },
};
