import path from "node:path";

export default {
  name: "frontend-tsc",
  run: async (ctx) => {
    // module-completion.ts is gitignored (conflict kill). Always regenerate before tsc so
    // verify:pre-commit / CI never fail with TS2307 on a missing generated module.
    if (
      ctx.run(process.execPath, ["scripts/generate-module-completion-data.mjs"], {
        cwd: ctx.ROOT,
      }) !== 0
    ) {
      process.exit(1);
    }
    if (ctx.run("npx", ["tsc", "-b"], { cwd: path.join(ctx.ROOT, "apps/frontend") }) !== 0) {
      process.exit(1);
    }
  },
};
