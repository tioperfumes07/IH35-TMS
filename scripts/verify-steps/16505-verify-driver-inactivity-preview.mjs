export default {
  name: "verify:driver-inactivity-preview",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-inactivity-preview.mjs"]);
  },
};
