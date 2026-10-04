export default {
  name: "verify:driver-pairing-units-key",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-pairing-units-key.mjs"]);
  },
};
