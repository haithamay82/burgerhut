import { useEffect, useRef, useState } from "react";

/**
 * מציג טקסט כאילו מקלידים, במחזור (הקלדה → המתנה → מחיקה → הפסקה).
 * לנגישות: המשפט המלא נשמר ב-sr-only; האנימציה ב-aria-hidden.
 */
export default function TypingLoopText({
  text,
  className = "",
  typeMs = 42,
  holdMs = 2600,
  deleteMs = 20,
  pauseMs = 550,
}) {
  const [visible, setVisible] = useState("");
  const timeoutRef = useRef(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!text) {
      setVisible("");
      return;
    }

    cancelledRef.current = false;

    const clear = () => {
      if (timeoutRef.current != null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    const schedule = (fn, ms) => {
      clear();
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        if (!cancelledRef.current) fn();
      }, ms);
    };

    const typeForward = (i) => {
      if (cancelledRef.current) return;
      if (i > text.length) {
        schedule(() => deleteBackward(text.length), holdMs);
        return;
      }
      setVisible(text.slice(0, i));
      schedule(() => typeForward(i + 1), typeMs);
    };

    const deleteBackward = (i) => {
      if (cancelledRef.current) return;
      if (i < 0) {
        schedule(() => typeForward(0), pauseMs);
        return;
      }
      setVisible(text.slice(0, i));
      schedule(() => deleteBackward(i - 1), deleteMs);
    };

    typeForward(0);

    return () => {
      cancelledRef.current = true;
      clear();
    };
  }, [text, typeMs, holdMs, deleteMs, pauseMs]);

  return (
    <>
      <span className="sr-only">{text}</span>
      <span className={className} aria-hidden="true">
        {visible}
        <span
          className="ms-0.5 inline-block h-[1.1em] w-px animate-pulse bg-current align-middle opacity-80"
          aria-hidden="true"
        />
      </span>
    </>
  );
}
