# Per-Load Dispatch Chat — Design & Build Plan

**Status:** DESIGN / build-and-hold. The CHAT-1 schema is a migration → §1.3 Jorge merge gate.

> **RECONCILED 2026-07-01 to the CHAT-1 build directive (authoritative).** The migration
> `db/migrations/202607012000_chat_dispatch_schema.sql` is now the source of truth for the schema;
> §6 below is the superseded draft, kept for history. Four corrections were applied to the draft:
> 1. **Hash-chain** — NO `prev_hash`/`hash` columns on `chat.*`; each event emits into
>    `events.event_log` via `events.log_event()` (auto-chained by `events.event_log_append_only_trigger`),
>    with `chat.messages.event_log_id` as the forward trace. (`subject_type` CHECK excludes
>    'message' → CHAT-2 emits `subject_type='load'/'driver'`, `message_id` in payload — no spine ALTER.)
> 2. **Participants + two-layer RLS** — added `chat.participants`; RLS is entity **AND** participant
>    membership (a driver sees only threads they're in). The draft's entity-only policy was a leak.
> 3. **Real FKs** — `cash_advance_request_id → driver_finance.cash_advance_requests(id)` and
>    `attachments.document_id → docs.files(id)` (which carries `dispatch_load_id → mdata.loads`), both
>    `ON DELETE RESTRICT`.
> 4. **Thread kinds** — `load | driver_direct | broadcast` (no `office` kind; office-internal stays in
>    the existing Task Team Chat, never in the driver-facing store).
>
> Verified live (not guessed): `identity.users(id)` [uuid→id renamed in 0005], `org.companies(id)`,
> `mdata.loads(id)`, `mdata.drivers(id)` + `idx_drivers_identity_user_id`, `docs.files.dispatch_load_id`,
> `identity.set_updated_at()`, RLS helpers. CI guard `verify:chat-schema-integrity` locks all four.

**Owner intent (Jorge, 2026-07-01, verbatim):** the "chat" is the office↔driver dispatch
channel. Office↔office AND office↔driver via the driver app. Send dispatch confirmations there;
drivers send BOL photos there; "send anything." **One chat per LOAD, numbered = the load**, so
each thread archives with the driver and stays short (no huge long-running chats). In the same
thread the driver can request a cash advance, etc. Plus: **push notifications + LOUD, can't-ignore
alerts like WhatsApp**, for the chat and app-wide, so drivers really hear and don't ignore.

---

## 1. Why it feels "not operational" today

Two partial pieces exist; **neither is the per-load dispatch chat**:

1. **Task Team Chat** — `/tasks/chat` (TASK-3, PR #1726, on main). Per-task comment threads +
   @mention + activity, gated behind a ±45-day task picker. No driver, no load, no attachments.
   Open it fresh → empty picker → reads as broken.
2. **Flat driver inbox** — backend `drivers/messages.{routes,service}.ts` + `mdata/driver-messages.routes.ts`;
   PWA `pages/Messages.tsx` + `api/messages.ts`; `GET/POST /api/v1/driver/messages`. A flat
   per-driver stream + reply. Not load-scoped; no in-thread photos, cash-advance, or office UI.

So the plumbing for messaging exists, but the load-scoped dispatch chat was never built.

## 2. Reuse map (build ON these — do not rebuild)

| Need | Reuse |
|---|---|
| Cash-advance in-thread | `driver-finance/cash-advance-requests.{routes,service}.ts` + PWA `CashAdvanceNewPage` (posting stays in existing gated flow) |
| BOL/POD photo → R2 | PWA `PodCapture.tsx`, `UploadDocumentModal.tsx`, pre/post-trip `PhotoCapture`; R2 bucket `ih35-tms-evidence` |
| Push transport | `driver-pwa/notifications/web-push-subscriber.ts` + `notification-handler.ts`; SW `push`/`notificationclick`; backend `driver/push-subscriptions.routes.ts` |
| Message transport | flat `driver-messages` (extend with `load_id` threading) |
| Thread key | `mdata.loads` (`id` PK, `load_number` unique per opco) — participant = `assigned_primary_driver_id` |
| Tamper-evidence | audit hash-chain pattern (`202606111051` events.event_log `prev_hash`/`hash` sha256) |

## 3. Trust & "never lose a detail" requirements

This channel holds **legal-evidence BOLs, money requests, and dispatch instructions** for a
cross-border carrier. Non-negotiables (⚙ = must be in the CHAT-1 schema from day one):

- **⚙ Server-authoritative per-thread sequence** (`seq`) — client can prove no gaps; messages
  never silently reorder or drop.
- **⚙ Offline outbox + idempotency key** (driver PWA) — drivers lose signal to Mexico / at truck
  stops; queue message+photo locally, send on reconnect, idempotency key prevents dup/loss.
  *The single most important durability item.*
- **⚙ Upload-then-commit attachments** — photo written to R2 (content-addressed sha256) and
  confirmed BEFORE the message row commits. No "sent but the picture is gone."
- **⚙ Delivery state** `sent → delivered → read` (server-stamped) — office knows the driver saw
  the confirmation.
- **⚙ Append-only + tombstone** (void-not-delete, §2) — "unsend" leaves a visible tombstone;
  original retained. Nobody quietly rewrites history.
- **⚙ Hash-chain per thread** (`prev_hash`/`hash`) — whole conversation tamper-evident for
  disputes/claims.
- **⚙ Acknowledged confirmations** — driver must explicitly ACK a dispatch confirmation; identity
  + server timestamp recorded = proof of instruction received.
- **⚙ Structured message types** (`text | photo | confirmation | cash_advance | system`) — details
  are queryable, not buried in free text.
- **⚙ FK-bound cash-advance** — in-thread request links to both the real `cash_advance_requests`
  row and the message; always traceable both directions.
- **Server timestamps only** (Central Time), never client clocks.
- **Strict participant RLS** — a driver sees only their own load's thread; entity-scoped
  (`operating_company_id`) so USMCA launch can't cross-leak.
- **Dual-file BOL** — photo lands in the chat AND auto-files to the load's documents.
- **Attachment allowlist + size cap** (images/PDF).

## 4. Notifications & loud, can't-ignore alerts

Three tiers + an escalation spine:

1. **Foreground (app open) — full WhatsApp-grade, buildable now:** Web Audio looping siren +
   continuous vibration + full-screen takeover that won't dismiss until the driver taps
   **Acknowledge**.
2. **Background push (app closed):** enhance the existing SW notification —
   `requireInteraction:true`, `renotify:true`, `vibrate`, high-priority tag.
3. **Escalation-until-acknowledged:** unacked dispatch confirmation / new-load / cash-advance
   alert re-fires after N minutes (louder/repeat) and can notify a second contact or the office.
   Tracked server-side (delivery/ack model in §3) so nothing is silently missed.

### The honest hard limit (architecture fork — surface, don't paper over)

A pure PWA **cannot** play a loud, looping, override-silent-mode alarm when the phone is locked or
on silent — especially **iOS** (installed-PWA push uses the *system* sound at *system* volume and
respects silent/DND). WhatsApp does "loud even on silent" via **native critical-alert entitlements
(iOS) / full-screen high-priority notifications (Android)** — native-only.

- **Path A — PWA only (fast):** tier-1 foreground + best-effort background. Ships on existing
  infra. Locked+silent iOS driver gets a *soft* notification, not a siren. Not truly can't-ignore.
- **Path B — Capacitor wrapper (the real answer):** wrap the *existing* PWA in Capacitor (reuses
  ~all the web code), add native FCM/APNs + iOS **critical alerts** + Android full-screen intents +
  custom looping sounds. Cost: native build tooling, Apple critical-alert entitlement request,
  fleet install path (Android APK/MDM easy; iOS = App Store/enterprise/TestFlight).

**Recommendation:** do both in order — ship Path A now, stand up Path B as the real notification
backbone, because for a carrier a missed dispatch confirmation = a missed load, and "can't ignore"
was the explicit requirement. **OPEN DECISION for Jorge: commit to Path B (native wrapper)?**

## 5. Block plan

| Block | Scope | Gate |
|---|---|---|
| **CHAT-1** | `chat` schema: `load_threads` + `messages` + `attachments` + `receipts` + `acks`; RLS FORCE + policies; grants; hash-chain trigger | **Migration → Jorge merge gate. Build-and-hold.** |
| CHAT-2 | Backend: thread get-or-create, list, post message, attach (R2 presign upload-then-commit), delivery/read receipts, ack | rides on CHAT-1 |
| CHAT-3 | Office UI (apps/frontend): load-chat panel off Load Detail + a dispatch chat hub | non-financial |
| CHAT-4 | Driver PWA: per-load chat in `LoadDetail` + BOL photo attach (reuse `PodCapture`) + **offline outbox** | non-financial |
| CHAT-5 | In-thread **Request Cash Advance** (reuse existing flow) + confirmation cards + driver ACK | money path = §1.4 careful |
| CHAT-6 | Archive thread on load close (void-not-delete), retention, archived-thread search | non-financial |
| **NOTIF-A** | Loud foreground alerts + escalation-until-ack + enhanced background web-push | non-financial |
| **NOTIF-B** | Capacitor native wrapper + critical alerts (only if Path B) | native/app-store |

Transport v1 = **polling** (react-query interval) — deliberately avoids the known app-wide SSE
MIME bug; WS/SSE later. Everything depends on the CHAT-1 migration, so v1 is effectively gated
behind Jorge merging the schema.

## 6. CHAT-1 schema — SUPERSEDED DRAFT (authoritative schema = the migration; see RECONCILED note above)

Conventions carried from §2/§4: schema `chat.*`; UUIDv7-style server PKs (`gen_random_uuid()` until
UUIDv7 helper confirmed); `operating_company_id` on every table + RLS **ENABLE + FORCE** with the
canonical `identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true)`
policy; GRANTs to `ih35_app` (new schema → also DEFAULT PRIVILEGES); `is_active` + audit; idempotent
(`IF NOT EXISTS`). Views (if any) `security_invoker=true`.

```sql
-- chat.load_threads — one per load (number = load). A nullable load_id allows a "general" thread.
CREATE SCHEMA IF NOT EXISTS chat;
CREATE TABLE IF NOT EXISTS chat.load_threads (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  UUID NOT NULL,
  load_id               UUID REFERENCES mdata.loads(id) ON DELETE RESTRICT, -- NULL = general thread
  thread_kind           TEXT NOT NULL DEFAULT 'load'
                          CHECK (thread_kind IN ('load','general','office')),
  thread_number         TEXT,            -- mirrors mdata.loads.load_number for load threads
  status                TEXT NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open','archived')),
  archived_at           TIMESTAMPTZ,     -- set when the load closes (void-not-delete)
  last_seq              BIGINT NOT NULL DEFAULT 0,   -- server-authoritative high-water mark
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, load_id)             -- one thread per load per entity
);

-- chat.messages — append-only, sequenced, hash-chained, tombstone-able.
CREATE TABLE IF NOT EXISTS chat.messages (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  UUID NOT NULL,
  thread_id             UUID NOT NULL REFERENCES chat.load_threads(id) ON DELETE RESTRICT,
  seq                   BIGINT NOT NULL,             -- per-thread monotonic (server-assigned)
  message_type          TEXT NOT NULL DEFAULT 'text'
                          CHECK (message_type IN ('text','photo','confirmation','cash_advance','system')),
  sender_user_id        UUID,                        -- office author (identity.users.id) or NULL for system
  sender_driver_id      UUID,                        -- driver author (mdata.drivers.id)
  body                  TEXT,
  payload               JSONB,                       -- structured type-specific data (confirmation, cash_advance)
  cash_advance_request_id UUID,                      -- FK-bound when message_type='cash_advance'
  tombstoned_at         TIMESTAMPTZ,                 -- "unsend" — original retained, visible tombstone
  prev_hash             TEXT,                        -- hash chain (tamper-evident)
  hash                  TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),  -- server clock only
  idempotency_key       TEXT,                        -- client-supplied; dedup offline-outbox retries
  UNIQUE (thread_id, seq),
  UNIQUE (operating_company_id, idempotency_key)     -- retry-safe, no dup on flaky connection
);

-- chat.attachments — content-addressed, upload-then-commit (row exists only after R2 confirms).
CREATE TABLE IF NOT EXISTS chat.attachments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  UUID NOT NULL,
  message_id            UUID NOT NULL REFERENCES chat.messages(id) ON DELETE RESTRICT,
  r2_key                TEXT NOT NULL,               -- ih35-tms-evidence object key
  sha256                TEXT NOT NULL,               -- content address (dedup + integrity)
  content_type          TEXT NOT NULL,               -- allowlist: image/*, application/pdf
  byte_size             BIGINT NOT NULL,
  filed_document_id     UUID,                        -- dual-file: link to the load's documents row
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- chat.receipts — delivery/read state per (message, recipient).
CREATE TABLE IF NOT EXISTS chat.receipts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  UUID NOT NULL,
  message_id            UUID NOT NULL REFERENCES chat.messages(id) ON DELETE RESTRICT,
  recipient_user_id     UUID,
  recipient_driver_id   UUID,
  delivered_at          TIMESTAMPTZ,
  read_at               TIMESTAMPTZ,
  UNIQUE (message_id, recipient_user_id, recipient_driver_id)
);

-- chat.acks — explicit acknowledgements (confirmations, loud alerts) = non-repudiation proof.
CREATE TABLE IF NOT EXISTS chat.acks (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  UUID NOT NULL,
  message_id            UUID NOT NULL REFERENCES chat.messages(id) ON DELETE RESTRICT,
  ack_user_id           UUID,
  ack_driver_id         UUID,
  acked_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  escalation_count      INT NOT NULL DEFAULT 0,      -- how many re-fires before ack
  UNIQUE (message_id, ack_user_id, ack_driver_id)
);
```
*(RLS ENABLE+FORCE + canonical policy + GRANTs + hash-chain trigger + audit wiring are omitted from
this sketch for readability and will be in the actual migration — this is the shape for review.)*

## 7. Open decisions for Jorge

1. **Path B (native Capacitor wrapper)** for true loud alerts — commit now, or ship Path A first?
2. **General/office thread** — one general thread alongside per-load threads (recommended), or keep
   office↔office in a fully separate space?
3. **Thread auto-create** — at dispatch/booking, or lazily on first message? (recommended: lazy)
4. Anything to drop/add from §3 trust items or §5 blocks.

**Recommended defaults if silent:** Path A now + plan Path B; general thread + lazy-create; all §3
items in CHAT-1.
