-- FORM425C-PROFILE-PETITION-DATE-WIPED: Profiles & Defaults collects petition date in the UI
-- (required to Create / Load Draft) but catalogs.form_425c_company_profiles had no column and
-- GET/POST omitted it. Save Defaults then invalidated the profile query and the client hydrated
-- petitionDate: "" — silent wipe. Empty TMS is expected; wiping a user-entered TEST petition date
-- is not. Additive date NULL; never a hardcoded court date.
BEGIN;

ALTER TABLE catalogs.form_425c_company_profiles
  ADD COLUMN IF NOT EXISTS petition_date date;

COMMIT;
