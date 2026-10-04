export default {
  name: "verify:driver-message-read-company-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-message-read-company-lifecycle.mjs"]);
  },
};
