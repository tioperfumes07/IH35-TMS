BEGIN;

CREATE TABLE IF NOT EXISTS catalogs.dispatcher_error_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  label text NOT NULL,
  description text,
  event_type text NOT NULL CHECK (
    event_type IN (
      'customer_complaint',
      'missed_appointment',
      'unpaid_invoice_responsibility',
      'abandoned_load_dispatcher_fault',
      'rate_below_threshold_unjustified',
      'driver_complaint_validated',
      'commendation',
      'training_required',
      'policy_violation',
      'other'
    )
  ),
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'severe')),
  is_active boolean NOT NULL DEFAULT true,
  deactivated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid,
  updated_by_user_id uuid
);

COMMENT ON TABLE catalogs.dispatcher_error_reasons IS 'Catalog of categorized reasons for dispatcher safety events. Admin-editable. Each reason is associated with a specific event_type and carries a severity level.';

CREATE INDEX IF NOT EXISTS idx_dispatcher_error_reasons_type
  ON catalogs.dispatcher_error_reasons (event_type, severity)
  WHERE is_active = true AND deactivated_at IS NULL;

INSERT INTO catalogs.dispatcher_error_reasons (code, label, description, event_type, severity) VALUES
  ('cust_unprofessional_communication', 'Unprofessional communication with customer', 'Customer reported rude or unprofessional behavior from dispatcher', 'customer_complaint', 'warning'),
  ('cust_ignored_call_or_email', 'Ignored customer call or email', 'Customer reports unanswered communications resulting in operational delay', 'customer_complaint', 'warning'),
  ('cust_misinformation_provided', 'Provided misinformation to customer', 'Dispatcher gave inaccurate ETA, status, or commitment to customer', 'customer_complaint', 'severe'),
  ('missed_pickup_no_notification', 'Missed pickup window without notification', 'Driver did not arrive in pickup window and dispatcher did not notify customer', 'missed_appointment', 'severe'),
  ('missed_delivery_no_notification', 'Missed delivery window without notification', 'Driver missed delivery window and dispatcher did not notify customer', 'missed_appointment', 'severe'),
  ('appointment_scheduling_error', 'Appointment scheduling error', 'Dispatcher booked appointment outside customer-required window', 'missed_appointment', 'warning'),
  ('broker_authority_not_verified', 'Booked broker without verifying authority', 'Dispatcher booked load with broker whose MC authority was lapsed/revoked', 'unpaid_invoice_responsibility', 'severe'),
  ('credit_limit_exceeded_unauthorized', 'Exceeded customer credit limit without authorization', 'Booked load that pushed customer over credit limit without owner approval', 'unpaid_invoice_responsibility', 'warning'),
  ('inadequate_driver_tracking', 'Inadequate driver tracking', 'Dispatcher failed to maintain regular check-ins; driver disappeared undetected', 'abandoned_load_dispatcher_fault', 'severe'),
  ('ignored_driver_distress_signals', 'Ignored driver distress communications', 'Driver communicated issues that dispatcher dismissed; led to abandonment', 'abandoned_load_dispatcher_fault', 'severe'),
  ('rate_below_minimum_no_justification', 'Booked below minimum rate without justification', 'Booked load below configured minimum rate threshold without entering justification', 'rate_below_threshold_unjustified', 'warning'),
  ('repeated_low_rate_pattern', 'Pattern of low-rate bookings', 'Dispatcher consistently books at or below threshold rates', 'rate_below_threshold_unjustified', 'severe'),
  ('discriminatory_assignment', 'Discriminatory load assignment validated', 'Driver complaint of discriminatory load assignment investigated and validated', 'driver_complaint_validated', 'severe'),
  ('retaliatory_assignment', 'Retaliatory assignment validated', 'Driver complaint of retaliatory bad assignments validated', 'driver_complaint_validated', 'severe'),
  ('unfair_load_distribution', 'Unfair load distribution', 'Driver complaint of unfair load distribution patterns validated', 'driver_complaint_validated', 'warning'),
  ('exceptional_customer_service', 'Exceptional customer service', 'Customer commended dispatcher for outstanding service', 'commendation', 'info'),
  ('crisis_management', 'Excellent crisis management', 'Dispatcher handled operational crisis (accident, weather, etc.) exceptionally', 'commendation', 'info'),
  ('high_margin_booking_skill', 'High-margin booking skill', 'Dispatcher consistently books high-margin loads', 'commendation', 'info'),
  ('training_pcmiler', 'PC*MILER training needed', 'Dispatcher needs training on PC*MILER routing system', 'training_required', 'info'),
  ('training_qbo_workflow', 'QBO workflow training needed', 'Dispatcher needs training on QuickBooks-related workflows', 'training_required', 'info'),
  ('training_compliance', 'Compliance training needed', 'Dispatcher needs DOT/FMCSA compliance training', 'training_required', 'warning'),
  ('unauthorized_rate_negotiation', 'Unauthorized rate negotiation', 'Dispatcher negotiated rate without owner authorization', 'policy_violation', 'severe'),
  ('after_hours_unauthorized_booking', 'After-hours unauthorized booking', 'Dispatcher booked load outside authorized hours without approval', 'policy_violation', 'warning'),
  ('confidential_info_disclosure', 'Disclosed confidential information', 'Dispatcher shared internal rates, customer info, or driver pay externally', 'policy_violation', 'severe'),
  ('other_specify', 'Other (specify in details)', 'Catch-all for events not fitting predefined reasons', 'other', 'info')
