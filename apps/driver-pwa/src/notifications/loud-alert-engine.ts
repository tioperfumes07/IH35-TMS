// NOTIF-A (A1) — the loud foreground alert engine: a looping Web Audio tone + a repeating
// navigator.vibrate pattern. Autoplay-policy safe: if the AudioContext is blocked until a user
// gesture, the visual takeover + vibration still run, and a one-time gesture listener resumes the
// tone. Fully defensive — every browser capability is feature-detected so this never throws.

type AudioCtor = typeof AudioContext;

function getAudioContextCtor(): AudioCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

// A short, urgent two-pulse pattern repeated on a loop (ms on/off/on/off/gap).
const VIBRATE_PATTERN = [400, 150, 400, 150];
const VIBRATE_LOOP_MS = 1600;
const TONE_FREQ_HZ = 880;
const TONE_PULSE_MS = 600; // on/off duty cycle of the audible pulse

export class LoudAlertEngine {
  private ctx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private pulseTimer: ReturnType<typeof setInterval> | null = null;
  private vibrateTimer: ReturnType<typeof setInterval> | null = null;
  private gestureHandler: (() => void) | null = null;
  private running = false;
  private audible = false;

  /** True once running; idempotent. */
  isRunning(): boolean {
    return this.running;
  }

  /** True once the tone is actually sounding (may lag start under autoplay policy). */
  isAudible(): boolean {
    return this.audible;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.startVibration();
    this.startTone();
    // If the tone couldn't start (autoplay blocked), resume it on the first user gesture.
    if (!this.audible) this.installGestureResume();
  }

  stop(): void {
    this.running = false;
    this.audible = false;
    this.removeGestureResume();
    if (this.pulseTimer) {
      clearInterval(this.pulseTimer);
      this.pulseTimer = null;
    }
    if (this.vibrateTimer) {
      clearInterval(this.vibrateTimer);
      this.vibrateTimer = null;
    }
    try {
      this.osc?.stop();
    } catch {
      // already stopped
    }
    this.osc = null;
    this.gain = null;
    try {
      void this.ctx?.close();
    } catch {
      // ignore
    }
    this.ctx = null;
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(0); // cancel any in-flight vibration
    }
  }

  private startVibration(): void {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    navigator.vibrate(VIBRATE_PATTERN);
    this.vibrateTimer = setInterval(() => {
      navigator.vibrate(VIBRATE_PATTERN);
    }, VIBRATE_LOOP_MS);
  }

  private startTone(): void {
    const Ctor = getAudioContextCtor();
    if (!Ctor) return;
    try {
      if (!this.ctx) this.ctx = new Ctor();
      const ctx = this.ctx;
      // Under autoplay policy the context starts 'suspended'; resume() only succeeds within a gesture.
      if (ctx.state === "suspended") {
        void ctx.resume().catch(() => undefined);
      }
      if (ctx.state !== "running") {
        this.audible = false;
        return;
      }
      if (!this.osc) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "square";
        osc.frequency.value = TONE_FREQ_HZ;
        gain.gain.value = 0;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        this.osc = osc;
        this.gain = gain;
        // Pulse the gain on/off so the tone reads as an urgent alarm, not a flat drone.
        let on = false;
        this.pulseTimer = setInterval(() => {
          on = !on;
          if (this.gain) this.gain.gain.value = on ? 0.25 : 0;
        }, TONE_PULSE_MS);
      }
      this.audible = true;
    } catch {
      this.audible = false;
    }
  }

  private installGestureResume(): void {
    if (typeof window === "undefined" || this.gestureHandler) return;
    this.gestureHandler = () => {
      if (!this.running) return;
      this.startTone();
      if (this.audible) this.removeGestureResume();
    };
    window.addEventListener("pointerdown", this.gestureHandler, { passive: true });
    window.addEventListener("keydown", this.gestureHandler);
  }

  private removeGestureResume(): void {
    if (!this.gestureHandler || typeof window === "undefined") return;
    window.removeEventListener("pointerdown", this.gestureHandler);
    window.removeEventListener("keydown", this.gestureHandler);
    this.gestureHandler = null;
  }
}
