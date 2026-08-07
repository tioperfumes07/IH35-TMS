# Account security and passwords

Office users authenticate to IH 35 Dispatch with individual accounts. Protect Owner/Admin accounts as carefully as banking logins.

## Overview
- Sign-in is per user; roles are assigned by Owner/Admin under **Users**.
- Password and session rules follow the deployed auth provider (reset flows, session expiry).
- Sensitive modules (complaints, voids, factor deactivate) require elevated roles and produce audit events.

## Key tasks
- Use a unique password; reset via the login “forgot password” flow when locked out.
- Owner: review user list periodically; deactivate departed staff instead of sharing logins.
- Prefer one person per account — shared Owner passwords break auditability.
- Report suspicious access immediately; do not disable audit logging.

## Tips & gotchas
- Driver App credentials are not the same as office users.
- Operating-company switcher does not elevate role — it only changes entity scope.
- MFA / SSO features, when enabled in your environment, should stay on for Owner accounts.
