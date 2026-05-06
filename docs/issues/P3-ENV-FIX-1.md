# P3-ENV-FIX-1: db:verify:phone-auth requires Twilio env vars locally

## Status
Pre-existing local-env gap. Discovered during P3-T11.5 cross-check.

## Reproduction
npm run db:verify:phone-auth
Error: missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID

## Cause
The verify script requires real Twilio credentials. They exist in Render production env but not in local .env.

## Fix sketch
Either:
(a) Add a SKIP_PHONE_AUTH_TESTS=1 env var that the verify script checks and short-circuits on, OR
(b) Add a sandbox-Twilio fixture mode using mocked HTTP responses, OR
(c) Document the required local env vars in README and provide a sandbox account.

## Priority
P2 — local DX issue, does not block deploys (Render has the creds).

## Owner
TBD.
