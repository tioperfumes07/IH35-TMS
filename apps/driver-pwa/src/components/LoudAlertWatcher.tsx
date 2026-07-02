// NOTIF-A (A1) — app-open loud-alert watcher. Mounted globally (inside ProtectedRoute) so a
// high-priority confirmation raises the takeover even when the driver isn't on the chat page.
// Transport = the EXISTING polling (threads 15s / messages 5s) — no SSE/WS (known app-wide SSE bug).
// The takeover clears ONLY via Acknowledge, which posts the EXISTING confirmation_ack path.
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  ackConfirmation,
  getDriverThreadMessages,
  listDriverChatThreads,
  type DriverChatMessage,
} from "../api/chat";
import { LoudAlertEngine } from "../notifications/loud-alert-engine";
import { pickActiveConfirmationAlert, pickPendingThread, type ActiveAlert } from "../notifications/loud-alert-controller";
import { LoudAlertOverlay } from "./LoudAlertOverlay";

export function LoudAlertWatcher() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const engineRef = useRef<LoudAlertEngine | null>(null);
  const handledRef = useRef<Set<string>>(new Set());
  const [active, setActive] = useState<ActiveAlert | null>(null);

  if (!engineRef.current) engineRef.current = new LoudAlertEngine();

  // Threads poll (15s) — same key as ChatPage so react-query dedupes the request.
  const threadsQuery = useQuery({
    queryKey: ["pwa", "chat-threads"],
    queryFn: listDriverChatThreads,
    refetchInterval: 15000,
  });
  const threads = useMemo(() => threadsQuery.data?.threads ?? [], [threadsQuery.data]);
  const pendingThread = useMemo(() => pickPendingThread(threads), [threads]);

  // Messages poll (5s) only for the flagged thread — find the unacked confirmation to raise.
  const candidateThreadId = pendingThread?.id ?? "";
  const messagesQuery = useQuery({
    queryKey: ["pwa", "chat-messages", candidateThreadId],
    queryFn: () => getDriverThreadMessages(candidateThreadId),
    enabled: Boolean(candidateThreadId) && !active,
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (active) return; // don't switch the alert out from under the driver
    if (!candidateThreadId) return;
    const messages: DriverChatMessage[] = messagesQuery.data?.messages ?? [];
    const next = pickActiveConfirmationAlert(candidateThreadId, messages, handledRef.current);
    if (next) setActive(next);
  }, [active, candidateThreadId, messagesQuery.data]);

  // Drive the audible/haptic engine off overlay visibility.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (active) engine.start();
    else engine.stop();
  }, [active]);

  // Tear the engine down on unmount (sign-out / route teardown).
  useEffect(() => () => engineRef.current?.stop(), []);

  const ackMutation = useMutation({
    mutationFn: (alert: ActiveAlert) =>
      ackConfirmation(alert.threadId, alert.message.id, alert.message.body ?? ""),
    onSuccess: async (_data, alert) => {
      handledRef.current.add(alert.message.id);
      setActive(null);
      await queryClient.invalidateQueries({ queryKey: ["pwa", "chat-threads"] });
      await queryClient.invalidateQueries({ queryKey: ["pwa", "chat-messages", alert.threadId] });
    },
  });

  const title = active ? t("loud_alert.confirmation_title", "Dispatch needs your confirmation") : "";
  const body = active?.message.body ?? t("loud_alert.confirmation_body", "Tap Acknowledge to confirm you received this.");

  return (
    <LoudAlertOverlay
      visible={Boolean(active)}
      title={title}
      body={body}
      acknowledging={ackMutation.isPending}
      onAcknowledge={() => {
        if (active) ackMutation.mutate(active);
      }}
    />
  );
}
