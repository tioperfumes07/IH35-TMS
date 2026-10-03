export default {
  name: "verify:driver-messaging-both-ways",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-messaging-both-ways.mjs"]);
  },
};
