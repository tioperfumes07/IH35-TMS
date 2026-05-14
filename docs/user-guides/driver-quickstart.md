# Driver quickstart — IH35 Driver PWA

**You’ll learn**

- How to install and open the IH35 driver app on your phone.
- How to sign in with **email + one-time code** (no password to remember).
- How to view **today’s loads**, open a load, and **accept** work when offered.
- How to run **pickup and delivery stops** (arrive, upload BOL/POD, depart).
- Where to see **settlements** and how to open **disputes** when something looks wrong.
- What to try first when **GPS, camera, or login** misbehaves.
- How **notifications** (when enabled) relate to assignments and messages from the office.
- What **not** to photograph (PII, unrelated freight) when uploading POD.

This guide targets drivers using the **production** Driver PWA at **https://driver.ih35dispatch.com**. If your fleet uses a branded URL, substitute it everywhere below.

---

## 1. Install the app (optional but recommended)

The Driver PWA runs in the browser, but **Add to Home Screen** gives you a full-screen experience like a native app.

**iPhone (Safari)**

1. Open the driver URL in **Safari** (not Chrome) for best install support.
2. Tap the **Share** icon.
3. Choose **Add to Home Screen**, name it **IH35 Driver**, confirm.

**Android (Chrome)**

1. Open the driver URL.
2. Tap the **menu (⋮)** → **Install app** or **Add to Home Screen** (wording varies by Android version).

![Placeholder: Add to Home Screen prompt](./screenshots/driver/01-pwa-home.png)

**Tip:** After install, launch from the home icon so notifications and geolocation prompts attach to the right “site.”

---

## 2. Sign in with email

IH35 uses **email-based login** with a short verification code—there is **no driver password** to rotate.

1. Tap **Email** on the login screen.
2. Enter the **email address on file** with dispatch (must match your driver record).
3. Tap **Send code**.
4. Retrieve the **6-digit code** from email (or use your company’s approved test bypass in non-prod only).
5. Enter the code and tap **Verify**.

![Placeholder: Email + Send code](./screenshots/driver/02-login-email.png)

**Troubleshooting — login**

- **“Email not found”:** Dispatcher must link your driver profile to an identity user with that exact email (lowercase).
- **No email received:** Check spam; verify address; try **Resend** after 60 seconds.
- **Code expired:** Request a new code; codes are time-boxed for security.

---

## 3. Today — your active loads

After login you land on **Today** (sometimes labeled **Home**). This list shows loads assigned to you **for the current window** (pickups, in-transit legs, or actions required).

![Placeholder: Today list](./screenshots/driver/03-today-loads.png)

**What each card usually shows**

- Customer or internal reference (read-only label).
- Pickup / delivery summary line.
- Next action chip (e.g., **Go to pickup**).

Tap a card to open **load detail**.

**Pull to refresh:** If dispatch just reassigned you, pull down on the list to refetch. On poor signal, wait a few seconds before assuming data is missing.

**Multi-day trips:** Some loads span calendars; **Today** focuses on *now*, but you can still open deep links or list entries that carry over from prior days—always read the **stop schedule** inside the load.

---

## 4. Load detail and accepting work

Inside a load you’ll see **stops** in order: pickup → … → delivery (and occasionally fuel/rest if modeled).

![Placeholder: Load detail](./screenshots/driver/04-load-detail.png)

When dispatch releases a load for confirmation you may see **Accept** (or similar).

![Placeholder: Accept action](./screenshots/driver/05-accept-offer.png)

1. Read rate / miles / appointment notes if shown.
2. Tap **Accept** only if you can **honor pickup time and equipment**.
3. If something is wrong, **do not accept**—call dispatch; they may need to correct the plan first.

---

## 5. Running stops (arrive, POD, depart)

Open **Stops** from load detail. Typical happy path:

1. Navigate to the stop; when on site tap **Mark Arrived**.
2. Tap **Upload BOL/POD**.
3. Choose **camera** or **photo library**, center the paperwork, retake if blurry.
4. Confirm document type (**BOL** vs **POD**).
5. Tap **Queue Upload** (wait for success toast if shown).
6. When fully loaded / empty per instructions, tap **Mark Departed**.

![Placeholder: Stop list + upload](./screenshots/driver/06-stops-pod.png)

**Troubleshooting — stops**

- **Geolocation warnings:** Ensure **Location** is **Allow while using** for Safari/Chrome site settings.
- **Upload stuck:** Check cellular/Wi‑Fi; retry; if repeat failures, notify dispatch with approximate time and take a **manual photo** saved to camera roll as backup evidence.
- **Wrong stop order:** Rare routing bugs—call dispatch before bypassing sequence.

