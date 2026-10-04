export default {
  name: "verify:acct-direct-creators-company-keyed-remount",
  run(ctx) {
    ctx.run("node", ["scripts/verify-acct-direct-creators-company-keyed-remount.mjs"]);
  },
};
