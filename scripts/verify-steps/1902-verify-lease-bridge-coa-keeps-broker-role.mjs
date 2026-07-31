export default {
  name: "verify:lease-bridge-coa-keeps-broker-role",
  run(ctx) {
    ctx.run("node", ["scripts/verify-lease-bridge-coa-keeps-broker-role.mjs"]);
  },
};
