-- PWA-POLISH-2: push subscription ack + delivery timestamps (additive on 0161).
BEGIN;

ALTER TABLE driver_pwa.push_subscriptions
  ADD COLUMN IF NOT EXISTS subscribed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_received_ack_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

UPDATE driver_pwa.push_subscriptions
SET subscribed_at = COALESCE(subscribed_at, created_at, now())
WHERE subscribed_at IS NULL;

COMMIT;
