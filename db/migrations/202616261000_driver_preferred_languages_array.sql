-- 443355-5: driver preferred_languages text[] — multi-language array on mdata.drivers
-- Backfills from identity.users.preferred_language (single value) into the new array.
-- identity.users.preferred_language stays as the i18n/app-login language (single); this
-- new column captures spoken languages for dispatch and profile display.

ALTER TABLE mdata.drivers
  ADD COLUMN IF NOT EXISTS preferred_languages text[] DEFAULT ARRAY['en']::text[];

-- Backfill from the linked identity user's single-value preferred_language.
UPDATE mdata.drivers d
SET    preferred_languages = ARRAY[COALESCE(
         (SELECT iu.preferred_language
          FROM   identity.users iu
          WHERE  iu.id = d.identity_user_id),
         'en')]::text[]
WHERE  d.identity_user_id IS NOT NULL
  AND  (d.preferred_languages IS NULL OR d.preferred_languages = ARRAY['en']::text[]);
