import path from "node:path";

export default {
  name: "frontend-tsc",
  run: async (ctx) => {
    if (ctx.run("npx", ["tsc", "-b"], { cwd: path.join(ctx.ROOT, "apps/frontend") }) !== 0) {
      process.exit(1);
    }
  },
};
