// verify-steps wrapper — LV-NO-TARP-ACCESSORIAL-PAY-TYPE · claim 3620
export default {
  name: "verify-driver-pay-types-tarp-seeded",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-pay-types-tarp-seeded.mjs"]);
  },
};
