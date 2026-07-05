-- INCIDENT FIX: chat RLS "infinite recursion detected in policy for relation participants" (42P17).
--
-- The chat_participants_select policy (migration 202607012000) checked thread membership with an inline
-- EXISTS(SELECT 1 FROM chat.participants me ...) — a self-reference that Postgres flags as recursive at
-- plan time, so ANY read of chat.participants (and of chat.threads/messages/attachments/receipts, whose
-- SELECT policies inline the same participants EXISTS) errors 42P17. This broke the chat cron AND the
-- pre-deploy boot smoke (ci:boot-*-smoke), which failed the whole pre-deploy → every deploy rolled back.
--
-- FIX: move the membership test into a SECURITY DEFINER function (chat.is_thread_member) owned by a
-- BYPASSRLS role (neondb_owner — db:migrate runs as it), so the function's participants read skips RLS
-- and the policy no longer references its own table. Idempotent; no data change.
--
-- Validated on a Neon branch copy of prod (recursion cleared, participants/threads/messages queryable).

CREATE OR REPLACE FUNCTION chat.is_thread_member(p_thread_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET row_security = off
AS $body$
  SELECT EXISTS (
    SELECT 1
    FROM chat.participants me
    WHERE me.thread_id = p_thread_id
      AND me.left_at IS NULL
      AND (
        me.office_user_id = identity.current_user_id()
        OR me.driver_id = (SELECT d.id FROM mdata.drivers d WHERE d.identity_user_id = identity.current_user_id())
      )
  );
$body$;

-- Ensure the SECURITY DEFINER function runs as a BYPASSRLS owner (so its internal read isn't RLS-filtered
-- → no runtime recursion). db:migrate already runs as neondb_owner, but pin it explicitly + idempotently.
DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER FUNCTION chat.is_thread_member(uuid) OWNER TO neondb_owner';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'chat.is_thread_member owner unchanged (%): SECURITY DEFINER still runs as current owner', SQLERRM;
  END;
END $$;

GRANT EXECUTE ON FUNCTION chat.is_thread_member(uuid) TO ih35_app;

-- Rewrite the five SELECT policies to call the function instead of inlining the participants EXISTS.
DROP POLICY IF EXISTS chat_participants_select ON chat.participants;
CREATE POLICY chat_participants_select ON chat.participants FOR SELECT USING (
  identity.is_lucia_bypass()
  OR ( operating_company_id IN (SELECT org.user_accessible_company_ids()) AND chat.is_thread_member(thread_id) )
);

DROP POLICY IF EXISTS chat_threads_select ON chat.threads;
CREATE POLICY chat_threads_select ON chat.threads FOR SELECT USING (
  identity.is_lucia_bypass()
  OR ( operating_company_id IN (SELECT org.user_accessible_company_ids()) AND chat.is_thread_member(id) )
);

DROP POLICY IF EXISTS chat_messages_select ON chat.messages;
CREATE POLICY chat_messages_select ON chat.messages FOR SELECT USING (
  identity.is_lucia_bypass()
  OR ( operating_company_id IN (SELECT org.user_accessible_company_ids()) AND chat.is_thread_member(thread_id) )
);

DROP POLICY IF EXISTS chat_attachments_select ON chat.attachments;
CREATE POLICY chat_attachments_select ON chat.attachments FOR SELECT USING (
  identity.is_lucia_bypass()
  OR ( operating_company_id IN (SELECT org.user_accessible_company_ids())
       AND chat.is_thread_member((SELECT m.thread_id FROM chat.messages m WHERE m.id = message_id)) )
);

DROP POLICY IF EXISTS chat_receipts_select ON chat.message_receipts;
CREATE POLICY chat_receipts_select ON chat.message_receipts FOR SELECT USING (
  identity.is_lucia_bypass()
  OR ( operating_company_id IN (SELECT org.user_accessible_company_ids())
       AND chat.is_thread_member((SELECT m.thread_id FROM chat.messages m WHERE m.id = message_id)) )
);
