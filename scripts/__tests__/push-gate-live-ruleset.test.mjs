import assert from "node:assert/strict";
import { test } from "node:test";

import {
  loadLiveRequiredStatusChecks,
  repositorySlugFromRemote,
} from "../push-gate-capability-policy.mjs";

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

test("parses HTTPS and SSH GitHub origin URLs", () => {
  assert.equal(
    repositorySlugFromRemote("https://github.com/tioperfumes07/IH35-TMS.git"),
    "tioperfumes07/IH35-TMS"
  );
  assert.equal(
    repositorySlugFromRemote("git@github.com:tioperfumes07/IH35-TMS.git"),
    "tioperfumes07/IH35-TMS"
  );
});

test("authenticated live effective rule with exact GitHub Actions integration permits capability", () => {
  const live = loadLiveRequiredStatusChecks(".", DECLARATIONS, {
    run: sequence(
      result({ stdout: "https://github.com/tioperfumes07/IH35-TMS.git\n" }),
      result({
        stdout: JSON.stringify([
          {
            type: "required_status_checks",
            parameters: {
              required_status_checks: [
                { context: "hold-merge-gate", integration_id: 15368 },
              ],
            },
          },
        ]),
      })
    ),
  });
  assert.deepEqual([...live.requiredContexts], [CONTEXT]);
  assert.deepEqual(live.errors, {});
});

test("wrong integration cannot self-attest the trusted hold context", () => {
  const live = loadLiveRequiredStatusChecks(".", DECLARATIONS, {
    run: sequence(
      result({ stdout: "git@github.com:tioperfumes07/IH35-TMS.git\n" }),
      result({
        stdout: JSON.stringify([
          {
            type: "required_status_checks",
            parameters: {
              required_status_checks: [
                { context: "hold-merge-gate", integration_id: 99999 },
              ],
            },
          },
        ]),
      })
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
        result({ stdout: "https://github.com/tioperfumes07/IH35-TMS.git\n" }),
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
      result({ stdout: "https://github.com/tioperfumes07/IH35-TMS.git\n" }),
      result({ stdout: "{\"not\":\"an array\"}" })
    ),
  });
  assert.deepEqual([...live.requiredContexts], []);
  assert.match(live.errors["pull-request-metadata"], /invalid JSON/);
});
