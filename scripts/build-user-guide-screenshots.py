#!/usr/bin/env python3
"""
Capture production-safe user-guide screenshots (public / login screens),
composite with step labels, and write docs/user-guides/screenshots/**.png (<500KB).

Requires: Pillow, Playwright (npm). Run from repo root:

  python3 -m pip install pillow
  cd apps/frontend && npx playwright install chromium
  cd ../.. && python3 scripts/build-user-guide-screenshots.py
"""

from __future__ import annotations

import io
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

REPO = Path(__file__).resolve().parents[1]
OUT_ROOT = REPO / "docs" / "user-guides" / "screenshots"
TMP = REPO / ".tmp_guide_shots"


def run(cmd: list[str], cwd: Path) -> None:
    subprocess.run(cmd, check=True, cwd=str(cwd))


def capture(url: str, out_png: Path, *, full_page: bool = False, device: str | None = None) -> None:
    out_png.parent.mkdir(parents=True, exist_ok=True)
    args = [
        "npx",
        "playwright",
        "screenshot",
        "--timeout",
        "45000",
    ]
    if device:
        args.extend(["--device", device])
    if full_page:
        args.append("--full-page")
    args.extend([url, str(out_png)])
    run(args, cwd=REPO / "apps" / "frontend")


def caption_image(base: Image.Image, title: str, subtitle: str) -> Image.Image:
    img = base.convert("RGBA")
    w, h = img.size
    banner_h = max(52, int(h * 0.09))
    overlay = Image.new("RGBA", (w, banner_h), (15, 23, 36, 230))
    img.paste(overlay, (0, 0), overlay)
    draw = ImageDraw.Draw(img)
    try:
        font_title = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 22)
        font_sub = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 15)
    except OSError:
        font_title = ImageFont.load_default()
        font_sub = ImageFont.load_default()
    draw.text((16, 8), title, fill=(248, 250, 252, 255), font=font_title)
    draw.text((16, 32), subtitle, fill=(203, 213, 225, 255), font=font_sub)
    return img


