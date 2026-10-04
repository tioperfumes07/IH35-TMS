export default {
  name: "verify:vehicle-driver-pairing-append-only",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vehicle-driver-pairing-append-only.mjs"]);
  },
};
