export default {
  name: "backend-vitest",
  run: async (ctx) => {
    if (
      ctx.run("npx", [
        "vitest",
        "run",
        "--config",
        "apps/backend/vitest.config.ts",
        "--reporter=json",
        "--outputFile",
        ctx.VITEST_REPORT_PATH,
      ]) !== 0
    ) {
      process.exit(1);
    }

    ctx.parseBackendVitestReport();
  },
};
