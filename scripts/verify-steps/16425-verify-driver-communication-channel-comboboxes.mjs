export default {
  name: "verify:driver-communication-channel-comboboxes",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-communication-channel-comboboxes.mjs"]);
  },
};
