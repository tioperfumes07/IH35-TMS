import { useCallback, useEffect, useRef, useState } from "react";
import { sendDriverProfileMessage } from "../../api/mdata";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { Combobox } from "../Combobox";

type Props = {
  open: boolean;
  driverId: string;
  companyId: string;
  driverName: string;
  onClose: () => void;
  onSent?: () => void;
};

export function SendMessageModal({ open, driverId, companyId, driverName, onClose, onSent }: Props) {
  const [message, setMessage] = useState("");
  const [channel, setChannel] = useState<"sms" | "email" | "in_app">("in_app");
  const [urgency, setUrgency] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [attemptClose, setAttemptClose] = useState<() => void>(() => () => {});
  const requestGenerationRef = useRef(0);

  const resetDraft = useCallback(() => {
    setMessage("");
    setChannel("in_app");
    setUrgency("");
    setError("");
  }, []);

  useEffect(() => {
    requestGenerationRef.current += 1;
    setPending(false);
    if (open) resetDraft();
  }, [open, companyId, driverId, resetDraft]);

  const handleClose = useCallback(() => {
    if (pending) return;
    requestGenerationRef.current += 1;
    resetDraft();
    onClose();
  }, [onClose, pending, resetDraft]);

  const submit = async () => {
    setError("");
    if (!message.trim()) {
      setError("Message is required.");
      return;
    }
    const input = {
      driverId,
      companyId,
      generation: requestGenerationRef.current,
      body: {
        message: message.trim(),
        channel,
        urgency: urgency.trim() || undefined,
      },
    };
    setPending(true);
    try {
      await sendDriverProfileMessage(input.driverId, input.companyId, input.body);
      if (input.generation !== requestGenerationRef.current) return;
      onSent?.();
      requestGenerationRef.current += 1;
      resetDraft();
      onClose();
    } catch {
      if (input.generation !== requestGenerationRef.current) return;
      setError("Failed to send message.");
    } finally {
      if (input.generation === requestGenerationRef.current) setPending(false);
    }
  };

  const isDirty = Boolean(message || urgency || channel !== "in_app");

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Send Message — ${driverName}`}
      confirmDiscardOnClose
      isDirty={isDirty}
      onRegisterAttemptClose={(next) => setAttemptClose(() => next)}
    >
      <div className="space-y-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="send-message-channel" className="text-xs font-semibold text-gray-600">Channel</label>
          <Combobox
            id="send-message-channel"
            options={[
              { value: "in_app", label: "In-app" },
              { value: "sms", label: "SMS" },
              { value: "email", label: "Email" },
            ]}
            value={channel}
            onChange={(next) => next && setChannel(next as typeof channel)}
            placeholder="Select channel"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">Urgency (optional)</label>
          <input
            value={urgency}
            onChange={(event) => setUrgency(event.target.value)}
            className="rounded-sm border border-gray-300 h-9 px-2 text-[13px]"
            placeholder="normal, urgent, …"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">Message</label>
          <textarea
            data-testid="send-message-body"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            className="rounded-sm border border-gray-300 px-2 py-1.5 text-[13px]"
            rows={4}
            maxLength={4000}
          />
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={attemptClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void submit()} loading={pending} data-testid="send-message-submit">
            Send
          </Button>
        </div>
      </div>
    </Modal>
  );
}
