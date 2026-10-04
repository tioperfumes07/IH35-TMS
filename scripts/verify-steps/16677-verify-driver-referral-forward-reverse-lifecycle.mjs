export default {
  name: "verify:driver-referral-forward-reverse-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-referral-forward-reverse-lifecycle.mjs"]);
  },
};
