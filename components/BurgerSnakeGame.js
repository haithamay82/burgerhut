import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "@/contexts/LocaleContext";

const COLS = 14;
const ROWS = 14;
const TICK_MS = 160;
/** אורך מינימלי: ראש + 3 חלקים */
const MIN_LEN = 4;
const CHALLENGE_SCORE = 40;
const WIN_LOCAL_KEY = "bh_snake_challenge_won";

const DIRS = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  w: { x: 0, y: -1 },
  s: { x: 0, y: 1 },
  a: { x: -1, y: 0 },
  d: { x: 1, y: 0 },
};

let snakeAudioCtx = null;

function getSnakeAudioCtx() {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!snakeAudioCtx || snakeAudioCtx.state === "closed") {
    snakeAudioCtx = new AC();
  }
  return snakeAudioCtx;
}

function playSnakeTone({ freq, duration = 0.12, type = "sine", gain = 0.08 }) {
  const ctx = getSnakeAudioCtx();
  if (!ctx) return;
  const run = () => {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  };
  if (ctx.state === "suspended") {
    void ctx.resume().then(run).catch(() => {});
  } else {
    run();
  }
}

function playEatSound() {
  playSnakeTone({ freq: 660, duration: 0.09, type: "square", gain: 0.07 });
  window.setTimeout(() => {
    playSnakeTone({ freq: 880, duration: 0.1, type: "square", gain: 0.06 });
  }, 70);
}

function playShrinkSound() {
  playSnakeTone({ freq: 320, duration: 0.14, type: "sawtooth", gain: 0.06 });
  window.setTimeout(() => {
    playSnakeTone({ freq: 180, duration: 0.18, type: "triangle", gain: 0.05 });
  }, 90);
}

function playWinSound() {
  playSnakeTone({ freq: 523, duration: 0.12, type: "sine", gain: 0.08 });
  window.setTimeout(
    () => playSnakeTone({ freq: 659, duration: 0.12, type: "sine", gain: 0.08 }),
    100
  );
  window.setTimeout(
    () => playSnakeTone({ freq: 784, duration: 0.18, type: "sine", gain: 0.09 }),
    200
  );
}

function keyOf(cell) {
  return `${cell.x},${cell.y}`;
}

function randomEmptyCell(snake) {
  const occupied = new Set(snake.map(keyOf));
  const free = [];
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const cell = { x, y };
      if (!occupied.has(keyOf(cell))) free.push(cell);
    }
  }
  if (!free.length) return { x: 0, y: 0 };
  return free[Math.floor(Math.random() * free.length)];
}

function initialState() {
  const midX = Math.floor(COLS / 2);
  const midY = Math.floor(ROWS / 2);
  /** ראש + 3 חלקי גוף */
  const snake = [
    { x: midX, y: midY },
    { x: midX - 1, y: midY },
    { x: midX - 2, y: midY },
    { x: midX - 3, y: midY },
  ];
  return {
    snake,
    dir: { x: 1, y: 0 },
    pendingDir: { x: 1, y: 0 },
    food: randomEmptyCell(snake),
    score: 0,
    best: 0,
    running: false,
    challengeReported: false,
    winShown: false,
  };
}

/**
 * משחק נחש שאוכל המבורגר — להמתנה בזמן הכנת הזמנה.
 */
