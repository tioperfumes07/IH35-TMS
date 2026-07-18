import assert from "node:assert/strict";
import { test } from "node:test";

import {
  loadLiveRequiredStatusChecks,
  TRUSTED_GITHUB_AUTHORITY,
} from "../push-gate-capability-policy.mjs";
import { BOOTSTRAP_LOCAL_GIT_VARIABLES } from "../trusted-git-environment.mjs";

const CONTEXT = "hold-merge-gate / hold-merge-gate";
const DECLARATIONS = {
  "pull-request-metadata": {
    context: CONTEXT,
    check_context: "hold-merge-gate",
    integration_id: 15368,
  },
};

function result({ status = 0, stdout = "", stderr = "", error } = {}) {
  return { status, stdout, stderr, error };
}

function sequence(...results) {
  let index = 0;
  return () => results[index++] ?? result({ status: 1, stderr: "unexpected call" });
}

const LOCAL_VARIABLES = `${BOOTSTRAP_LOCAL_GIT_VARIABLES.join("\n")}\n`;
const EFFECTIVE_RULES = [
  {
    type: "required_status_checks",
    ruleset_source_type: "Repository",
    ruleset_source: TRUSTED_GITHUB_AUTHORITY.repository,
    ruleset_id: TRUSTED_GITHUB_AUTHORITY.rulesetId,
    parameters: {
      required_status_checks: [
        { context: "hold-merge-gate", integration_id: 15368 },
      ],
    },
  },
];
const RULESET_IDENTITY = {
  id: TRUSTED_GITHUB_AUTHORITY.rulesetId,
  name: TRUSTED_GITHUB_AUTHORITY.rulesetName,
  target: "branch",
  source_type: "Repository",
  source: TRUSTED_GITHUB_AUTHORITY.repository,
  enforcement: "active",
};

test("authenticated live effective rule with exact GitHub Actions integration permits capability", () => {
  const live = loadLiveRequiredStatusChecks(".", DECLARATIONS, {
    run: sequence(
      result({ stdout: LOCAL_VARIABLES }),
      result({ stdout: JSON.stringify(EFFECTIVE_RULES) }),
      result({ stdout: JSON.stringify(RULESET_IDENTITY) })
    ),
  });
  assert.deepEqual([...live.requiredContexts], [CONTEXT]);
  assert.deepEqual(live.errors, {});
});

test("wrong integration cannot self-attest the trusted hold context", () => {
  const live = loadLiveRequiredStatusChecks(".", DECLARATIONS, {
    run: sequence(
      result({ stdout: LOCAL_VARIABLES }),
      result({
        stdout: JSON.stringify([
          {
            ...EFFECTIVE_RULES[0],
            parameters: {
              required_status_checks: [
                { context: "hold-merge-gate", integration_id: 99999 },
              ],
            },
          },
        ]),
      }),
      result({ stdout: JSON.stringify(RULESET_IDENTITY) })
    ),
  });
  assert.deepEqual([...live.requiredContexts], []);
  assert.match(live.errors["pull-request-metadata"], /integration 15368/);
});

for (const fixture of [
  {
    name: "missing gh executable",
    gh: result({
      status: null,
      error: Object.assign(new Error("spawnSync gh ENOENT"), { code: "ENOENT" }),
    }),
    expected: /ENOENT/,
  },
  {
    name: "unauthenticated GitHub CLI",
    gh: result({
      status: 4,
      stderr: "To get started with GitHub CLI, please run: gh auth login",
    }),
    expected: /gh auth login/,
  },
  {
    name: "offline GitHub API",
    gh: result({
      status: 1,
      stderr: "error connecting to api.github.com",
    }),
    expected: /error connecting/,
  },
  {
    name: "ruleset lookup timeout",
    gh: result({
      status: null,
      error: Object.assign(new Error("spawnSync gh ETIMEDOUT"), {
        code: "ETIMEDOUT",
      }),
    }),
    expected: /ETIMEDOUT/,
  },
]) {
  test(`${fixture.name} fails closed`, () => {
    const live = loadLiveRequiredStatusChecks(".", DECLARATIONS, {
      run: sequence(
        result({ stdout: LOCAL_VARIABLES }),
        fixture.gh
      ),
    });
    assert.deepEqual([...live.requiredContexts], []);
    assert.match(live.errors["pull-request-metadata"], fixture.expected);
  });
}

