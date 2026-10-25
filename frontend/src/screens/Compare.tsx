/** Two to four markets side by side, plus the trade-off each choice implies.
 *
 * The trade-offs are computed, not narrated: where two markets differ by more
 * than five percentile points on a factor, that is a real trade and it is named.
 */

import { useMemo, useState } from "react";
import type { ScoredMarket } from "../api";
import { factorLabel, formatMetric, scoreColor, scoredFactors, shortName } from "../model";
import { useStore } from "../store";
import { Card, Empty, SectionTitle } from "../components/Bits";
import { Count } from "../ui";

const METRIC_ROWS: [string, string][] = [
  ["population", "Population"],
  ["target_population", "In target age range"],
  ["target_age_share", "Target-age share"],
  ["median_household_income", "Median household income"],
  ["high_income_share", "Above income floor"],
  ["population_growth", "Population growth"],
  ["income_growth", "Income growth"],
  ["bachelor_degree_share", "Bachelor's or higher"],
  ["median_rent", "Median gross rent"],
];

interface TradeOff {
  factor: string;
  difference: number;
  favors: string;
}

function tradeOffs(a: ScoredMarket, b: ScoredMarket): TradeOff[] {
  const shared = Object.keys(a.factor_scores).filter((f) => f in b.factor_scores);
  return shared
    .map((factor) => ({
      factor,
      difference: Math.round(Math.abs(a.factor_scores[factor] - b.factor_scores[factor]) * 100) / 100,
      favors: a.factor_scores[factor] > b.factor_scores[factor] ? a.name : b.name,
    }))
    .filter((trade) => trade.difference >= 5)
    .sort((x, y) => y.difference - x.difference);
}

