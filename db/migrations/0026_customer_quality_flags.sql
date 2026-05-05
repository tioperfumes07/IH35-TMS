BEGIN;

ALTER TABLE mdata.customers
  ADD COLUMN IF NOT EXISTS quality_overall_flag TEXT NOT NULL DEFAULT 'standard'
    CHECK (quality_overall_flag IN ('preferred', 'standard', 'caution', 'avoid')),
  ADD COLUMN IF NOT EXISTS quality_payment_score NUMERIC(5, 2)
    CHECK (quality_payment_score IS NULL OR (quality_payment_score >= 0 AND quality_payment_score <= 100)),
  ADD COLUMN IF NOT EXISTS quality_cancellation_score NUMERIC(5, 2)
    CHECK (quality_cancellation_score IS NULL OR (quality_cancellation_score >= 0 AND quality_cancellation_score <= 100)),
  ADD COLUMN IF NOT EXISTS quality_disputes_count INT NOT NULL DEFAULT 0
    CHECK (quality_disputes_count >= 0),
  ADD COLUMN IF NOT EXISTS quality_last_evaluated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS quality_notes TEXT,
  ADD COLUMN IF NOT EXISTS credit_limit_source TEXT
    CHECK (credit_limit_source IS NULL OR credit_limit_source IN ('factor', 'manual', 'rmis_future')),
  ADD COLUMN IF NOT EXISTS credit_limit_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN mdata.customers.quality_overall_flag IS 'Owner-set overall quality classification. preferred = strategic customer; standard = neutral; caution = book carefully, watch closely; avoid = no new loads without owner approval. Default standard for new customers.';
COMMENT ON COLUMN mdata.customers.quality_payment_score IS 'Computed score 0-100 derived from late_payment + non_payment events. 100 = always pays on time. Computed by Phase 6 reports; null = not yet evaluated.';
COMMENT ON COLUMN mdata.customers.quality_cancellation_score IS 'Computed score 0-100 derived from load_cancelled events. 100 = never cancels. Computed by Phase 6 reports; null = not yet evaluated.';
COMMENT ON COLUMN mdata.customers.quality_disputes_count IS 'Rolling 12-month count of dispute events (lumper_dispute, detention_dispute, tonu_dispute, rate_dispute, damage_claim). Updated whenever new dispute event added.';
COMMENT ON COLUMN mdata.customers.quality_last_evaluated_at IS 'Last time aggregate quality scores were computed. Phase 6 reports update this.';
COMMENT ON COLUMN mdata.customers.credit_limit_source IS 'Source of credit_limit value. factor = set by factoring company (refreshed from daily report); manual = Owner-set; rmis_future = placeholder for Phase 6 RMIS integration. NULL when credit_limit is also NULL.';
COMMENT ON COLUMN mdata.customers.credit_limit_updated_at IS 'When credit_limit was last updated. Used to detect stale limits (factor refresh missed, manual entry not refreshed).';

CREATE INDEX IF NOT EXISTS idx_customers_quality_flag
  ON mdata.customers (quality_overall_flag, deactivated_at)
  WHERE deactivated_at IS NULL;

CREATE TABLE IF NOT EXISTS catalogs.customer_quality_event_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'late_payment',
      'non_payment',
      'lumper_dispute',
      'detention_dispute',
      'tonu_dispute',
      'load_cancelled',
      'rate_dispute',
      'damage_claim',
      'commendation',
      'other'
    )
  ),
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'severe')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  deactivated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id UUID,
  updated_by_user_id UUID
);

COMMENT ON TABLE catalogs.customer_quality_event_reasons IS 'Catalog of categorized reasons per customer quality event type. Admin-editable. Severity drives reporting and dispatcher visibility.';

CREATE INDEX IF NOT EXISTS idx_customer_quality_reasons_type
  ON catalogs.customer_quality_event_reasons (event_type, severity)
  WHERE is_active = true AND deactivated_at IS NULL;

