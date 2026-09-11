/** How fragile is the recommendation?
 *
 * Weights are perturbed within a band a thousand times and the whole ranking is
 * recomputed each time. The useful answer is not "Austin is first" but "Austin
 * is first in 94% of plausible weightings" — so rank intervals, not point ranks,
 * are the main display here.
 */

import { useState } from "react";
import { factorLabel, pct, shortName } from "../model";
import { useStore } from "../store";
import { Caveat, SectionHeading } from "../components/Bits";
import type { MarketSensitivity } from "../api";

const SHOWN = 15;

export function SensitivityScreen() {
  const { markets, sensitivity, simulate, simulating, go, stale, effective, scenario } = useStore();
  const [iterations, setIterations] = useState(1000);
  const [variation, setVariation] = useState(0.25);

  if (!markets.length) {
    return (
      <div className="reading stack">
        <h1 className="mid">Run a scenario first.</h1>
        <button className="btn btn-primary" onClick={() => go("strategy")}>
          Go to strategy
        </button>
      </div>
    );
  }

  const rows = sensitivity?.markets.slice(0, SHOWN) ?? [];
  const leader = rows[0];
  const worstRank = Math.max(4, ...rows.map((r) => r.rank_p90));
  const outdated = Boolean(sensitivity) && stale;

  return (
    <div className="wide stack">
      <div style={{ maxWidth: 720 }}>
        <h1 className="mid">Would this still be the answer if the assumptions moved?</h1>
        <p className="note">
          Each simulation multiplies every weight by a random factor inside the band below,
          renormalises to 100%, and re-ranks all {markets.length} metros. A market that holds
          its position across the band is a decision; one that does not is a coin toss.
        </p>
      </div>

      <div className="panel" style={{ padding: "14px 16px" }}>
        <div className="row" style={{ flexWrap: "wrap", gap: 24 }}>
          <div style={{ minWidth: 230 }}>
            <div className="spread">
              <span className="label">Weight variation</span>
              <span className="num">±{(variation * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min={5}
              max={100}
              step={5}
              value={variation * 100}
              onChange={(e) => setVariation(Number(e.target.value) / 100)}
              aria-label="Weight variation"
            />
            <div className="hint">
              How far each weight is allowed to drift from the current setting.
            </div>
          </div>

          <div style={{ minWidth: 170 }}>
            <div className="label" style={{ marginBottom: 4 }}>
              Simulations
            </div>
            <select
              value={iterations}
              onChange={(e) => setIterations(Number(e.target.value))}
              className="num"
            >
              {[250, 1000, 5000, 20000].map((n) => (
                <option key={n} value={n}>
                  {n.toLocaleString()}
                </option>
              ))}
            </select>
          </div>

          <div style={{ flex: 1 }} />

          <button
            className="btn btn-primary"
            onClick={() => simulate(iterations, variation)}
            disabled={simulating}
          >
            {simulating ? "Simulating…" : sensitivity ? "Run again" : "Run the simulation"}
          </button>
        </div>

        <div className="hint" style={{ marginTop: 10 }}>
          Perturbing{" "}
          <span className="num">
            {Object.keys(effective).map(factorLabel).join(", ").toLowerCase()}
          </span>
          . {scenario ? `Scenario ${scenario.scenario_id}.` : ""}
        </div>
      </div>

      {outdated ? (
        <Caveat>
          The weights have changed since this simulation ran, so these intervals describe the
          earlier set. Run it again to match the current assumptions.
        </Caveat>
      ) : null}

      {!sensitivity ? (
        <p className="note">
          Nothing has been simulated yet. The ranking on its own tells you what wins; this
          tells you whether the win means anything.
        </p>
      ) : (
        <>
          {leader ? (
            <div className="panel" style={{ padding: "16px 18px" }}>
              <div className="row" style={{ gap: 32, flexWrap: "wrap", alignItems: "baseline" }}>
                <div>
                  <div className="big">{shortName(leader.name)}</div>
                  <div className="hint">lowest mean rank across the band</div>
                </div>
                <div>
                  <div className="big num">{pct(leader.top_3_probability)}</div>
                  <div className="hint">finishes in the top 3</div>
                </div>
                <div>
                  <div className="big num">
                    {leader.rank_p10.toFixed(0)}–{leader.rank_p90.toFixed(0)}
                  </div>
                  <div className="hint">rank in the middle 80% of runs</div>
                </div>
                <div>
                  <div className="big num">{leader.mean_rank.toFixed(2)}</div>
                  <div className="hint">mean rank</div>
                </div>
              </div>
              <p className="note" style={{ marginTop: 12, maxWidth: 760 }}>
                Across{" "}
                <span className="num">{sensitivity.iterations.toLocaleString()}</span> weightings
                drawn within ±{pct(sensitivity.weight_variation)} of the current assumptions,{" "}
                {shortName(leader.name)} held a top-3 position{" "}
                {pct(leader.top_3_probability)} of the time.{" "}
                {leader.rank_std === 0
                  ? "Its rank never moved, so the choice does not hinge on the weights."
                  : `Its rank varied by ${leader.rank_std.toFixed(2)} on average, so the choice is stable but not fixed.`}
              </p>
            </div>
          ) : null}

          <div>
            <SectionHeading
              title="Rank interval"
              aside={`10th to 90th percentile across ${sensitivity.iterations.toLocaleString()} runs`}
            />
            <div className="panel" style={{ padding: "12px 16px" }}>
              <RankIntervals rows={rows} worstRank={worstRank} />
            </div>
          </div>

          <div>
            <SectionHeading title="Robustness and movement" aside="against the current ranking" />
            <div className="panel">
              <table>
                <thead>
                  <tr>
                    <th className="left" scope="col">
                      Market
                    </th>
                    <th scope="col">Base rank</th>
                    <th scope="col">Mean rank</th>
                    <th scope="col">Movement</th>
                    <th scope="col">Rank sd</th>
                    <th scope="col">Top 3</th>
                    <th scope="col" style={{ width: 150 }} />
                    <th scope="col">Top 5</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const drift = row.mean_rank - row.base_rank;
                    return (
                      <tr key={row.market_id}>
                        <td className="left">{shortName(row.name)}</td>
                        <td className="num">{row.base_rank}</td>
                        <td className="num">{row.mean_rank.toFixed(2)}</td>
                        <td
                          className="num"
                          style={{
                            color:
                              Math.abs(drift) < 0.5
                                ? "var(--faint)"
                                : drift < 0
                                  ? "var(--slate)"
                                  : "var(--accent)",
                          }}
                        >
                          {Math.abs(drift) < 0.005
                            ? "held"
                            : `${drift > 0 ? "+" : ""}${drift.toFixed(2)}`}
                        </td>
                        <td className="num hint">{row.rank_std.toFixed(2)}</td>
                        <td className="num">{pct(row.top_3_probability)}</td>
                        <td>
                          <div className="bar-track" style={{ height: 5 }}>
                            <div
                              className="bar-fill"
                              style={{
                                width: `${row.top_3_probability * 100}%`,
                                background: "var(--slate)",
                              }}
                            />
                          </div>
                        </td>
                        <td className="num hint">{pct(row.top_5_probability)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="hint" style={{ marginTop: 8 }}>
              Movement is mean rank minus the rank under the current weights. A market that
              drifts upward under perturbation is being flattered by one specific assumption.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

/** One row per market: the bar spans p10 to p90, the tick is the median. */
function RankIntervals({ rows, worstRank }: { rows: MarketSensitivity[]; worstRank: number }) {
  const rowHeight = 22;
  const W = 900;
  const labelWidth = 168;
  const right = 56;
  const H = rows.length * rowHeight + 26;
  const scale = (rank: number) =>
    labelWidth + ((rank - 1) / Math.max(1, worstRank - 1)) * (W - labelWidth - right);

  const ticks = Array.from({ length: Math.min(worstRank, 20) }, (_, i) => i + 1).filter(
    (tick) => worstRank <= 12 || tick % 2 === 1 || tick === worstRank
  );

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
      {ticks.map((tick) => (
        <g key={tick}>
          <line
            x1={scale(tick)}
            x2={scale(tick)}
            y1={16}
            y2={H - 10}
            stroke="var(--rule)"
            strokeWidth={tick <= 3 ? 1 : 0.5}
          />
          <text
            x={scale(tick)}
            y={10}
            textAnchor="middle"
            fontSize={10}
            fill="var(--faint)"
            className="num"
          >
            {tick}
          </text>
        </g>
      ))}
      <rect
        x={scale(1)}
        y={16}
        width={scale(3) - scale(1)}
        height={H - 26}
        fill="var(--accent)"
        opacity={0.05}
      />

      {rows.map((row, i) => {
        const y = 16 + i * rowHeight + rowHeight / 2;
        const x1 = scale(row.rank_p10);
        const x2 = scale(row.rank_p90);
        return (
          <g key={row.market_id}>
            <text x={labelWidth - 10} y={y + 4} textAnchor="end" fontSize={11.5} fill="var(--ink)">
              {shortName(row.name)}
            </text>
            <line
              x1={x1}
              x2={Math.max(x2, x1 + 2)}
              y1={y}
              y2={y}
              stroke={i === 0 ? "var(--accent)" : "var(--slate-soft)"}
              strokeWidth={7}
              opacity={0.35}
            />
            <line
              x1={scale(row.rank_median)}
              x2={scale(row.rank_median)}
              y1={y - 6}
              y2={y + 6}
              stroke={i === 0 ? "var(--accent)" : "var(--slate)"}
              strokeWidth={2}
            />
            <text
              x={W - right + 10}
              y={y + 4}
              fontSize={11}
              fill="var(--muted)"
              className="num"
            >
              {row.rank_p10.toFixed(0)}–{row.rank_p90.toFixed(0)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
