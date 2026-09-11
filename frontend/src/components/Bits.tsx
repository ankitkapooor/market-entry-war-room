/** Small shared marks: section headings, caveats, bars. */

import type { ReactNode } from "react";

export function SectionHeading({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="heading">
      <h2 className="label">{title}</h2>
      {aside ? <span className="hint">{aside}</span> : null}
    </div>
  );
}

export function Caveat({ children }: { children: ReactNode }) {
  return (
    <div className="caveat">
      <span className="caveat-mark">!</span>
      <div>{children}</div>
    </div>
  );
}

/** A 0–100 score as a bar. Width is the score; colour carries no extra meaning. */
export function ScoreBar({
  value,
  color = "var(--slate)",
  height = 6,
}: {
  value: number;
  color?: string;
  height?: number;
}) {
  return (
    <div className="bar-track" style={{ height }}>
      <div
        className="bar-fill"
        style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }}
      />
    </div>
  );
}

/** label / value pair, value in tabular figures on the right. */
export function Readout({
  label,
  value,
  title,
}: {
  label: string;
  value: ReactNode;
  title?: string;
}) {
  return (
    <div className="spread" style={{ padding: "3px 0" }} title={title}>
      <span className="note">{label}</span>
      <span className="num">{value}</span>
    </div>
  );
}