INSERT INTO catalogs.customer_quality_event_reasons (code, label, description, event_type, severity) VALUES
  ('payment_late_under_15_days', 'Paid 1-15 days late', 'Invoice paid 1-15 days past due date', 'late_payment', 'info'),
  ('payment_late_15_to_30_days', 'Paid 15-30 days late', 'Invoice paid 15-30 days past due date', 'late_payment', 'warning'),
  ('payment_late_over_30_days', 'Paid 30+ days late', 'Invoice paid more than 30 days past due date', 'late_payment', 'severe'),
  ('non_payment_disputing', 'Non-payment, dispute pending', 'Invoice unpaid, customer disputing', 'non_payment', 'severe'),
  ('non_payment_no_response', 'Non-payment, no response', 'Invoice unpaid, customer not responding to collection', 'non_payment', 'severe'),
  ('lumper_refused', 'Refused to pay lumper fee', 'Customer refused to reimburse lumper fee paid by carrier', 'lumper_dispute', 'warning'),
  ('lumper_partial_payment', 'Partial payment on lumper fee', 'Customer paid partial lumper fee', 'lumper_dispute', 'info'),
  ('detention_refused', 'Refused detention claim', 'Customer refused to pay valid detention charge', 'detention_dispute', 'warning'),
  ('detention_partial_payment', 'Partial detention payment', 'Customer paid partial detention amount', 'detention_dispute', 'info'),
  ('tonu_refused', 'Refused TONU charge', 'Customer refused to pay TONU (Truck Order Not Used) when load cancelled after dispatch', 'tonu_dispute', 'warning'),
  ('cancelled_pre_pickup', 'Cancelled before pickup', 'Customer cancelled load before driver dispatched', 'load_cancelled', 'info'),
  ('cancelled_post_pickup', 'Cancelled after dispatch', 'Customer cancelled load after driver was dispatched', 'load_cancelled', 'severe'),
  ('cancelled_pattern', 'Pattern of cancellations', 'Customer has 3+ cancellations in last 60 days', 'load_cancelled', 'severe'),
  ('rate_disputed_post_delivery', 'Disputed rate after delivery', 'Customer disputed agreed rate after delivery completed', 'rate_dispute', 'warning'),
  ('rate_negotiation_aggressive', 'Aggressive rate negotiation', 'Customer routinely negotiates rates aggressively post-booking', 'rate_dispute', 'info'),
  ('damage_claim_minor', 'Minor damage claim', 'Damage claim under $1000 filed', 'damage_claim', 'warning'),
  ('damage_claim_major', 'Major damage claim', 'Damage claim over $1000 filed', 'damage_claim', 'severe'),
  ('damage_claim_disputed', 'Disputed damage claim', 'Customer filed claim that carrier disputes (e.g., shipper-loaded damage)', 'damage_claim', 'severe'),
  ('paid_early', 'Paid early', 'Customer paid invoice before due date', 'commendation', 'info'),
  ('strategic_relationship', 'Strategic relationship', 'High-value customer with strong operational relationship', 'commendation', 'info'),
  ('high_volume_customer', 'High volume customer', 'Customer consistently provides high freight volume', 'commendation', 'info'),
  ('communication_issues', 'Communication difficulties', 'Customer routinely difficult to reach or unclear in instructions', 'other', 'warning'),
  ('billing_complexity', 'Billing complexity', 'Customer has unusual billing requirements increasing administrative burden', 'other', 'info'),
  ('other_specify', 'Other (specify in details)', 'Catch-all for events not fitting predefined reasons', 'other', 'info')
ON CONFLICT (code) DO NOTHING;

GRANT SELECT, INSERT, UPDATE ON catalogs.customer_quality_event_reasons TO ih35_app;
ALTER TABLE catalogs.customer_quality_event_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogs.customer_quality_event_reasons FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cqer_select_authenticated ON catalogs.customer_quality_event_reasons;
CREATE POLICY cqer_select_authenticated ON catalogs.customer_quality_event_reasons
  FOR SELECT TO ih35_app
  USING (true);

