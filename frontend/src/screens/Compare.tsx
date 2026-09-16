/** Two to four markets side by side, plus the trade-off each choice implies.
 *
 * The trade-offs are computed, not narrated: where two markets differ by more
 * than five percentile points on a factor, that is a real trade and it is named.
 */

import { useMemo, useState } from "react";
import type { ScoredMarket } from "../api";
import { factorLabel, formatMetric, scoreColor, scoredFactors, shortName } from "../model";
import { useStore } from "../store";
import { SectionHeading } from "../components/Bits";

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
      <div className="reading stack">
        <h1 className="mid">Nothing to compare yet.</h1>
        <button className="btn btn-primary" onClick={() => go("strategy")}>
          Go to strategy
        </button>
      </div>
    );
  }

  if (selected.length < 2) {
    return (
      <div className="reading stack">
        <h1 className="mid">Pin at least two markets.</h1>
        <p className="note">
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
      </div>
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
      <div className="spread">
        <div>
          <h1 className="mid">Comparison</h1>
          <p className="note">
            Factor scores are percentiles across all {markets.length} metros. Raw values are
            the observations behind them.
          </p>
        </div>
        <button className="btn btn-sm" onClick={() => pinned.forEach(togglePin)}>
          Clear pins
        </button>
      </div>

      {/* Capped: columns of figures are only comparable if they sit close together. */}
      <div className="panel" style={{ overflowX: "auto", maxWidth: 1020 }}>
        <table>
          <thead>
            <tr>
              <th className="left" style={{ width: "34%" }} scope="col">
                Measure
              </th>
              {selected.map((market) => (
                <th key={market.market_id} scope="col" style={{ minWidth: 130 }}>
                  <div style={{ fontWeight: 600, color: "var(--ink)" }}>
                    {shortName(market.name)}
                  </div>
                  <div className="hint num">rank {market.rank}</div>
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
                    fontWeight: 600,
                    fontSize: 15,
                    color:
                      market.score === best(selected.map((m) => m.score))
                        ? "var(--accent)"
                        : undefined,
                  }}
                >
                  {market.score.toFixed(1)}
                </td>
              ))}
            </tr>

            <tr>
              <td className="left label" colSpan={selected.length + 1} style={{ paddingTop: 14 }}>
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
                              : `rgba(110,172,218,${(score / 100) * 0.1})`,
                          fontWeight: score === top ? 600 : 400,
                          color: score === top ? "var(--ink)" : "var(--ink-soft)",
                        }}
                      >
                        {score === undefined ? "—" : score.toFixed(0)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            <tr>
              <td className="left label" colSpan={selected.length + 1} style={{ paddingTop: 14 }}>
                Raw values · as observed
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

      <div>
        <SectionHeading title="What each choice trades away" aside="gaps of 5 points or more" />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 1,
            background: "var(--rule)",
            border: "1px solid var(--rule)",
          }}
        >
          {pairs.map(([a, b]) => {
            const trades = tradeOffs(a, b);
            return (
              <div
                key={`${a.market_id}-${b.market_id}`}
                style={{ background: "var(--field)", padding: "12px 14px" }}
              >
                <div style={{ fontWeight: 600, marginBottom: 8 }}>
                  {shortName(a.name)} vs {shortName(b.name)}
                </div>
                {trades.length === 0 ? (
                  <div className="hint">
                    No factor separates these two by more than five points. On this strategy
                    they are substitutes.
                  </div>
                ) : (
                  trades.map((trade) => (
                    <div key={trade.factor} className="spread" style={{ padding: "2px 0" }}>
                      <span className="note">{factorLabel(trade.factor)}</span>
                      <span>
                        <span className="num" style={{ color: "var(--slate)" }}>
                          +{trade.difference.toFixed(0)}
                        </span>{" "}
                        <span className="hint">{shortName(trade.favors)}</span>
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
      <SectionHeading
        title="Trade-off plot"
        aside="every metro; pinned markets labelled"
      />
      <div className="panel" style={{ padding: "12px 14px" }}>
        <div className="row" style={{ marginBottom: 8 }}>
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

        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
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

          {markets.map((market) => {
            const mx = market.factor_scores[x];
            const my = market.factor_scores[y];
            if (mx === undefined || my === undefined) return null;
            const isPinned = pinnedIds.has(market.market_id);
            return (
              <circle
                key={market.market_id}
                cx={px(mx)}
                cy={py(my)}
                r={isPinned ? 5 : 2.2}
                fill={isPinned ? "var(--accent)" : scoreColor(market.score)}
                opacity={isPinned ? 1 : 0.45}
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
              <text
                key={market.market_id}
                x={px(mx) + 8}
                y={py(my) + 3}
                fontSize={11}
                fontWeight={500}
                fill="var(--ink)"
                stroke="var(--field)"
                strokeWidth={3}
                paintOrder="stroke"
              >
                {shortName(market.name)}
              </text>
            );
          })}

          <text x={W - pad.right} y={H - 6} textAnchor="end" fontSize={11} fill="var(--muted)">
            {factorLabel(x)} →
          </text>
          <text x={12} y={pad.top + 4} fontSize={11} fill="var(--muted)">
            ↑ {factorLabel(y)}
          </text>
        </svg>
      </div>
    </div>
  );
}
