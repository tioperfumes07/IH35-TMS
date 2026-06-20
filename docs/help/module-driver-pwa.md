# Driver App (PWA)

The Driver App is the mobile, driver-facing side of the system — a separate installable web app (PWA) that drivers use in the cab to see their assignments, capture paperwork, and stay compliant on hours of service.

## Overview
The Driver App is built for the road: a focused, dark-themed app that runs on a phone and connects each driver to the loads and tasks meant for them. It is the counterpart to the office system — what dispatch does in the office shows up for the driver here.

## Key tasks
- **See assigned loads** — drivers view the trips assigned to them, with stops and details.
- **Capture documents** — drivers photograph and upload proof-of-delivery and other paperwork from the cab.
- **Stay on top of hours** — drivers see their hours-of-service status so they can plan legal driving time.
- **Sign in securely** — drivers authenticate to reach only their own data.

## Tips & gotchas
- Each driver sees only their own assignments and data — driver self-resolution uses a dedicated per-driver lookup, never a shared list.
- The app is installable to the phone home screen (PWA) for quick access in the cab.
- Documents captured by the driver flow into the office system's evidence storage, so POD and paperwork are available office-side.

## FAQ
- **Is this the same as the office app?** No — it's a separate app tuned for drivers on their phones, connected to the same data.
- **What does a driver do here?** View their loads, upload paperwork like POD, and check their hours of service.
- **Why can a driver only see their own loads?** The app resolves each driver to their own record so they only ever see data meant for them.
