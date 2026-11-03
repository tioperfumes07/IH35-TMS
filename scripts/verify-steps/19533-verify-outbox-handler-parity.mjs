export default {
  name: "verify:outbox-handler-parity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-outbox-handler-parity.mjs"]);
  },
};
