const guards = [
  "verify-wave-a-guard-registry-batch.mjs",
  "verify-customer-column-remaining-modules.mjs",
  "verify-driver-column-remaining-modules.mjs",
  "verify-unit-column-remaining-modules.mjs",
  "verify-vendor-column-remaining-modules.mjs",
  "verify-wave-a-customer-all-modules.mjs",
  "verify-wave-a-customer-column.mjs",
  "verify-wave-a-customer-remainder-column.mjs",
  "verify-wave-a-driver-all-modules.mjs",
  "verify-wave-a-driver-column.mjs",
  "verify-wave-a-lists-driver-column.mjs",
  "verify-wave-a-load-all-modules.mjs",
  "verify-wave-a-load-column.mjs",
  "verify-wave-a-load-remainder.mjs",
  "verify-wave-a-trailer-all-modules.mjs",
  "verify-wave-a-trailer-column.mjs",
  "verify-wave-a-unit-all-modules.mjs",
  "verify-wave-a-unit-column.mjs",
  "verify-wave-a-vendor-all-modules.mjs",
  "verify-wave-a-vendor-column.mjs",
];

export default {
  name: "verify-wave-a-orphan-guard-registry-batch",
  async run(ctx) {
    for (const guard of guards) {
      await ctx.run("node", [`scripts/${guard}`]);
    }
  },
};
