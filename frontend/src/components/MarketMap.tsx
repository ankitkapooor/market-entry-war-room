/** Where the contenders are.
 *
 * The map answers geographic questions the table cannot: whether the strategy
 * is pointing at one region or several, and how isolated the winner is. Each
 * metro is a push pin — head size is population, colour is attractiveness —
 * so a large pale pin is a big market this strategy does not want. Red string
 * runs through the top five in rank order, the way a war room would tie its
 * leading targets together.
 */

import { useMemo, useRef, useState } from "react";
import geo from "../data/geo.json";
import { scoreColor, shortName } from "../model";
import { useStore } from "../store";
import { pathLength } from "../ui";
import { Card } from "./Bits";

const VIEWS = [
  { id: 10, label: "Top 10" },
  { id: 25, label: "Top 25" },
  { id: 0, label: "All" },
] as const;

const centroids: Record<string, number[]> = geo.metros;
const W = geo.width;
const H = geo.height;

/** Sagging string between consecutive points; returns the path and its length. */
function stringBetween(points: number[][]) {
  if (points.length < 2) return { d: "", length: 0 };
  let d = `M${points[0][0]},${points[0][1]}`;
  const sampled: number[][] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const sag = Math.min(46, Math.hypot(x1 - x0, y1 - y0) * 0.14);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2 + sag;
    d += `Q${cx},${cy} ${x1},${y1}`;
    for (let t = 0.1; t <= 1.001; t += 0.1) {
      const u = 1 - t;
      sampled.push([u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1]);
    }
  }
  return { d, length: Math.ceil(pathLength(sampled)) + 4 };
}

/** A hand-drawn grease-pencil loop around a point, overshooting its start. */
function pencilLoop(r: number) {
  const points: number[][] = [];
  for (let a = -0.4; a <= Math.PI * 2 + 0.5; a += 0.16) {
    const wobble = 1 + 0.07 * Math.sin(a * 3 + 1) + a * 0.012;
    points.push([Math.cos(a) * r * 1.12 * wobble, Math.sin(a) * r * 0.86 * wobble]);
  }
  const d = points.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
  return { d, length: Math.ceil(pathLength(points)) + 4 };
}

