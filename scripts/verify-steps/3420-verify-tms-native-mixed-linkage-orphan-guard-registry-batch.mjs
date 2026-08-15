const guards = [
  "verify-tms-native-mixed-linkage-guard-registry-batch.mjs",
  "verify-qbo-categories-tms-catalog-connectivity.mjs",
  "verify-operating-report-entity-reverse-leaves.mjs",
];

export default {
  name: "verify-tms-native-mixed-linkage-orphan-guard-registry-batch",
  async run(ctx) {
    for (const guard of guards) await ctx.run("node", [`scripts/${guard}`]);
  },
};
