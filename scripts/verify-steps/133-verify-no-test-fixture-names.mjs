// modsweep-wire-unwired-guards: verify-no-test-fixture-names guards against TEST-VENDOR/fixture strings leaking
// into production source. It already runs in .github/workflows/locked-guards.yml; this ALSO wires it into
// verify:pre-commit (build-typecheck) so the protection holds in both CI jobs (defense-in-depth). DB-free, static.
export default {
  name: "verify-no-test-fixture-names",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:no-test-fixture-names"]) !== 0) {
      process.exit(1);
    }
  },
};
