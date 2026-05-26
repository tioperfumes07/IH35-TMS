export default {
  name: "verify-pm-due-soon-calculation",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:pm-due-soon-calculation"]) !== 0) {
      process.exit(1);
    }
  },
};
