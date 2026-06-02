import { Bell } from "lucide-react";
import { useState } from "react";
import { colors } from "../../design/tokens";
import { useNotifications } from "../../hooks/useNotifications";
import { NotificationDropdown } from "./NotificationDropdown";

export function NotificationBell() {
  const { unreadCount, notifications, markRead, markAllRead, dismiss } = useNotifications();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative" data-testid="notification-bell">
      <button
        type="button"
        className="relative flex h-7 w-7 items-center justify-center rounded border hover:bg-white/10"
        style={{ borderColor: colors.sidebarBorder, color: colors.sidebarTextActive }}
        aria-label="Notifications"
        onClick={() => setOpen((current) => !current)}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 ? (
          <span
            className="absolute -right-1 -top-1 min-w-[16px] rounded-full bg-red-500 px-1 text-center text-[10px] font-semibold leading-4 text-white"
            data-testid="notification-unread-badge"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>
      {open ? (
        <NotificationDropdown
          notifications={notifications}
          onClose={() => setOpen(false)}
          onMarkRead={markRead}
          onDismiss={dismiss}
          onMarkAllRead={markAllRead}
        />
      ) : null}
    </div>
  );
}