export function MarketMap() {
  const { markets, selected, select } = useStore();
  const wrap = useRef<HTMLDivElement>(null);
  const [limit, setLimit] = useState<number>(25);
  const [hover, setHover] = useState<{ id: string; left: number; top: number } | null>(null);

  const shown = useMemo(() => {
    const inFrame = markets.filter((m) => centroids[m.market_id]);
    const subset = limit > 0 ? inFrame.slice(0, limit) : inFrame;
    // Draw strongest last so the winners sit on top of the pile.
    return [...subset].sort((a, b) => b.rank - a.rank);
  }, [markets, limit]);

  const radius = useMemo(() => {
    const populations = shown.map((m) => m.metrics.population ?? 0);
    const max = Math.max(1, ...populations);
    return (population: number | null | undefined) =>
      4.2 + 10 * Math.sqrt((population ?? 0) / max);
  }, [shown]);

  const top = markets.filter((m) => centroids[m.market_id]).slice(0, 5);
  const topKey = top.map((m) => m.market_id).join("-");
  const string = useMemo(
    () => stringBetween(top.map((m) => centroids[m.market_id])),
    // The string only needs redrawing when the top five change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [topKey]
  );

  const offFrame = markets.filter((m) => !centroids[m.market_id]);
  const hovered = hover ? markets.find((m) => m.market_id === hover.id) : null;
  const target = markets.find((m) => m.market_id === selected) ?? markets[0];
  const targetAt = target ? centroids[target.market_id] : undefined;
  const loop = target ? pencilLoop(radius(target.metrics.population) + 11) : null;

  return (
    <Card
      title="Theater of operations"
      aside={`${shown.length} of ${markets.length} metros pinned`}
      className="map-card"
      pin="tape"
      i={1}
    >
      <div className="map-wrap" ref={wrap}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
          <path className="map-land" d={geo.outline} />
          <path className="map-border" d={geo.borders} />
          <path className="map-outline" d={geo.outline} />

          <Compass x={W - 62} y={H - 70} />

          {shown.map((market, idx) => {
            const [x, y] = centroids[market.market_id];
            const r = radius(market.metrics.population);
            return (
              <g
                key={market.market_id}
                className="pin"
                transform={`translate(${x} ${y})`}
                onMouseEnter={(e) => {
                  const box = e.currentTarget.getBoundingClientRect();
                  const host = wrap.current!.getBoundingClientRect();
                  setHover({
                    id: market.market_id,
                    left: box.left + box.width / 2 - host.left,
                    top: box.top - host.top,
                  });
                }}
                onMouseLeave={() => setHover(null)}
                onClick={() => select(market.market_id)}
              >
                <title>{`${market.name} — rank ${market.rank}, score ${market.score}`}</title>
                <g
                  className="pin-drop"
                  style={{ ["--i" as string]: Math.min(shown.length - 1 - idx, 60) }}
                >
                  <ellipse className="pin-shadow" cx={r * 0.55} cy={r * 0.75} rx={r} ry={r * 0.62} />
                  <g className="pin-lift">
                    <circle className="pin-head" r={r} fill={scoreColor(market.score)} />
                    <circle className="pin-shine" cx={-r * 0.32} cy={-r * 0.34} r={r * 0.3} />
                  </g>
                </g>
              </g>
            );
          })}

          {string.d ? (
            <path
              key={topKey}
              className="string"
              d={string.d}
              strokeDasharray={string.length}
              style={{ ["--len" as string]: string.length }}
            />
          ) : null}

          {top.map((market) => {
            const [x, y] = centroids[market.market_id];
            const r = radius(market.metrics.population);
            const name = shortName(market.name).toUpperCase();
            const width = (name.length + 3) * 9.3 + 16;
            const flip = x + r + 8 + width > W - 8;
            const lx = flip ? x - r - 8 - width : x + r + 8;
            const ly = y - r - 26;
            return (
              <g
                key={market.market_id}
                className="map-label"
                style={{ ["--i" as string]: market.rank }}
              >
                <rect x={lx} y={ly} width={width} height={24} rx={2} />
                <text x={lx + 8} y={ly + 17}>
                  <tspan className="rk">{String(market.rank).padStart(2, "0")}</tspan> {name}
                </text>
              </g>
            );
          })}

          {targetAt && loop ? (
            <g transform={`translate(${targetAt[0]} ${targetAt[1]})`} pointerEvents="none">
              <path
                key={`loop-${target.market_id}`}
                className="pencil"
                d={loop.d}
                strokeDasharray={loop.length}
                style={{ ["--len" as string]: loop.length }}
              />
              <g className="flag" key={`flag-${target.market_id}`}>
                <line x1={0} y1={0} x2={0} y2={-46} stroke="var(--ink)" strokeWidth={2.2} />
                <path className="flag-cloth" d="M1,-46 L30,-39 L1,-31 Z" fill="var(--blue)" />
                <circle cx={0} cy={-47} r={2.6} fill="var(--brass)" />
              </g>
            </g>
          ) : null}
        </svg>

        {hovered && hover ? (
          <div
            className="map-readout"
            style={{ left: hover.left, top: hover.top, transform: "translate(-50%, calc(-100% - 10px))" }}
          >
            #{hovered.rank} {shortName(hovered.name).toUpperCase()} · <b>{hovered.score.toFixed(1)}</b>
          </div>
        ) : null}
      </div>

      <div className="map-toolbar">
        <div className="map-legend">
          <span className="code" style={{ color: "var(--faint)" }}>
            Low
          </span>
          <div className="ramp">
            {Array.from({ length: 18 }, (_, i) => (
              <div
                key={i}
                style={{ background: scoreColor((i / 17) * 100), ["--i" as string]: i }}
              />
            ))}
          </div>
          <span className="code" style={{ color: "var(--faint)" }}>
            High
          </span>
          <span className="hint">Pin colour is attractiveness, pin size is population.</span>
        </div>
        <div className="segmented" role="group" aria-label="Metros to pin">
          {VIEWS.map((view) => (
            <button key={view.id} aria-pressed={limit === view.id} onClick={() => setLimit(view.id)}>
              {view.label}
            </button>
          ))}
        </div>
      </div>
      <p className="hint" style={{ marginTop: 10 }}>
        Click a pin to plant the flag on it. Red string ties the top five together in rank order.
        {offFrame.length ? ` ${offFrame.length} Puerto Rico metros are ranked but sit off this map.` : ""}
      </p>
    </Card>
  );
}

/** A small compass rose printed in the corner of the map; its needle settles. */
function Compass({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} opacity={0.8} pointerEvents="none">
      <circle r={30} fill="none" stroke="var(--line-strong)" strokeWidth={1} />
      <circle r={24} fill="none" stroke="var(--line-strong)" strokeWidth={0.6} strokeDasharray="2 3" />
      <path d="M-27,0 L0,4 L27,0 L0,-4 Z" fill="var(--line-strong)" />
      <g className="needle">
        <path d="M0,-27 L5,0 L0,27 L-5,0 Z" fill="var(--ink-soft)" />
        <path d="M0,-27 L5,0 L-5,0 Z" fill="var(--red)" />
      </g>
      <circle r={2.4} fill="var(--brass)" />
      <text y={-35} textAnchor="middle" fontSize={13} fontFamily="IBM Plex Mono, monospace" fontWeight={600} fill="var(--ink-soft)">
        N
      </text>
    </g>
  );
}
