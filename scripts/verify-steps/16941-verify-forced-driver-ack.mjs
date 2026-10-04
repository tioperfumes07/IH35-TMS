export default {
  name: "verify:forced-driver-ack",
  run(ctx) {
    ctx.run("node", ["scripts/verify-forced-driver-ack.mjs"]);
  },
};
