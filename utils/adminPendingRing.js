/**
 * Continuous phone-like ring while kitchen has pending accept/reject.
 * Audio can only play while the PWA/page is allowed to use sound
 * (open app, or right after the user opens a notification).
 */

let audioCtx = null;
let ringing = false;
let burstTimer = null;
let activeNodes = [];
/** Bumps on every start/stop to invalidate in-flight resume/timeouts. */
let ringGeneration = 0;

function getCtx() {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new AC();
  }
  return audioCtx;
}

function stopNodes() {
  for (const n of activeNodes) {
    try {
      n.stop?.();
    } catch {
      /* ignore */
    }
    try {
      n.disconnect?.();
    } catch {
      /* ignore */
    }
  }
  activeNodes = [];
}

function playRingBurst(ctx) {
  const now = ctx.currentTime;
  const freqs = [440, 480];
  const duration = 2.0;
  for (const hz of freqs) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = hz;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.05);
    gain.gain.setValueAtTime(0.12, now + duration - 0.1);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
    activeNodes.push(osc, gain);
  }
}

function scheduleNextBurst(generation) {
  if (!ringing || generation !== ringGeneration) return;
  const ctx = getCtx();
  if (!ctx) return;
  const run = () => {
    if (!ringing || generation !== ringGeneration) return;
    stopNodes();
    playRingBurst(ctx);
    burstTimer = window.setTimeout(() => {
      scheduleNextBurst(generation);
    }, 4000);
  };
  if (ctx.state === "suspended") {
    void ctx.resume().then(run).catch(() => {});
  } else {
    run();
  }
}

/** Unlock audio on a user gesture (notification tap / Enable notifications). */
export async function unlockAdminPendingRing() {
  const ctx = getCtx();
  if (!ctx) return false;
  try {
    if (ctx.state === "suspended") await ctx.resume();
    return true;
  } catch {
    return false;
  }
}

export function isAdminPendingRinging() {
  return ringing;
}

export function startAdminPendingRing() {
  if (typeof window === "undefined") return;
  if (ringing) return;
  ringing = true;
  const generation = ++ringGeneration;
  scheduleNextBurst(generation);
  try {
    if (navigator.vibrate) {
      navigator.vibrate([400, 200, 400, 200, 400]);
    }
  } catch {
    /* ignore */
  }
}

export function stopAdminPendingRing() {
  ringing = false;
  ringGeneration += 1;
  if (burstTimer) {
    window.clearTimeout(burstTimer);
    burstTimer = null;
  }
  stopNodes();
  try {
    if (navigator.vibrate) navigator.vibrate(0);
  } catch {
    /* ignore */
  }
}

/** Start or stop according to whether any order is still pending. */
export function syncAdminPendingRing(hasPending) {
  if (hasPending) startAdminPendingRing();
  else stopAdminPendingRing();
}
