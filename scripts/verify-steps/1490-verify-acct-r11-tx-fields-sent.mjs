export default {
  name: "verify:acct-r11-tx-fields-sent",
  run(ctx) {
    ctx.run("node", ["scripts/verify-acct-r11-tx-fields-sent.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-acct-r11-tx-fields-sent.mjs"]);
  },
};
