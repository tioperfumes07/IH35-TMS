#!/usr/bin/env node
// SEC-QBO-OAUTH-REDIRECT-URI-CLEARTEXT-LOG (verify-step reserved separately if claimed).
//
// ROOT CAUSE this closes: CodeQL js/clear-text-logging flagged apps/backend/src/integrations/qbo/
// qbo-oauth.service.ts:79/82 (the two console.error/console.info sinks inside logOauthStep) because
// three call sites fed the raw QBO_OAUTH_REDIRECT_URI-derived value into the logged payload —
// including redactedFormMetadata(), a function NAMED "redacted" that logged has_redirect_uri AND
// the raw redirect_uri on adjacent lines, defeating its own purpose. Found while investigating CI
// check failures on an unrelated PR (this file was never touched by that PR's diff) — a pre-existing
// defect on main, fixed here as its own small, root-caused block.
//
// FIX: every logOauthStep payload now carries only has_redirect_uri (boolean presence), matching the
// has_code / has_refresh_token convention already used elsewhere in the same file. The functional
// uses of redirectUri (building the actual OAuth authorize URL / token exchange POST body) are
// untouched — only the LOG payloads changed.
//
// Static source assertion — no DB needed.
import fs from "node:fs";

const FILE = "apps/backend/src/integrations/qbo/qbo-oauth.service.ts";

function fail(msg) {
  console.error(`FAIL verify-qbo-oauth-redirect-uri-not-logged: ${msg}`);
  process.exitCode = 1;
}

function check(src) {
  // Find every logOauthStep(...) call block and assert none of them contains a raw
  // "redirect_uri: <expr>" or bare "redirectUri" shorthand property — only has_redirect_uri is
  // allowed. redactedFormMetadata() itself must also never return a raw redirect_uri field.
  const logCallRe = /logOauthStep\(\s*"(?:info|error)"\s*,\s*\{([\s\S]*?)\}\s*\)/g;
  let match;
  let sawAny = false;
  while ((match = logCallRe.exec(src))) {
    sawAny = true;
    const body = match[1];
    if (/(^|[\s,{])redirect_uri\s*:/.test(body) || /(^|[\s,{])redirectUri\s*[,}]/.test(body)) {
      fail(`a logOauthStep(...) call still passes a raw redirect_uri/redirectUri field: ${body.trim().slice(0, 120)}`);
    }
  }
  if (!sawAny) {
    fail("no logOauthStep(...) calls found — did the logging shape change entirely?");
  }

  const redactedFnMatch = src.match(/function redactedFormMetadata\(form: URLSearchParams\) \{([\s\S]*?)\n\}/);
  if (!redactedFnMatch) {
    fail("redactedFormMetadata() not found — did it get renamed or removed?");
  } else if (/redirect_uri\s*:\s*form\.get/.test(redactedFnMatch[1])) {
    fail("redactedFormMetadata() still returns the raw redirect_uri value alongside its has_redirect_uri flag.");
  }
}

function selftest() {
  const original = fs.readFileSync(FILE, "utf8");
  let probesProven = 0;

  // Mutation 1: reintroduce the raw redirect_uri leak inside redactedFormMetadata.
  {
    const mutated = original.replace(
      'has_redirect_uri: Boolean(form.get("redirect_uri")),\n  };',
      'has_redirect_uri: Boolean(form.get("redirect_uri")),\n    redirect_uri: form.get("redirect_uri"),\n  };'
    );
    if (mutated === original) {
      console.error("SELFTEST SETUP FAILED: redactedFormMetadata pattern not found to mutate.");
      process.exitCode = 1;
      return;
    }
    fs.writeFileSync(FILE, mutated);
    let caught = false;
    try {
      check(mutated);
      caught = process.exitCode === 1;
    } finally {
      process.exitCode = undefined;
      fs.writeFileSync(FILE, original);
    }
    if (!caught) {
      console.error("SELFTEST INERT: reintroducing the redactedFormMetadata leak was not caught.");
      process.exitCode = 1;
      return;
    }
    probesProven++;
  }

  // Mutation 2: reintroduce a raw redirect_uri field in the buildAuthorizationUrl log call.
  {
    const mutated = original.replace(
      'has_redirect_uri: Boolean(redirectUri),\n    clientIdPrefix: clientIdPrefix(),',
      'redirect_uri: redirectUri,\n    clientIdPrefix: clientIdPrefix(),'
    );
    if (mutated === original) {
      console.error("SELFTEST SETUP FAILED: buildAuthorizationUrl log pattern not found to mutate.");
      process.exitCode = 1;
      return;
    }
    fs.writeFileSync(FILE, mutated);
    let caught = false;
    try {
      check(mutated);
      caught = process.exitCode === 1;
    } finally {
      process.exitCode = undefined;
      fs.writeFileSync(FILE, original);
    }
    if (!caught) {
      console.error("SELFTEST INERT: reintroducing the buildAuthorizationUrl leak was not caught.");
      process.exitCode = 1;
      return;
    }
    probesProven++;
  }

  console.log(`PASS verify-qbo-oauth-redirect-uri-not-logged --selftest (mutation probes proven non-inert: ${probesProven})`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  check(fs.readFileSync(FILE, "utf8"));
  if (process.exitCode !== 1) {
    console.log("PASS verify-qbo-oauth-redirect-uri-not-logged");
  }
}
