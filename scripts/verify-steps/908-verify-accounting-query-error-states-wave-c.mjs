export default {
  name: "verify-accounting-query-error-states-wave-c",
  run(ctx) {
    const commands = [
      ["node", ["scripts/verify-accounting-query-error-states-wave-c.mjs"], "guard"],
      ["node", ["scripts/verify-accounting-query-error-states-wave-c.mjs", "--selftest"], "guard selftest"],
      [
        "npm",
        [
          "--prefix",
          "apps/frontend",
          "test",
          "--",
          "src/pages/accounting/__tests__/AccountingQueryErrorStatesWaveC.test.ts",
        ],
        "focused behavioral render test",
      ],
    ];

    for (const [command, args, label] of commands) {
      const status = ctx.runAllowFailure(command, args);
      if (status !== 0) {
        throw new Error(`verify-accounting-query-error-states-wave-c ${label} failed with exit ${status}`);
      }
    }
  },
};