**Photo quality standards**

- Flash **off** on reflective BOL paper; fill frame but leave margins visible.
- Never include **another driver’s face** or **unrelated bills of lading** in-frame.
- If the shipper refuses photos, take **external seal pictures** only where allowed and note the exception in **Notes** if the field exists.

**Detention / layover:** If you wait beyond free time, capture **timestamped evidence** (yard entrance photo, check-in text screenshot if permitted by facility policy) *in addition to* in-app events. Your company’s detention rules still govern pay—use the dispute path if the check doesn’t match policy.

---

## 6. Settlements and disputes

Navigate to **Profile** (or menu) → **Settlements** / finance section (labels vary slightly by build). You’ll see **posted** or **pending** settlements with line hints.

![Placeholder: Settlements](./screenshots/driver/07-settlements.png)

If totals disagree with your BOL:

1. Open the settlement row.
2. Choose **Dispute** (or follow in-app prompt).
3. Enter **reason** text with enough detail for back-office (missing detention, wrong miles, etc.).
4. Submit; you’ll see confirmation in **My Disputes** when enabled.

Keep photos and on-device notes until the dispute resolves.

---

## 7. Notifications (optional)

If your organization enables **web push**, the browser will prompt for permission on first launch or from **Settings**. Accepting allows **assignment changes** or urgent messages to wake the screen.

- **iOS:** Web push requires **Add to Home Screen** on many versions—follow §1 first.
- **Do-not-disturb:** OS-level DND still silences alerts; you remain responsible for on-time arrivals per company policy.

---

## General troubleshooting checklist

| Problem | First step |
| --- | --- |
| Blank white screen | Force-close browser tab, reopen PWA; check iOS/Android updates. |
| Loop back to login | Session expired—sign in again; confirm cookies not blocked. |
| Camera opens black | Permission denied—enable Camera for Safari/Chrome in system settings. |
| Loads missing | Confirm correct **operating company** + you are **assigned primary/secondary** on the load. |

**Who to call**

- **Dispatch / fleet manager** — assignment issues, wrong loads, customer changes.
- **Safety** — hours-of-service / compliance questions per your company policy.
- **IT / Owner** — identity email wrong, repeated login failures, app outage affecting many drivers.

## Data, battery, and field conditions

The Driver PWA is **network-dependent** for uploads and status changes. If you routinely run in **dead zones**:

- Complete actions as soon as you regain bars; do not stack multiple pending uploads without verifying each cleared.
- Carry a **charger**; camera + GPS + screen-on navigation drain quickly.
- In extreme heat/cold, phones throttle—give the device cooling/warm-up time before retaking photos.

**Switching tractors:** If you change power units midweek, notify dispatch so the **assigned unit** in the office matches reality—otherwise mileage and asset cues may misalign with settlements.

## Privacy and screenshots

Do **not** post customer paperwork to social media. BOL/POD images are **business records**—treat them like signed contracts. If you take **troubleshooting screenshots** for IT, crop out unrelated loads before sending.

## First week on IH35 — quick checklist

Use this as a self-audit during your first **5–10 loads** so habits form correctly.

1. **Verify identity:** Can you log in without calling the office every morning? If not, fix email linkage first.
2. **Unit accuracy:** Does **Today** show the tractor/trailer you’re *actually* hooked to? If not, stop—wrong equipment attribution breaks safety and pay trails.
3. **Punch arrivals honest:** Mark **Arrived** at true dock/check-in times, not when you’re “almost there.” Integrity matters for detention and customer scorecards.
4. **Upload same day:** Same-day POD correlates with faster **invoicing** and faster **driver settlements**—treat upload like getting paid.
5. **Read notes:** Customer notes often hide appointment quirks (lumper checks, seal colors, tarp rules).
6. **Know the escalation path:** Save **dispatch’s published after-hours number** in your phone *outside* the app so outages don’t strand you.

Experienced drivers sometimes “muscle through” legacy paper processes—IH35 only helps when **digital milestones match physical reality**. The few extra taps at the stop prevent hours of email tag later.

**Glossary (IH35-specific)**

- **PWA:** Progressive Web App—website that installs like an app.
- **POD:** Proof of delivery paperwork (signed delivery receipt / e-sign capture).
- **BOL:** Bill of lading at pickup showing commodity, weight, shipper signatures.
- **Stop:** One geographic event in sequence (pickup, delivery, fuel, border, rest).
- **Settlement:** Back-office calculation of driver pay for booked work (timing varies by fleet).

If terminology differs from your old TMS, ask dispatch for a **one-page cheat sheet**—consistent language reduces payroll rework.

---

_Last updated: 2026-05-14_