export function CompareScreen() {
  const { markets, pinned, togglePin, effective, go } = useStore();

  const selected = useMemo(
    () => pinned.map((id) => markets.find((m) => m.market_id === id)).filter(Boolean) as ScoredMarket[],
    [pinned, markets]
  );

  if (!markets.length) {
    return (
      <Empty code="Board is empty" title="Nothing to compare yet.">
        <button className="btn btn-primary" onClick={() => go("strategy")}>
          Go to strategy
        </button>
      </Empty>
    );
  }

  if (selected.length < 2) {
    return (
      <Empty code={`${pinned.length} of 2 pinned`} title="Pin at least two markets.">
        <p className="note" style={{ marginBottom: 18 }}>
          Pin them from the ranking in the war room, or start with the current top four.
        </p>
        <div className="row">
          <button
            className="btn btn-primary"
            onClick={() => markets.slice(0, 4).forEach((m) => togglePin(m.market_id))}
            disabled={pinned.length > 0}
          >
            Compare the top four
          </button>
          <button className="btn" onClick={() => go("warroom")}>
            Back to the ranking
          </button>
        </div>
      </Empty>
    );
  }

  const factors = scoredFactors(markets);
  const best = (values: (number | null | undefined)[]) => {
    const numbers = values.filter((v): v is number => v != null);
    return numbers.length ? Math.max(...numbers) : null;
  };

  const pairs: [ScoredMarket, ScoredMarket][] = [];
  for (let i = 0; i < selected.length; i++) {
    for (let j = i + 1; j < selected.length; j++) pairs.push([selected[i], selected[j]]);
  }

  return (
    <div className="wide stack">
      <div className="spread" style={{ alignItems: "flex-end" }}>
        <div>
          <p className="kicker code">Head to head · {selected.length} targets</p>
          <h1 className="screen-title">Comparison</h1>
          <p className="lede" style={{ marginTop: 18, fontSize: 14, padding: "12px 18px" }}>
            Factor scores are percentiles across all {markets.length} metros. Raw values are
            the observations behind them.
          </p>
        </div>
        <button className="btn btn-sm" onClick={() => pinned.forEach(togglePin)}>
          Clear pins
        </button>
      </div>

      {/* Capped: columns of figures are only comparable if they sit close together. */}
      <Card pin="tape" i={1} style={{ maxWidth: 1100 }}>
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th className="left" style={{ width: "34%" }} scope="col">
                Measure
              </th>
              {selected.map((market) => (
                <th key={market.market_id} scope="col" style={{ minWidth: 140, paddingBlock: 12 }}>
                  <span className={`token ${market.rank === 1 ? "token-1" : ""}`}>{market.rank}</span>
                  <div
                    className="stencil"
                    style={{ fontSize: 24, lineHeight: 1, color: "var(--ink)", letterSpacing: "0.01em", marginTop: 6 }}
                  >
                    {shortName(market.name)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="left" style={{ fontWeight: 600 }}>
                Attractiveness
              </td>
              {selected.map((market) => (
                <td
                  key={market.market_id}
                  className="num"
                  style={{
                    fontWeight: 500,
                    fontSize: 22,
                    color:
                      market.score === best(selected.map((m) => m.score))
                        ? "var(--amber)"
                        : undefined,
                  }}
                >
                  <Count value={market.score} format={(n) => n.toFixed(1)} />
                </td>
              ))}
            </tr>

            <tr>
              <td className="left code" colSpan={selected.length + 1} style={{ paddingTop: 18, color: "var(--amber)" }}>
                Factor scores · percentile, 0–100
              </td>
            </tr>
            {factors.map((factor) => {
              const top = best(selected.map((m) => m.factor_scores[factor]));
              return (
                <tr key={factor}>
                  <td className="left">
                    {factorLabel(factor)}
                    <span className="hint num">
                      {" "}
                      ·{" "}
                      {effective[factor]
                        ? `weight ${(effective[factor] * 100).toFixed(0)}%`
                        : "unweighted"}
                    </span>
                  </td>
                  {selected.map((market) => {
                    const score = market.factor_scores[factor];
                    return (
                      <td
                        key={market.market_id}
                        className="num"
                        style={{
                          background:
                            score === undefined
                              ? undefined
                              : `rgba(184,50,42,${(score / 100) ** 1.8 * 0.14})`,
                          fontWeight: score === top ? 600 : 400,
                          color: score === top ? "var(--ink)" : "var(--ink-soft)",
                        }}
                      >
                        {score === top && score !== undefined ? (
                          <span style={{ color: "var(--amber)", fontSize: 9, marginRight: 6 }}>▲</span>
                        ) : null}
                        {score === undefined ? "—" : score.toFixed(0)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            <tr>
              <td className="left code" colSpan={selected.length + 1} style={{ paddingTop: 18, color: "var(--amber)" }}>
                Field evidence · as observed
              </td>
            </tr>
            {METRIC_ROWS.map(([metric, label]) => (
              <tr key={metric}>
                <td className="left">{label}</td>
                {selected.map((market) => (
                  <td key={market.market_id} className="num">
                    {formatMetric(metric, market.metrics[metric])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </Card>

      <div style={{ paddingTop: 12 }}>
        <SectionTitle title="What each choice trades away" aside="Gaps of five points or more." />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 26,
          }}
        >
          {pairs.map(([a, b], i) => {
            const trades = tradeOffs(a, b);
            return (
              <div
                key={`${a.market_id}-${b.market_id}`}
                className={`sticky ${i % 3 === 1 ? "sticky-blue" : i % 3 === 2 ? "sticky-paper" : ""}`}
                style={{ ["--i" as string]: i, ["--tilt" as string]: `${[-1.6, 1.2, -0.6, 1.8, -1.1, 0.7][i % 6]}deg` }}
              >
                <div className="marker" style={{ fontSize: 19, marginBottom: 10 }}>
                  {shortName(a.name)} <span style={{ color: "var(--red)" }}>vs</span>{" "}
                  {shortName(b.name)}
                </div>
                {trades.length === 0 ? (
                  <div className="hint" style={{ color: "var(--ink-soft)" }}>
                    No factor separates these two by more than five points. On this strategy
                    they are substitutes.
                  </div>
                ) : (
                  trades.map((trade) => (
                    <div key={trade.factor} className="spread" style={{ padding: "2px 0" }}>
                      <span className="note" style={{ color: "var(--ink-soft)" }}>{factorLabel(trade.factor)}</span>
                      <span>
                        <span className="num" style={{ color: "var(--red)", fontWeight: 600 }}>
                          +{trade.difference.toFixed(0)}
                        </span>{" "}
                        <span className="hint" style={{ color: "var(--ink-soft)" }}>{shortName(trade.favors)}</span>
                      </span>
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>
      </div>

      <TradeoffPlot pinned={selected} />
    </div>
  );
}

/** Two factors against each other, with the pinned markets called out.
 *  Shows whether the pinned set is buying one factor with another. */
function TradeoffPlot({ pinned }: { pinned: ScoredMarket[] }) {
  const { markets } = useStore();
  const factors = scoredFactors(markets);
  const [x, setX] = useState(factors.includes("cost") ? "cost" : factors[0]);
  const [y, setY] = useState(factors.includes("growth") ? "growth" : factors[1]);

  const W = 640;
  const H = 380;
  const pad = { left: 46, right: 16, top: 16, bottom: 40 };
  const px = (score: number) => pad.left + (score / 100) * (W - pad.left - pad.right);
  const py = (score: number) => H - pad.bottom - (score / 100) * (H - pad.top - pad.bottom);
  const pinnedIds = new Set(pinned.map((m) => m.market_id));

  return (
    <div>
      <Card title="Trade-off plot" aside="every metro; pinned markets labelled" pin="blue" style={{ maxWidth: 1100 }}>
        <div className="row" style={{ marginBottom: 14 }}>
          <span className="hint">Horizontal</span>
          <select value={x} onChange={(e) => setX(e.target.value)} style={{ width: 150 }}>
            {factors.map((f) => (
              <option key={f} value={f}>
                {factorLabel(f)}
              </option>
            ))}
          </select>
          <span className="hint">Vertical</span>
          <select value={y} onChange={(e) => setY(e.target.value)} style={{ width: 150 }}>
            {factors.map((f) => (
              <option key={f} value={f}>
                {factorLabel(f)}
              </option>
            ))}
          </select>
        </div>

        <svg viewBox={`0 0 ${W} ${H}`} className="graph-paper" style={{ width: "100%", height: "auto" }}>
          {[0, 25, 50, 75, 100].map((tick) => (
            <g key={tick}>
              <line
                x1={px(tick)}
                x2={px(tick)}
                y1={pad.top}
                y2={H - pad.bottom}
                stroke="var(--rule)"
                strokeWidth={tick === 50 ? 1 : 0.5}
              />
              <line
                x1={pad.left}
                x2={W - pad.right}
                y1={py(tick)}
                y2={py(tick)}
                stroke="var(--rule)"
                strokeWidth={tick === 50 ? 1 : 0.5}
              />
              <text x={px(tick)} y={H - pad.bottom + 14} textAnchor="middle" fontSize={10} fill="var(--faint)" className="num">
                {tick}
              </text>
              <text x={pad.left - 8} y={py(tick) + 3} textAnchor="end" fontSize={10} fill="var(--faint)" className="num">
                {tick}
              </text>
            </g>
          ))}

          {/* Each dot is positioned by a CSS transform, so changing an axis
              glides every metro to its new place instead of redrawing. */}
          {markets.map((market) => {
            const mx = market.factor_scores[x];
            const my = market.factor_scores[y];
            if (mx === undefined || my === undefined) return null;
            if (pinnedIds.has(market.market_id)) return null;
            return (
              <circle
                key={market.market_id}
                className="dot-move"
                r={2.3}
                fill={scoreColor(market.score)}
                opacity={0.8}
                style={{ transform: `translate(${px(mx)}px, ${py(my)}px)` }}
              >
                <title>{`${market.name} — ${factorLabel(x)} ${mx.toFixed(0)}, ${factorLabel(y)} ${my.toFixed(0)}`}</title>
              </circle>
            );
          })}

          {pinned.map((market) => {
            const mx = market.factor_scores[x];
            const my = market.factor_scores[y];
            if (mx === undefined || my === undefined) return null;
            return (
              <g
                key={market.market_id}
                className="dot-move"
                style={{ transform: `translate(${px(mx)}px, ${py(my)}px)` }}
              >
                <ellipse cx={3} cy={4} rx={7} ry={4.5} fill="rgba(60,38,14,.25)" />
                <circle r={7} fill="var(--red)" stroke="var(--red-deep)" strokeWidth={1} />
                <circle cx={-2.2} cy={-2.4} r={2.2} fill="rgba(255,255,255,.55)" />
                <text
                  x={px(mx) > W - 170 ? -13 : 13}
                  textAnchor={px(mx) > W - 170 ? "end" : "start"}
                  y={4}
                  fontSize={11}
                  fontWeight={500}
                  fill="var(--ink)"
                  stroke="#fbf8ef"
                  strokeWidth={3.5}
                  paintOrder="stroke"
                  style={{ fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.05em" }}
                >
                  {shortName(market.name)}
                </text>
                <title>{`${market.name} — ${factorLabel(x)} ${mx.toFixed(0)}, ${factorLabel(y)} ${my.toFixed(0)}`}</title>
              </g>
            );
          })}

          <text x={W - pad.right} y={H - 6} textAnchor="end" fontSize={10} fill="var(--amber)" className="num">
            {factorLabel(x).toUpperCase()} →
          </text>
          <text x={pad.left + 8} y={pad.top + 12} fontSize={10} fill="var(--amber)" className="num">
            ↑ {factorLabel(y).toUpperCase()}
          </text>
        </svg>
      </Card>
    </div>
  );
}