ON CONFLICT (code) DO NOTHING;

GRANT SELECT, INSERT, UPDATE ON catalogs.dispatcher_error_reasons TO ih35_app;
ALTER TABLE catalogs.dispatcher_error_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogs.dispatcher_error_reasons FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS der_select_owner_admin ON catalogs.dispatcher_error_reasons;
CREATE POLICY der_select_owner_admin ON catalogs.dispatcher_error_reasons
  FOR SELECT TO ih35_app
  USING (
    identity.current_user_role() IN ('Owner', 'Administrator')
    OR identity.is_lucia_bypass()
  );

DROP POLICY IF EXISTS der_modify_owner_only ON catalogs.dispatcher_error_reasons;
CREATE POLICY der_modify_owner_only ON catalogs.dispatcher_error_reasons
  FOR ALL TO ih35_app
  USING (identity.current_user_role() = 'Owner' OR identity.is_lucia_bypass())
  WITH CHECK (identity.current_user_role() = 'Owner' OR identity.is_lucia_bypass());

CREATE TABLE IF NOT EXISTS mdata.dispatcher_safety_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatcher_user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (
    event_type IN (
      'customer_complaint',
      'missed_appointment',
      'unpaid_invoice_responsibility',
      'abandoned_load_dispatcher_fault',
      'rate_below_threshold_unjustified',
      'driver_complaint_validated',
      'commendation',
      'training_required',
      'policy_violation',
      'other'
    )
  ),
  event_date date NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'severe')),
  summary text NOT NULL,
  details text,
  error_reason_id uuid REFERENCES catalogs.dispatcher_error_reasons(id) ON DELETE RESTRICT,
  cost_amount numeric(12, 2) CHECK (cost_amount IS NULL OR cost_amount >= 0),
  cost_currency text NOT NULL DEFAULT 'USD',
  cost_recovered_amount numeric(12, 2) CHECK (cost_recovered_amount IS NULL OR cost_recovered_amount >= 0),
  cost_recovery_status text CHECK (
    cost_recovery_status IS NULL
    OR cost_recovery_status IN ('pending', 'partial', 'recovered', 'waived', 'absorbed')
  ),
  related_load_id uuid,
  related_customer_id uuid REFERENCES mdata.customers(id) ON DELETE SET NULL,
  related_driver_id uuid REFERENCES mdata.drivers(id) ON DELETE SET NULL,
  document_ids uuid[],
  dispatcher_email_snapshot text,
  voided_at timestamptz,
  voided_by_user_id uuid,
  void_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid,
  updated_by_user_id uuid,
  CONSTRAINT error_reason_required_for_known_types
    CHECK (event_type IN ('commendation', 'other') OR error_reason_id IS NOT NULL),
  CONSTRAINT cost_recovery_consistency
    CHECK (
      (cost_amount IS NULL AND cost_recovered_amount IS NULL AND cost_recovery_status IS NULL)
      OR (cost_amount IS NOT NULL AND cost_recovery_status IS NOT NULL)
    ),
  CONSTRAINT void_consistency_dispatcher
    CHECK (
      (voided_at IS NULL AND voided_by_user_id IS NULL AND void_reason IS NULL)
      OR (voided_at IS NOT NULL AND voided_by_user_id IS NOT NULL AND void_reason IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_dispatcher_safety_events_user
  ON mdata.dispatcher_safety_events (dispatcher_user_id, event_date DESC);

CREATE INDEX IF NOT EXISTS idx_dispatcher_safety_events_email
  ON mdata.dispatcher_safety_events (lower(dispatcher_email_snapshot))
  WHERE dispatcher_email_snapshot IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dispatcher_safety_events_severe
  ON mdata.dispatcher_safety_events (dispatcher_user_id, severity)
  WHERE severity = 'severe' AND voided_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_dispatcher_safety_events_cost_pending
  ON mdata.dispatcher_safety_events (dispatcher_user_id, cost_recovery_status)
  WHERE cost_recovery_status = 'pending' AND voided_at IS NULL;

COMMENT ON TABLE mdata.dispatcher_safety_events IS 'Permanent append-only safety/accountability events for non-Driver, non-Owner users (primarily dispatchers, but also Administrators, Managers, Safety, Mechanic, Accountant when they make operational errors with money impact). Records cannot be deleted, only voided. Indexed by lowercased email for cross-rehire detection.';
COMMENT ON COLUMN mdata.dispatcher_safety_events.dispatcher_email_snapshot IS 'Email at time of event. Snapshotted for cross-rehire detection (if dispatcher leaves and is rehired with same or similar email).';
COMMENT ON COLUMN mdata.dispatcher_safety_events.cost_amount IS 'Dollar impact of this event. Used by Phase 5 dispatcher payroll for potential deductions.';
COMMENT ON COLUMN mdata.dispatcher_safety_events.related_load_id IS 'Phase 3 placeholder. FK added when loads table exists.';

GRANT SELECT, INSERT, UPDATE ON mdata.dispatcher_safety_events TO ih35_app;
ALTER TABLE mdata.dispatcher_safety_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdata.dispatcher_safety_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dispatcher_se_select ON mdata.dispatcher_safety_events;
CREATE POLICY dispatcher_se_select ON mdata.dispatcher_safety_events
  FOR SELECT TO ih35_app
  USING (
    identity.current_user_role() IN ('Owner', 'Administrator')
    OR identity.is_lucia_bypass()
  );

DROP POLICY IF EXISTS dispatcher_se_insert ON mdata.dispatcher_safety_events;
CREATE POLICY dispatcher_se_insert ON mdata.dispatcher_safety_events
  FOR INSERT TO ih35_app
  WITH CHECK (identity.current_user_role() = 'Owner' OR identity.is_lucia_bypass());

DROP POLICY IF EXISTS dispatcher_se_update ON mdata.dispatcher_safety_events;
CREATE POLICY dispatcher_se_update ON mdata.dispatcher_safety_events
  FOR UPDATE TO ih35_app
  USING (identity.current_user_role() = 'Owner' OR identity.is_lucia_bypass())
  WITH CHECK (identity.current_user_role() = 'Owner' OR identity.is_lucia_bypass());

COMMIT;
