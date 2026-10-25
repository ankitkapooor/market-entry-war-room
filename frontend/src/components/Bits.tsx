/** Small shared marks: cards, headings, caveats, bars, empty states. */

import type { CSSProperties, ReactNode } from "react";

/** A sheet of paper pinned (or taped) to the board. */
export function Card({
  title,
  aside,
  children,
  pin = "red",
  i = 0,
  className = "",
  style,
  bodyClass = "",
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  pin?: "red" | "blue" | "brass" | "tape" | "none";
  i?: number;
  className?: string;
  style?: CSSProperties;
  bodyClass?: string;
}) {
  const fastener =
    pin === "none" ? "" : pin === "tape" ? "taped" : `pinned ${pin === "red" ? "" : `pin-${pin}`}`;
  return (
    <section
      className={`card ${fastener} ${className}`}
      style={{ ["--i" as string]: i, ...style }}
    >
      {title ? (
        <div className="card-head">
          <h2 className="card-title">{title}</h2>
          {aside ? <span className="hint">{aside}</span> : null}
        </div>
      ) : null}
      <div className={`card-body ${bodyClass}`}>{children}</div>
    </section>
  );
}

/** A label taped to the cork above a group of cards. */
export function SectionTitle({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="section-title">
      <h2>{title}</h2>
      {aside ? <span className="hint">{aside}</span> : null}
    </div>
  );
}

export function SectionHeading({
  title,
  aside,
  code,
}: {
  title: string;
  aside?: ReactNode;
  code?: string;
}) {
  return (
    <div className="heading">
      <h3 className="label">
        {code ? <span className="heading-code">{code}</span> : null}
        {title}
      </h3>
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

/** A 0–100 score as a bar. Width is the score. */
export function ScoreBar({
  value,
  color = "var(--red)",
  height = 6,
  delay = 0,
}: {
  value: number;
  color?: string;
  height?: number;
  delay?: number;
}) {
  return (
    <div className="bar-track" style={{ height }}>
      <div
        className="bar-fill"
        style={{
          width: `${Math.max(0, Math.min(100, value))}%`,
          background: color,
          animationDelay: `${delay}ms`,
        }}
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

/** A screen with nothing to show yet: a note pinned to the board saying why. */
export function Empty({
  code,
  title,
  children,
}: {
  code: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div style={{ padding: "0 16px" }}>
      <div className="empty pinned">
        <span className="stamp">{code}</span>
        <h1 className="screen-title">{title}</h1>
        {children}
      </div>
    </div>
  );
}
