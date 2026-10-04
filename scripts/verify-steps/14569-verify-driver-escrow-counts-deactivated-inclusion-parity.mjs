export default {
  name: "verify:driver-escrow-counts-deactivated-inclusion-parity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-escrow-counts-deactivated-inclusion-parity.mjs"]);
  },
};
