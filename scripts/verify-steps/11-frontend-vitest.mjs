import path from "node:path";

export default {
  name: "frontend-vitest",
  run: async (ctx) => {
    if (ctx.run("npx", ["vitest", "run", "src/components/ErrorBoundary.test.tsx"], { cwd: path.join(ctx.ROOT, "apps/frontend") }) !== 0) {
      process.exit(1);
    }
  },
};