test("malformed live ruleset JSON fails closed", () => {
  const live = loadLiveRequiredStatusChecks(".", DECLARATIONS, {
    run: sequence(
      result({ stdout: LOCAL_VARIABLES }),
      result({ stdout: "{\"not\":\"an array\"}" }),
      result({ stdout: JSON.stringify(RULESET_IDENTITY) })
    ),
  });
  assert.deepEqual([...live.requiredContexts], []);
  assert.match(live.errors["pull-request-metadata"], /invalid JSON/);
});

test("Git config and origin rewrite attacks cannot select the authority", () => {
  const calls = [];
  const planted = {
    PATH: process.env.PATH,
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "remote.origin.url",
    GIT_CONFIG_VALUE_0: "https://evil.example/attacker/mirror.git",
    GIT_CONFIG: "/tmp/attacker.gitconfig",
    GIT_CONFIG_PARAMETERS: "'remote.origin.url=https://evil.example/attacker/mirror.git'",
  };
  const live = loadLiveRequiredStatusChecks(".", DECLARATIONS, {
    sourceEnv: planted,
    run(command, args, options) {
      calls.push({ command, args, env: options.env });
      if (command === "git") return result({ stdout: LOCAL_VARIABLES });
      if (args.at(-1).includes("/rules/branches/")) {
        return result({ stdout: JSON.stringify(EFFECTIVE_RULES) });
      }
      return result({ stdout: JSON.stringify(RULESET_IDENTITY) });
    },
  });
  assert.deepEqual([...live.requiredContexts], [CONTEXT]);
  const ghCalls = calls.filter(({ command }) => command === "gh");
  assert.equal(ghCalls.length, 2);
  for (const call of ghCalls) {
    assert.equal(call.env.GIT_CONFIG_COUNT, undefined);
    assert.equal(call.env.GIT_CONFIG, undefined);
    assert.equal(call.env.GIT_CONFIG_PARAMETERS, undefined);
    assert.equal(call.env.GIT_CONFIG_KEY_0, undefined);
    assert.equal(call.env.GIT_CONFIG_VALUE_0, undefined);
    assert.ok(call.args.includes(TRUSTED_GITHUB_AUTHORITY.host));
    assert.match(call.args.at(-1), /^repos\/tioperfumes07\/IH35-TMS\//);
  }
});

test("GH_HOST redirect is stripped while github.com is pinned", () => {
  const calls = [];
  const live = loadLiveRequiredStatusChecks(".", DECLARATIONS, {
    sourceEnv: { PATH: process.env.PATH, GH_HOST: "evil.example", GH_REPO: "attacker/mirror" },
    run(command, args, options) {
      calls.push({ command, args, env: options.env });
      if (command === "git") return result({ stdout: LOCAL_VARIABLES });
      return result({
        stdout: JSON.stringify(
          args.at(-1).includes("/rules/branches/") ? EFFECTIVE_RULES : RULESET_IDENTITY
        ),
      });
    },
  });
  assert.deepEqual([...live.requiredContexts], [CONTEXT]);
  for (const call of calls.filter(({ command }) => command === "gh")) {
    assert.equal(call.env.GH_HOST, undefined);
    assert.equal(call.env.GH_REPO, undefined);
    assert.deepEqual(call.args.slice(0, 3), ["api", "--hostname", "github.com"]);
  }
});

test("alternate repository returning matching context JSON fails closed", () => {
  const alternateRules = [
    {
      ...EFFECTIVE_RULES[0],
      ruleset_source: "attacker/mirror",
    },
  ];
  const alternateIdentity = {
    ...RULESET_IDENTITY,
    source: "attacker/mirror",
  };
  const live = loadLiveRequiredStatusChecks(".", DECLARATIONS, {
    run: sequence(
      result({ stdout: LOCAL_VARIABLES }),
      result({ stdout: JSON.stringify(alternateRules) }),
      result({ stdout: JSON.stringify(alternateIdentity) })
    ),
  });
  assert.deepEqual([...live.requiredContexts], []);
  assert.match(live.errors["pull-request-metadata"], /identity does not match/);
});

test("wrong ruleset identity fails closed even with matching context and integration", () => {
  const live = loadLiveRequiredStatusChecks(".", DECLARATIONS, {
    run: sequence(
      result({ stdout: LOCAL_VARIABLES }),
      result({ stdout: JSON.stringify(EFFECTIVE_RULES) }),
      result({
        stdout: JSON.stringify({
          ...RULESET_IDENTITY,
          id: TRUSTED_GITHUB_AUTHORITY.rulesetId + 1,
        }),
      })
    ),
  });
  assert.deepEqual([...live.requiredContexts], []);
  assert.match(live.errors["pull-request-metadata"], /identity does not match/);
});
