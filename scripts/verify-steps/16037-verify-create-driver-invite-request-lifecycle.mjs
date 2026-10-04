export default {
  name: "verify:create-driver-invite-request-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-create-driver-invite-request-lifecycle.mjs"]);
  },
};
