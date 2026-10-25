/** Motion primitives for the situation room: counters, decrypting text, a
 *  UTC clock, scroll reveals and row reordering. Every one of them settles
 *  instantly for readers who ask for reduced motion. */

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#/+-";

export function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () =>
      typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** Eases a number toward its latest value; counts up from zero on first render. */
export function Count({
  value,
  format = (n) => Math.round(n).toLocaleString(),
  duration = 800,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
}) {
  const reduced = useReducedMotion();
  const [current, setCurrent] = useState(reduced ? value : 0);
  const from = useRef(current);
  useEffect(() => {
    if (reduced) {
      from.current = value;
      setCurrent(value);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const next = origin + (value - origin) * (1 - Math.pow(1 - p, 3));
      from.current = next;
      setCurrent(next);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, reduced]);
  return <>{format(current)}</>;
}

/** Text that resolves out of noise, left to right, like an intercepted line
 *  being decoded. Re-runs whenever the text changes. */
export function Decrypt({ text, speed = 1, className }: { text: string; speed?: number; className?: string }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(text);
  useEffect(() => {
    if (reduced) {
      setShown(text);
      return;
    }
    let frame = 0;
    const id = setInterval(() => {
      frame += speed;
      let settled = true;
      const next = Array.from(text, (ch, i) => {
        if (ch === " " || frame >= 2 + i * 0.9) return ch;
        settled = false;
        return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      }).join("");
      setShown(next);
      if (settled) clearInterval(id);
    }, 34);
    return () => clearInterval(id);
  }, [text, speed, reduced]);
  return (
    <span className={className} aria-label={text}>
      <span aria-hidden="true">{shown}</span>
    </span>
  );
}

/** Characters typed out one at a time, with a block cursor while it types. */
export function Teletype({ text, delay = 0, cps = 70 }: { text: string; delay?: number; cps?: number }) {
  const reduced = useReducedMotion();
  const [count, setCount] = useState(reduced ? text.length : 0);
  useEffect(() => {
    if (reduced) {
      setCount(text.length);
      return;
    }
    setCount(0);
    let id = 0;
    const start = window.setTimeout(() => {
      id = window.setInterval(() => {
        setCount((c) => {
          if (c >= text.length) {
            clearInterval(id);
            return c;
          }
          return c + 1;
        });
      }, 1000 / cps);
    }, delay);
    return () => {
      clearTimeout(start);
      clearInterval(id);
    };
  }, [text, delay, cps, reduced]);
  return (
    <span aria-label={text}>
      <span aria-hidden="true">{text.slice(0, count)}</span>
      {count < text.length ? <span className="cursor" aria-hidden="true" /> : null}
    </span>
  );
}

/** Hours, minutes and seconds in UTC — the room runs on Zulu time. */
export function useZulu() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now.toISOString().slice(11, 19);
}

/** Adds `is-in` to the element once it scrolls into view. */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      el.classList.add("is-in");
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("is-in");
          observer.disconnect();
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -30px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}

/** Slides rows to their new positions when the order changes, so a re-rank
 *  reads as markets overtaking one another rather than a table redrawing.
 *  Rows carry `data-flip="<id>"`. */
export function useFlip(container: RefObject<HTMLElement>, order: string) {
  const reduced = useReducedMotion();
  const positions = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const rows = root.querySelectorAll<HTMLElement>("[data-flip]");
    const next = new Map<string, number>();
    const limit = root.clientHeight * 2 + 400;
    rows.forEach((row) => {
      const id = row.dataset.flip!;
      const top = row.offsetTop;
      next.set(id, top);
      const before = positions.current.get(id);
      if (reduced || before === undefined || before === top) return;
      const dy = before - top;
      if (Math.abs(dy) > limit) return;
      row.animate([{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }], {
        duration: 520,
        easing: "cubic-bezier(.2,.75,.2,1)",
      });
      row.animate(
        [
          { backgroundColor: dy > 0 ? "rgba(44,91,143,.16)" : "rgba(184,50,42,.12)" },
          { backgroundColor: "rgba(0,0,0,0)" },
        ],
        { duration: 900, easing: "ease-out" }
      );
    });
    positions.current = next;
  }, [order, reduced, container]);
}

const PIPS: Record<number, [number, number][]> = {
  1: [[2, 2]],
  2: [[1, 1], [3, 3]],
  3: [[1, 1], [2, 2], [3, 3]],
  4: [[1, 1], [3, 1], [1, 3], [3, 3]],
  5: [[1, 1], [3, 1], [2, 2], [1, 3], [3, 3]],
  6: [[1, 1], [3, 1], [1, 2], [3, 2], [1, 3], [3, 3]],
};

/** Dice that tumble and re-roll while `rolling`, then settle on a face. */
export function Dice({ rolling, count = 3 }: { rolling: boolean; count?: number }) {
  const reduced = useReducedMotion();
  const [faces, setFaces] = useState(() => Array.from({ length: count }, (_, i) => ((i * 2) % 6) + 1));
  useEffect(() => {
    if (!rolling || reduced) return;
    const id = setInterval(
      () => setFaces((f) => f.map(() => 1 + Math.floor(Math.random() * 6))),
      110
    );
    return () => clearInterval(id);
  }, [rolling, reduced, count]);
  return (
    <div className="dice" aria-hidden="true">
      {faces.map((face, i) => (
        <svg
          key={i}
          className="die"
          viewBox="0 0 40 40"
          style={rolling ? undefined : { animation: "none" }}
        >
          {PIPS[face].map(([x, y]) => (
            <circle key={`${x}${y}`} cx={x * 10} cy={y * 10} r={3.6} />
          ))}
        </svg>
      ))}
    </div>
  );
}

/** Length of a polyline, so a stroke can be drawn on from nothing. */
export const pathLength = (points: number[][]) =>
  points.reduce((sum, p, i) => (i ? sum + Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) : 0), 0);
