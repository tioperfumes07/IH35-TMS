export default {
  name: "verify-dispatch-coming-soon-triage",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:dispatch-coming-soon-triage"]) !== 0) {
      process.exit(1);
    }
  },
};
