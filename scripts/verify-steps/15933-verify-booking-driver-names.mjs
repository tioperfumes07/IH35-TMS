export default {
  name: "verify:booking-driver-names",
  run(ctx) {
    ctx.run("node", ["scripts/verify-booking-driver-names.mjs"]);
  },
};
