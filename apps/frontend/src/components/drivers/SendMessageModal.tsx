import { useCallback, useEffect, useState } from "react";
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

  const resetDraft = useCallback(() => {
    setMessage("");
    setChannel("in_app");
    setUrgency("");
    setError("");
  }, []);

  useEffect(() => {
    if (open) resetDraft();
  }, [open, companyId, driverId, resetDraft]);

  const handleClose = useCallback(() => {
    resetDraft();
    onClose();
  }, [onClose, resetDraft]);

  const submit = async () => {
    setError("");
    if (!message.trim()) {
      setError("Message is required.");
      return;
    }
    setPending(true);
    try {
      await sendDriverProfileMessage(driverId, companyId, {
        message: message.trim(),
        channel,
        urgency: urgency.trim() || undefined,
      });
      onSent?.();
      handleClose();
    } catch {
      setError("Failed to send message.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title={`Send Message — ${driverName}`}>
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
          <Button type="button" variant="secondary" onClick={handleClose}>
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