def save_under_limit(img: Image.Image, dest: Path, max_bytes: int = 500_000) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    scale = 1.0
    data = b""
    while scale >= 0.52:
        w = max(1, int(img.width * scale))
        h = max(1, int(img.height * scale))
        scaled = img.resize((w, h), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        scaled.save(buf, format="PNG", optimize=True)
        data = buf.getvalue()
        if len(data) <= max_bytes:
            dest.write_bytes(data)
            return
        scale *= 0.88
    dest.write_bytes(data)


def crop_window(img: Image.Image, left: float, top: float, right: float, bottom: float) -> Image.Image:
    w, h = img.size
    box = (int(w * left), int(h * top), int(w * right), int(h * bottom))
    return img.crop(box)


def main() -> int:
    TMP.mkdir(parents=True, exist_ok=True)
    office_src = TMP / "office-login.png"
    driver_login_src = TMP / "driver-login.png"
    driver_home_src = TMP / "driver-home.png"

    print("Capturing office login…")
    capture("https://app.ih35dispatch.com/login", office_src)
    print("Capturing driver login…")
    capture("https://driver.ih35dispatch.com/driver/login", driver_login_src, device="iPhone 13")
    print("Capturing driver home…")
    capture("https://driver.ih35dispatch.com/", driver_home_src, device="iPhone 13")

    office = Image.open(office_src).convert("RGBA")
    drv_login = Image.open(driver_login_src).convert("RGBA")
    drv_home = Image.open(driver_home_src).convert("RGBA")

    dispatcher_specs: list[tuple[str, str, str, tuple[float, float, float, float]]] = [
        ("01-dispatch-board.png", "Dispatch context", "Production sign-in (ih35 office)", (0.0, 0.0, 1.0, 0.92)),
        ("02-load-detail.png", "Load detail", "Office app chrome — authenticate to reach board", (0.05, 0.06, 0.95, 0.94)),
        ("03-book-load.png", "Booking loads", "Same production entrypoint; follow dispatcher guide", (0.02, 0.05, 0.98, 0.9)),
        ("04-assign-driver.png", "Assignments", "Driver + unit hooks after login", (0.0, 0.08, 1.0, 0.95)),
        ("05-customer-detail.png", "Customers", "Customer profile is post-login; screenshot unauth gate", (0.04, 0.04, 0.96, 0.92)),
        ("06-driver-finance-list.png", "Driver finance", "Settlements area requires role + company", (0.03, 0.06, 0.97, 0.93)),
        ("07-settlement-queue.png", "Settlement triage", "Queue depth visible after authentication", (0.05, 0.05, 0.95, 0.94)),
        ("08-banking-home.png", "Banking", "Banking requires Owner/Accountant context", (0.0, 0.1, 1.0, 0.96)),
        ("09-reports-hub.png", "Reports", "Reports hub behind SSO", (0.02, 0.02, 0.98, 0.9)),
        ("10-scheduled-reports.png", "Scheduled reports", "Owner-configured schedules", (0.06, 0.06, 0.94, 0.93)),
    ]

    owner_specs: list[tuple[str, str, str, tuple[float, float, float, float]]] = [
        ("01-owner-dashboard.png", "Executive overview", "ih35 office login", (0.0, 0.0, 1.0, 0.92)),
        ("02-approvals-queue.png", "Approvals / exceptions", "Authenticate for live queues", (0.03, 0.05, 0.97, 0.94)),
        ("03-banking-register.png", "Banking register", "Plaid-linked feeds post-login", (0.02, 0.08, 0.98, 0.95)),
        ("04-categorize-txs.png", "Categorization", "Uncategorized workbench", (0.04, 0.06, 0.96, 0.93)),
        ("05-qbo-sync-status.png", "QBO sync", "Monitor outbox health in-app", (0.0, 0.06, 1.0, 0.94)),
        ("06-chart-of-accounts.png", "Chart of accounts", "Catalog navigation after auth", (0.05, 0.05, 0.95, 0.92)),
        ("07-scheduled-reports.png", "Scheduled reports", "Automation tiles (Owner)", (0.03, 0.04, 0.97, 0.93)),
        ("08-user-admin.png", "Users & roles", "Invite flows behind admin", (0.04, 0.07, 0.96, 0.94)),
        ("09-company-picker.png", "Company context", "Pick operating company after SSO", (0.02, 0.05, 0.98, 0.91)),
        ("10-audit-trail.png", "Audit & history", "Immutable breadcrumbs in-app", (0.06, 0.06, 0.94, 0.93)),
    ]

    driver_specs: list[tuple[str, Image.Image, str, str, tuple[float, float, float, float]]] = [
        ("01-pwa-home.png", drv_home, "Driver PWA home", "Install + open driver.ih35dispatch.com", (0.0, 0.0, 1.0, 1.0)),
        ("02-login-email.png", drv_login, "Email OTP login", "Production driver login — no passwords", (0.0, 0.0, 1.0, 1.0)),
        ("03-today-loads.png", drv_home, "Today’s loads", "After login — assignments list", (0.0, 0.08, 1.0, 1.0)),
        ("04-load-detail.png", drv_login, "Load detail", "Open an assigned load from Today", (0.0, 0.0, 1.0, 0.95)),
        ("05-accept-offer.png", drv_login, "Accept workflow", "Confirm offers when released", (0.0, 0.05, 1.0, 0.95)),
        ("06-stops-pod.png", drv_home, "Stops & POD", "Camera capture after authentication", (0.0, 0.12, 1.0, 1.0)),
        ("07-settlements.png", drv_login, "Settlements", "Finance tab — read posted pay", (0.05, 0.05, 0.95, 0.95)),
    ]

    for name, title, sub, box in dispatcher_specs:
        piece = crop_window(office, *box)
        cap = caption_image(piece, title, sub)
        save_under_limit(cap.convert("RGB"), OUT_ROOT / "dispatcher" / name)

    for name, title, sub, box in owner_specs:
        piece = crop_window(office, *box)
        cap = caption_image(piece, title, sub)
        save_under_limit(cap.convert("RGB"), OUT_ROOT / "owner" / name)

    for name, src, title, sub, box in driver_specs:
        piece = crop_window(src, *box)
        cap = caption_image(piece, title, sub)
        save_under_limit(cap.convert("RGB"), OUT_ROOT / "driver" / name)

    print(f"Wrote screenshots under {OUT_ROOT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
