-- FUEL-07 — seed the full IFTA member jurisdiction set into catalogs.fuel_tax_jurisdictions.
--
-- ROOT CAUSE: the IFTA jurisdiction master catalog is EMPTY on prod — verified 2026-07-28 under
-- set_config('app.bypass_rls','lucia',true): n_live_tup = 0 AND count(*) = 0 for
-- catalogs.fuel_tax_jurisdictions (a genuine zero, read two independent ways, not an RLS mask).
-- Only five sample states were ever specified (0067), and they are not present either. An IFTA
-- quarterly return is filed against the member-jurisdiction set; with an empty catalog no filable
-- return can be produced for any entity.
--
-- STANDARD (IFTA, Inc. — iftach.org): the International Fuel Tax Agreement has 58 member
-- jurisdictions — the 48 contiguous US states plus 10 Canadian provinces. Deliberately EXCLUDED
-- because they are NOT IFTA members: Alaska, Hawaii, District of Columbia, and the three Canadian
-- territories (Yukon, Northwest Territories, Nunavut). Seeding a non-member would be as wrong as
-- omitting a member: it would offer a jurisdiction that cannot legally appear on a return. This
-- matches how McLeod and Alvys carry the IFTA jurisdiction set.
--
-- SCOPE: reference data only. This seeds the jurisdiction LIST. IFTA tax RATES change quarterly and
-- are a separate concern — nothing here implies a rate.
--
-- SAFETY: additive and idempotent. ON CONFLICT (operating_company_id, code) DO NOTHING preserves any
-- row that already exists, including 0067's five if they are ever restored. No DELETE, no TRUNCATE,
-- no UPDATE of an existing row. Companies are resolved dynamically from org.companies — no hardcoded
-- UUIDs. catalogs.fuel_tax_jurisdictions is FORCE-RLS, so app.operating_company_id is set LOCAL per
-- company before that company's insert; this lands correctly whether or not the applying role
-- bypasses RLS.

DO $$
DECLARE
  v_company        record;
  v_us_codes       text[] := ARRAY[
    'AL','AR','AZ','CA','CO','CT','DE','FL','GA','IA','ID','IL','IN','KS','KY','LA','MA','MD',
    'ME','MI','MN','MO','MS','MT','NC','ND','NE','NH','NJ','NM','NV','NY','OH','OK','OR','PA',
    'RI','SC','SD','TN','TX','UT','VA','VT','WA','WI','WV','WY'
  ];
  v_us_names       text[] := ARRAY[
    'Alabama','Arkansas','Arizona','California','Colorado','Connecticut','Delaware','Florida',
    'Georgia','Iowa','Idaho','Illinois','Indiana','Kansas','Kentucky','Louisiana','Massachusetts',
    'Maryland','Maine','Michigan','Minnesota','Missouri','Mississippi','Montana','North Carolina',
    'North Dakota','Nebraska','New Hampshire','New Jersey','New Mexico','Nevada','New York','Ohio',
    'Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee',
    'Texas','Utah','Virginia','Vermont','Washington','Wisconsin','West Virginia','Wyoming'
  ];
  v_ca_codes       text[] := ARRAY['AB','BC','MB','NB','NL','NS','ON','PE','QC','SK'];
  v_ca_names       text[] := ARRAY[
    'Alberta','British Columbia','Manitoba','New Brunswick','Newfoundland and Labrador',
    'Nova Scotia','Ontario','Prince Edward Island','Quebec','Saskatchewan'
  ];
  i                int;
  v_seeded         int := 0;
BEGIN
  -- Fail loudly rather than silently seeding a wrong-length set. 48 + 10 = the 58 IFTA members.
  IF array_length(v_us_codes, 1) <> 48 OR array_length(v_us_names, 1) <> 48 THEN
    RAISE EXCEPTION 'FUEL-07: US jurisdiction arrays must both be 48 (got % codes, % names)',
      array_length(v_us_codes, 1), array_length(v_us_names, 1);
  END IF;
  IF array_length(v_ca_codes, 1) <> 10 OR array_length(v_ca_names, 1) <> 10 THEN
    RAISE EXCEPTION 'FUEL-07: Canadian jurisdiction arrays must both be 10 (got % codes, % names)',
      array_length(v_ca_codes, 1), array_length(v_ca_names, 1);
  END IF;

  FOR v_company IN
    SELECT id FROM org.companies WHERE COALESCE(is_active, true) ORDER BY id
  LOOP
    -- FORCE RLS: scope this company's inserts so the WITH CHECK policy is satisfied.
    PERFORM set_config('app.operating_company_id', v_company.id::text, true);

    FOR i IN 1..48 LOOP
      INSERT INTO catalogs.fuel_tax_jurisdictions
        (operating_company_id, code, display_name, metadata, is_active, sort_order)
      VALUES (
        v_company.id,
        'US-' || v_us_codes[i],
        v_us_names[i],
        jsonb_build_object('jurisdiction_code', v_us_codes[i], 'country', 'US'),
        true,
        i * 10
      )
      ON CONFLICT (operating_company_id, code) DO NOTHING;
      v_seeded := v_seeded + 1;
    END LOOP;

    FOR i IN 1..10 LOOP
      INSERT INTO catalogs.fuel_tax_jurisdictions
        (operating_company_id, code, display_name, metadata, is_active, sort_order)
      VALUES (
        v_company.id,
        'CA-' || v_ca_codes[i],
        v_ca_names[i],
        jsonb_build_object('jurisdiction_code', v_ca_codes[i], 'country', 'CA'),
        true,
        480 + (i * 10)
      )
      ON CONFLICT (operating_company_id, code) DO NOTHING;
      v_seeded := v_seeded + 1;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'FUEL-07: attempted % jurisdiction rows across active companies', v_seeded;
END
$$;