DROP POLICY IF EXISTS cqer_modify_owner_only ON catalogs.customer_quality_event_reasons;
CREATE POLICY cqer_modify_owner_only ON catalogs.customer_quality_event_reasons
  FOR ALL TO ih35_app
  USING (identity.current_user_role() = 'Owner' OR identity.is_lucia_bypass())
  WITH CHECK (identity.current_user_role() = 'Owner' OR identity.is_lucia_bypass());

CREATE TABLE IF NOT EXISTS mdata.customer_quality_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES mdata.customers(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'late_payment',
      'non_payment',
      'lumper_dispute',
      'detention_dispute',
      'tonu_dispute',
      'load_cancelled',
      'rate_dispute',
      'damage_claim',
      'commendation',
      'other'
    )
  ),
  event_date DATE NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'severe')),
  summary TEXT NOT NULL,
  details TEXT,
  reason_id UUID REFERENCES catalogs.customer_quality_event_reasons(id) ON DELETE RESTRICT,
  dollar_impact_amount NUMERIC(12, 2) CHECK (dollar_impact_amount IS NULL OR dollar_impact_amount >= 0),
  dollar_currency TEXT NOT NULL DEFAULT 'USD',
  days_late INT CHECK (days_late IS NULL OR days_late >= 0),
  related_load_id UUID,
  related_invoice_id UUID,
  document_ids UUID[],
  voided_at TIMESTAMPTZ,
  voided_by_user_id UUID,
  void_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id UUID,
  updated_by_user_id UUID,
  CONSTRAINT customer_quality_reason_required_for_known_types
    CHECK (event_type IN ('commendation', 'other') OR reason_id IS NOT NULL),
  CONSTRAINT customer_quality_void_consistency
    CHECK (
      (voided_at IS NULL AND voided_by_user_id IS NULL AND void_reason IS NULL)
      OR (voided_at IS NOT NULL AND voided_by_user_id IS NOT NULL AND void_reason IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_customer_quality_events_customer
  ON mdata.customer_quality_events (customer_id, event_date DESC);

CREATE INDEX IF NOT EXISTS idx_customer_quality_events_severe
  ON mdata.customer_quality_events (customer_id, severity)
  WHERE severity = 'severe' AND voided_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_customer_quality_events_recent
  ON mdata.customer_quality_events (customer_id, event_date)
  WHERE voided_at IS NULL;

COMMENT ON TABLE mdata.customer_quality_events IS 'Permanent append-only customer quality/behavior events. Tracks payment behavior, cancellations, disputes, commendations. Records cannot be deleted, only voided. Used for dispatcher visibility and Phase 6 customer scoring.';

GRANT SELECT, INSERT, UPDATE ON mdata.customer_quality_events TO ih35_app;
ALTER TABLE mdata.customer_quality_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdata.customer_quality_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cqe_select ON mdata.customer_quality_events;
CREATE POLICY cqe_select ON mdata.customer_quality_events
  FOR SELECT TO ih35_app
  USING (
    identity.current_user_role() IN ('Owner', 'Administrator', 'Manager', 'Dispatcher', 'Accountant', 'Safety')
    OR identity.is_lucia_bypass()
  );

DROP POLICY IF EXISTS cqe_insert ON mdata.customer_quality_events;
CREATE POLICY cqe_insert ON mdata.customer_quality_events
  FOR INSERT TO ih35_app
  WITH CHECK (identity.current_user_role() = 'Owner' OR identity.is_lucia_bypass());

DROP POLICY IF EXISTS cqe_update ON mdata.customer_quality_events;
CREATE POLICY cqe_update ON mdata.customer_quality_events
  FOR UPDATE TO ih35_app
  USING (identity.current_user_role() = 'Owner' OR identity.is_lucia_bypass())
  WITH CHECK (identity.current_user_role() = 'Owner' OR identity.is_lucia_bypass());

UPDATE mdata.customers
SET credit_limit_source = 'manual',
    credit_limit_updated_at = now()
WHERE credit_limit IS NOT NULL
  AND credit_limit_source IS NULL;

COMMIT;
