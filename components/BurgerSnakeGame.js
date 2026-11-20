import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "@/contexts/LocaleContext";

const COLS = 14;
const ROWS = 14;
const TICK_MS = 160;
/** אורך מינימלי: ראש + 3 חלקים */
const MIN_LEN = 4;

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
  const boardRef = useRef(null);

  const bump = useCallback(() => setFrame((n) => n + 1), []);

  const setDir = useCallback((next) => {
    const cur = stateRef.current.dir;
    if (cur.x + next.x === 0 && cur.y + next.y === 0) return;
    stateRef.current.pendingDir = next;
  }, []);

  const start = useCallback(() => {
    const next = initialState();
    next.best = stateRef.current.best;
    next.running = true;
    stateRef.current = next;
    setScore(0);
    setBest(next.best);
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
        const shrinkTo = Math.max(MIN_LEN, Math.ceil(body.length / 2));
        body = body.slice(0, shrinkTo);
        s.snake = [nextHead, ...body.slice(0, shrinkTo - 1)];
        bump();
        return;
      }

      const ate = nextHead.x === s.food.x && nextHead.y === s.food.y;
      if (ate) {
        s.snake = [nextHead, ...body];
        s.score += 1;
        if (s.score > s.best) s.best = s.score;
        s.food = randomEmptyCell(s.snake);
        setScore(s.score);
        setBest(s.best);
      } else {
        s.snake = [nextHead, ...body.slice(0, body.length - 1)];
      }
      bump();
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [bump]);

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
      <div className="mt-2 flex items-center justify-center gap-4 text-sm">
        <p className="font-bold text-amber-200">
          {t("snake.score").replace("{n}", String(score))}
        </p>
        <p className="text-xs text-gray-400">
          {t("snake.best").replace("{n}", String(best))}
        </p>
      </div>

      <div
        ref={boardRef}
        className="mx-auto mt-3 aspect-square w-full max-w-[280px] touch-none select-none overflow-hidden rounded-xl border border-slate-700 bg-slate-950"
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
              className={`flex items-center justify-center text-[10px] leading-none ${
                isHead
                  ? "bg-primary text-black"
                  : isBody
                    ? "bg-amber-500/80"
                    : "bg-transparent"
              }`}
            >
              {isFood ? "🍔" : isHead ? "●" : ""}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        {!running && score === 0 ? (
          <button
            type="button"
            onClick={start}
            className="rounded-lg border border-primary/50 bg-primary/15 px-4 py-2 text-xs font-semibold text-primary hover:bg-primary/25"
          >
            {t("snake.play")}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={pauseToggle}
              className="rounded-lg border border-slate-600 bg-slate-800/80 px-3 py-2 text-xs font-semibold text-gray-100 hover:border-slate-500"
            >
              {running ? t("snake.pause") : t("snake.resume")}
            </button>
            <button
              type="button"
              onClick={start}
              className="rounded-lg border border-primary/50 bg-primary/15 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/25"
            >
              {t("snake.restart")}
            </button>
          </>
        )}
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
          className="h-10 w-12 rounded-lg border border-slate-600 bg-slate-800 text-lg text-gray-100 active:bg-slate-700"
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
          className="h-10 w-12 rounded-lg border border-slate-600 bg-slate-800 text-lg text-gray-100 active:bg-slate-700"
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
          className="h-10 w-12 rounded-lg border border-slate-600 bg-slate-800 text-lg text-gray-100 active:bg-slate-700"
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
          className="h-10 w-12 rounded-lg border border-slate-600 bg-slate-800 text-lg text-gray-100 active:bg-slate-700"
        >
          ▶
        </button>
      </div>
    </section>
  );
}