export default function BurgerSnakeGame({ className = "" }) {
  const { t } = useLocale();
  const stateRef = useRef(initialState());
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [running, setRunning] = useState(false);
  const [frame, setFrame] = useState(0);
  const [winners, setWinners] = useState(null);
  const [showWin, setShowWin] = useState(false);
  const boardRef = useRef(null);

  const winWaUrl = `https://wa.me/972504847599?text=${encodeURIComponent(
    t("snake.winWaMessage")
  )}`;

  const bump = useCallback(() => setFrame((n) => n + 1), []);

  const setDir = useCallback((next) => {
    const cur = stateRef.current.dir;
    if (cur.x + next.x === 0 && cur.y + next.y === 0) return;
    stateRef.current.pendingDir = next;
  }, []);

  const reportChallengeWin = useCallback(async () => {
    if (typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem(WIN_LOCAL_KEY) === "1") {
        const r = await fetch("/api/snake-challenge", { cache: "no-store" });
        const d = await r.json().catch(() => ({}));
        if (r.ok && Number.isFinite(Number(d.winners))) {
          setWinners(Number(d.winners));
        }
        return;
      }
    } catch {
      /* continue to report */
    }
    try {
      const r = await fetch("/api/snake-challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score: CHALLENGE_SCORE }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && Number.isFinite(Number(d.winners))) {
        setWinners(Number(d.winners));
        try {
          window.localStorage.setItem(WIN_LOCAL_KEY, "1");
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  const start = useCallback(() => {
    const next = initialState();
    next.best = stateRef.current.best;
    next.running = true;
    try {
      next.challengeReported =
        typeof window !== "undefined" &&
        window.localStorage.getItem(WIN_LOCAL_KEY) === "1";
    } catch {
      next.challengeReported = false;
    }
    stateRef.current = next;
    setScore(0);
    setBest(next.best);
    setShowWin(false);
    setRunning(true);
    bump();
  }, [bump]);

  const pauseToggle = useCallback(() => {
    const s = stateRef.current;
    if (!s.snake.length) return;
    s.running = !s.running;
    setRunning(s.running);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch("/api/snake-challenge", { cache: "no-store" });
        const d = await r.json().catch(() => ({}));
        if (!cancelled && r.ok && Number.isFinite(Number(d.winners))) {
          setWinners(Number(d.winners));
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      const dir = DIRS[e.key] || DIRS[String(e.key || "").toLowerCase()];
      if (!dir) return;
      e.preventDefault();
      if (!stateRef.current.running) {
        stateRef.current.running = true;
        setRunning(true);
      }
      setDir(dir);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setDir]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const s = stateRef.current;
      if (!s.running) return;

      s.dir = s.pendingDir;
      const head = s.snake[0];
      const nx = (head.x + s.dir.x + COLS) % COLS;
      const ny = (head.y + s.dir.y + ROWS) % ROWS;
      const nextHead = { x: nx, y: ny };

      const hitSelf = s.snake.some(
        (seg, i) => i > 0 && seg.x === nextHead.x && seg.y === nextHead.y
      );

      let body = s.snake;
      if (hitSelf) {
        playShrinkSound();
        const prevLen = body.length;
        const shrinkTo = Math.max(MIN_LEN, Math.ceil(prevLen / 2));
        const lost = Math.max(0, prevLen - shrinkTo);
        s.snake = [nextHead, ...body.slice(0, shrinkTo - 1)];
        if (lost > 0) {
          s.score = Math.max(0, s.score - lost);
          setScore(s.score);
        }
        bump();
        return;
      }

      const ate = nextHead.x === s.food.x && nextHead.y === s.food.y;
      if (ate) {
        playEatSound();
        s.snake = [nextHead, ...body];
        s.score += 1;
        if (s.score > s.best) s.best = s.score;
        s.food = randomEmptyCell(s.snake);
        setScore(s.score);
        setBest(s.best);
        if (s.score >= CHALLENGE_SCORE && !s.winShown) {
          s.winShown = true;
          s.running = false;
          setRunning(false);
          setShowWin(true);
          playWinSound();
          if (!s.challengeReported) {
            s.challengeReported = true;
            void reportChallengeWin();
          }
        }
      } else {
        s.snake = [nextHead, ...body.slice(0, body.length - 1)];
      }
      bump();
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [bump, reportChallengeWin]);

  void frame;
  const { snake, food } = stateRef.current;
  const snakeSet = new Set(snake.map(keyOf));
  const headKey = snake[0] ? keyOf(snake[0]) : "";

  return (
    <section
      className={`w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900/70 p-3 text-center ${className}`}
      dir="rtl"
      aria-label={t("snake.title")}
    >
      <p className="text-[11px] font-semibold text-gray-400">{t("snake.title")}</p>
      <p className="mt-1 text-[11px] leading-snug text-gray-500">
        {t("snake.hint")}
      </p>
      <p className="mt-2 rounded-lg border border-amber-700/40 bg-amber-950/30 px-2.5 py-2 text-[12px] font-semibold leading-snug text-amber-100">
        {t("snake.challenge")}
      </p>
      <div className="mt-2 flex flex-col items-center gap-1 text-sm">
        <div className="flex items-center justify-center gap-4">
          <p className="font-bold text-amber-200">
            {t("snake.score").replace("{n}", String(score))}
          </p>
          <p className="text-xs text-gray-400">
            {t("snake.best").replace("{n}", String(best))}
          </p>
        </div>
        <p className="text-[11px] text-emerald-300/90">
          {t("snake.winners").replace(
            "{n}",
            winners == null ? "…" : String(winners)
          )}
        </p>
      </div>

      <div className="relative mx-auto mt-3 w-full max-w-[280px]">
        <div
          ref={boardRef}
          dir="ltr"
          className="aspect-square w-full touch-none select-none overflow-hidden rounded-xl border border-slate-700 bg-slate-950"
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${ROWS}, minmax(0, 1fr))`,
          }}
        >
          {Array.from({ length: ROWS * COLS }, (_, i) => {
            const x = i % COLS;
            const y = Math.floor(i / COLS);
            const k = `${x},${y}`;
            const isHead = k === headKey;
            const isBody = snakeSet.has(k);
            const isFood = food.x === x && food.y === y;
            return (
              <div
                key={k}
                className={`relative flex items-center justify-center overflow-visible leading-none ${
                  isHead
                    ? "bg-primary text-black"
                    : isBody
                      ? "bg-amber-500/80"
                      : "bg-transparent"
                }`}
              >
                {isFood ? (
                  <span
                    className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-[22px] sm:text-[26px]"
                    aria-hidden
                  >
                    🍔
                  </span>
                ) : isHead ? (
                  "●"
                ) : (
                  ""
                )}
              </div>
            );
          })}
        </div>
        {showWin ? (
          <div
            className="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-slate-950/90 p-3"
            role="status"
          >
            <div className="space-y-2 text-center">
              <p className="text-sm font-extrabold text-primary">
                {t("snake.winTitle")}
              </p>
              <p className="text-[12px] font-semibold leading-snug text-amber-100">
                {t("snake.winBody")}
              </p>
              <a
                href={winWaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center rounded-full bg-[#25D366] px-3 py-2.5 text-xs font-extrabold text-white shadow-md shadow-[#25D366]/30"
              >
                {t("snake.winWaBtn")}
              </a>
            </div>
          </div>
        ) : null}
      </div>

      <div
        className="mx-auto mt-3 flex w-full max-w-[280px] items-center justify-between gap-3"
        dir="ltr"
      >
        <button
          type="button"
          onClick={start}
          className="rounded-lg border border-primary/50 bg-primary/15 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/25"
        >
          {!running && score === 0 ? t("snake.play") : t("snake.restart")}
        </button>
        <button
          type="button"
          onClick={pauseToggle}
          disabled={!running && score === 0}
          className="rounded-lg border border-slate-600 bg-slate-800/80 px-3 py-2 text-xs font-semibold text-gray-100 hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {running ? t("snake.pause") : t("snake.resume")}
        </button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1.5 justify-items-center" dir="ltr">
        <span />
        <button
          type="button"
          aria-label={t("snake.up")}
          onClick={() => {
            if (!stateRef.current.running) {
              stateRef.current.running = true;
              setRunning(true);
            }
            setDir({ x: 0, y: -1 });
          }}
          className="h-[2.75rem] w-[3.3rem] rounded-lg border border-slate-600 bg-slate-800 text-xl text-gray-100 active:bg-slate-700"
        >
          ▲
        </button>
        <span />
        <button
          type="button"
          aria-label={t("snake.left")}
          onClick={() => {
            if (!stateRef.current.running) {
              stateRef.current.running = true;
              setRunning(true);
            }
            setDir({ x: -1, y: 0 });
          }}
          className="h-[2.75rem] w-[3.3rem] rounded-lg border border-slate-600 bg-slate-800 text-xl text-gray-100 active:bg-slate-700"
        >
          ◀
        </button>
        <button
          type="button"
          aria-label={t("snake.down")}
          onClick={() => {
            if (!stateRef.current.running) {
              stateRef.current.running = true;
              setRunning(true);
            }
            setDir({ x: 0, y: 1 });
          }}
          className="h-[2.75rem] w-[3.3rem] rounded-lg border border-slate-600 bg-slate-800 text-xl text-gray-100 active:bg-slate-700"
        >
          ▼
        </button>
        <button
          type="button"
          aria-label={t("snake.right")}
          onClick={() => {
            if (!stateRef.current.running) {
              stateRef.current.running = true;
              setRunning(true);
            }
            setDir({ x: 1, y: 0 });
          }}
          className="h-[2.75rem] w-[3.3rem] rounded-lg border border-slate-600 bg-slate-800 text-xl text-gray-100 active:bg-slate-700"
        >
          ▶
        </button>
      </div>
    </section>
  );
}
