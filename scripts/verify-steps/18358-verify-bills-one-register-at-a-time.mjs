export default {
  name: "verify:bills-one-register-at-a-time",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bills-one-register-at-a-time.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-bills-one-register-at-a-time.mjs"]);
  },
};
