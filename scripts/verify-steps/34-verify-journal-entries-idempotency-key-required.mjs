export default {
  name: "verify-journal-entries-idempotency-key-required",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:journal-entries-idempotency-key-required"]) !== 0) {
      process.exit(1);
    }
  },
};
