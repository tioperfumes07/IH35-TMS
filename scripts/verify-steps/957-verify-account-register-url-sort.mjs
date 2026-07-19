export default {
  name: "verify:account-register-url-sort",
  run(ctx) {
    ctx.run("node", ["scripts/verify-account-register-url-sort.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-account-register-url-sort.mjs"]);
  },
};
