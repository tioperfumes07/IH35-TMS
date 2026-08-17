export default {
  name: "verify:banking-register-virtual-account-id-accepted",
  run(ctx) {
    ctx.run("node", ["scripts/verify-banking-register-virtual-account-id-accepted.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-banking-register-virtual-account-id-accepted.mjs"]);
  },
};
