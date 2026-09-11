/** Where the contenders are.
 *
 * The map answers geographic questions the table cannot: whether the strategy
 * is pointing at one region or several, and how isolated the winner is. Circle
 * area is population, fill is attractiveness, so a large pale circle is a big
 * market the strategy does not want.
 */

import { useMemo, useState } from "react";
import geo from "../data/geo.json";
import { scoreColor, shortName } from "../model";
import { useStore } from "../store";

const VIEWS = [
  { id: 10, label: "Top 10" },
  { id: 25, label: "Top 25" },
  { id: 0, label: "All" },
] as const;

const centroids: Record<string, number[]> = geo.metros;

export function MarketMap() {
  const { markets, selected, select } = useStore();
  const [limit, setLimit] = useState<number>(25);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);

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
      2.4 + 8.5 * Math.sqrt((population ?? 0) / max);
  }, [shown]);

  const offFrame = markets.filter((m) => !centroids[m.market_id]);
  const hovered = hover ? markets.find((m) => m.market_id === hover.id) : null;

  return (
    <div className="map-frame">
      <div className="map-side map-side-left">
        <div>
          <div className="label" style={{ color: "var(--ink)", fontWeight: 600 }}>
            Geography
          </div>
          <div className="hint">
            Where the contenders are, and whether the strategy points at one region or
            several.
          </div>
        </div>

        <div style={{ marginTop: "auto" }}>
          <div className="hint" style={{ marginBottom: 3 }}>
            Attractiveness
          </div>
          <div style={{ display: "flex", height: 8 }}>
            {Array.from({ length: 22 }, (_, i) => (
              <div key={i} style={{ flex: 1, background: scoreColor((i / 21) * 100) }} />
            ))}
          </div>
          <div className="spread">
            <span className="num hint">0</span>
            <span className="num hint">100</span>
          </div>
          <div className="hint" style={{ marginTop: 6 }}>
            Circle area is population, so a large pale circle is a big market this strategy
            does not want.
          </div>
          {offFrame.length ? (
            <div className="hint" style={{ marginTop: 6 }}>
              {offFrame.length} Puerto Rico metros are ranked but sit outside this projection.
            </div>
          ) : null}
        </div>
      </div>

      <div className="map-plot">
      <svg viewBox={`0 0 ${geo.width} ${geo.height}`} preserveAspectRatio="xMidYMid meet">
        <path className="map-land" d={geo.outline} />
        <path className="map-border" d={geo.borders} />
        <path className="map-outline" d={geo.outline} />

        {shown.map((market) => {
          const [x, y] = centroids[market.market_id];
          return (
            <circle
              key={market.market_id}
              className="map-metro"
              cx={x}
              cy={y}
              r={radius(market.metrics.population)}
              fill={scoreColor(market.score)}
              onMouseEnter={() => setHover({ id: market.market_id, x, y })}
              onMouseLeave={() => setHover(null)}
              onClick={() => select(market.market_id)}
            >
              <title>{`${market.name} — rank ${market.rank}, score ${market.score}`}</title>
            </circle>
          );
        })}

        {shown
          .filter((market) => market.rank <= 5)
          .map((market) => {
            const [x, y] = centroids[market.market_id];
            return (
              <text
                key={market.market_id}
                x={x}
                y={y - radius(market.metrics.population) - 4}
                textAnchor="middle"
                fontSize={11}
                fontWeight={500}
                fill="var(--ink)"
                stroke="var(--field)"
                strokeWidth={3}
                paintOrder="stroke"
                pointerEvents="none"
              >
                {market.rank}. {shortName(market.name)}
              </text>
            );
          })}

        {selected && centroids[selected] ? (
          <circle
            className="map-selected"
            cx={centroids[selected][0]}
            cy={centroids[selected][1]}
            r={
              radius(markets.find((m) => m.market_id === selected)?.metrics.population ?? 0) + 3.5
            }
          />
        ) : null}
      </svg>

      {hovered && hover ? (
        <div
          className="map-readout"
          style={{
            left: `${(hover.x / geo.width) * 100}%`,
            top: `${(hover.y / geo.height) * 100}%`,
            transform: "translate(-50%, -220%)",
          }}
        >
          <span className="num">#{hovered.rank}</span> {shortName(hovered.name)}{" "}
          <span className="num">{hovered.score.toFixed(1)}</span>
        </div>
      ) : null}
      </div>

      <div className="map-side map-side-right">
        <div>
          <div className="hint" style={{ marginBottom: 4 }}>
            Showing
          </div>
          <div className="map-controls">
            {VIEWS.map((view) => (
              <button
                key={view.id}
                aria-pressed={limit === view.id}
                onClick={() => setLimit(view.id)}
              >
                {view.label}
              </button>
            ))}
          </div>
        </div>
        <div className="hint">
          <span className="num">{shown.length}</span> of{" "}
          <span className="num">{markets.length}</span> metros plotted. The top five are
          labelled.
        </div>
      </div>
    </div>
  );
}
