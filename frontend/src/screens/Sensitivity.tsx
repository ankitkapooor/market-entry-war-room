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
import { Card, Caveat, Empty } from "../components/Bits";
import { Count, Dice } from "../ui";
import type { MarketSensitivity } from "../api";

const SHOWN = 15;

export function SensitivityScreen() {
  const { markets, sensitivity, simulate, simulating, go, stale, effective, scenario } = useStore();
  const [iterations, setIterations] = useState(1000);
  const [variation, setVariation] = useState(0.25);

  if (!markets.length) {
    return (
      <Empty code="Board is empty" title="Run a scenario first.">
        <button className="btn btn-primary" onClick={() => go("strategy")}>
          Go to strategy
        </button>
      </Empty>
    );
  }

  const rows = sensitivity?.markets.slice(0, SHOWN) ?? [];
  const leader = rows[0];
  const worstRank = Math.max(4, ...rows.map((r) => r.rank_p90));
  const outdated = Boolean(sensitivity) && stale;

  return (
    <div className="wide stack">
      <div style={{ maxWidth: 820 }}>
        <p className="kicker code">Stress test · Monte Carlo war game</p>
        <h1 className="screen-title">Would this still be the answer if the assumptions moved?</h1>
        <p className="lede" style={{ maxWidth: 720 }}>
          Each simulation multiplies every weight by a random factor inside the band below,
          renormalises to 100%, and re-ranks all {markets.length} metros. A market that holds
          its position across the band is a decision; one that does not is a coin toss.
        </p>
      </div>

      <Card pin="tape" i={1}>
        <div className="row" style={{ flexWrap: "wrap", gap: 32 }}>
          <Dice rolling={simulating} />
          <div style={{ minWidth: 230 }}>
            <div className="spread">
              <span className="code" style={{ color: "var(--muted)" }}>Weight variation</span>
              <span className="num" style={{ color: "var(--amber)", fontSize: 16 }}>
                ±{(variation * 100).toFixed(0)}%
              </span>
            </div>
            <input
              type="range"
              min={5}
              max={100}
              step={5}
              value={variation * 100}
              onChange={(e) => setVariation(Number(e.target.value) / 100)}
              aria-label="Weight variation"
              style={{ ["--fill" as string]: `${((variation * 100 - 5) / 95) * 100}%` }}
            />
            <div className="hint">
              How far each weight is allowed to drift from the current setting.
            </div>
          </div>

          <div style={{ minWidth: 170 }}>
            <div className="code" style={{ color: "var(--muted)", marginBottom: 6 }}>
              Simulations
            </div>
            <select
              value={iterations}
              onChange={(e) => setIterations(Number(e.target.value))}
              className="num"
            >
              {[250, 1000, 2500, 5000].map((n) => (
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
            data-busy={simulating}
            style={{ minHeight: 46, paddingInline: 22 }}
          >
            {simulating ? "Simulating…" : sensitivity ? "Run again" : "Run the simulation"}
          </button>
        </div>

        <div className="hint" style={{ marginTop: 16 }}>
          Perturbing{" "}
          <span className="num">
            {Object.keys(effective).map(factorLabel).join(", ").toLowerCase()}
          </span>
          . {scenario ? `Scenario ${scenario.scenario_id}.` : ""}
        </div>
      </Card>

      {outdated ? (
        <Caveat>
          The weights have changed since this simulation ran, so these intervals describe the
          earlier set. Run it again to match the current assumptions.
        </Caveat>
      ) : null}

      {simulating ? (
        <div className="sticky" style={{ maxWidth: 420, ["--tilt" as string]: "-1deg" }}>
          <span className="code">Rolling</span>
          <span className="marker" style={{ fontSize: 22 }}>
            {iterations.toLocaleString()} war games…
          </span>
          <span className="hint" style={{ color: "var(--ink-soft)" }}>
            Re-ranking all {markets.length} metros under each weighting.
          </span>
        </div>
      ) : null}

      {!sensitivity ? (
        simulating ? null : (
          <div className="sticky sticky-paper" style={{ maxWidth: 460, ["--tilt" as string]: "1deg" }}>
            <span className="code">Not yet played</span>
            <p style={{ fontSize: 14, lineHeight: 1.6 }}>
              The ranking on its own tells you what wins; this tells you whether the win
              means anything. Roll the dice.
            </p>
          </div>
        )
      ) : (
        <div key={`${sensitivity.scenario_id}-${sensitivity.iterations}-${sensitivity.weight_variation}`} className="stack">
          {leader ? (
            <Card pin="red" i={0}>
              <div className="row" style={{ gap: 26, flexWrap: "wrap", alignItems: "center" }}>
                <SurvivalRing value={leader.top_3_probability} />
                <div style={{ minWidth: 200 }}>
                  <div className="code" style={{ color: "var(--faint)" }}>
                    Survives the war game
                  </div>
                  <div className="stencil" style={{ fontSize: 48, lineHeight: 0.92, color: "var(--ink)", marginTop: 6 }}>
                    {shortName(leader.name)}
                  </div>
                  <div className="hint">lowest mean rank across the band</div>
                </div>
                <div className="readouts" style={{ flex: 1, minWidth: 280 }}>
                  <div>
                    <span className="big num">
                      <Count value={leader.top_3_probability * 100} format={(n) => `${n.toFixed(0)}%`} />
                    </span>
                    <span className="code">Finishes top 3</span>
                  </div>
                  <div>
                    <span className="big num">
                      {leader.rank_p10.toFixed(0)}–{leader.rank_p90.toFixed(0)}
                    </span>
                    <span className="code">Middle 80% of runs</span>
                  </div>
                  <div>
                    <span className="big num">
                      <Count value={leader.mean_rank} format={(n) => n.toFixed(2)} />
                    </span>
                    <span className="code">Mean rank</span>
                  </div>
                </div>
              </div>
              <p className="note" style={{ marginTop: 18, maxWidth: 760 }}>
                Across{" "}
                <span className="num">{sensitivity.iterations.toLocaleString()}</span> weightings
                drawn within ±{pct(sensitivity.weight_variation)} of the current assumptions,{" "}
                {shortName(leader.name)} held a top-3 position{" "}
                {pct(leader.top_3_probability)} of the time.{" "}
                {leader.rank_std === 0
                  ? "Its rank never moved, so the choice does not hinge on the weights."
                  : `Its rank varied by ${leader.rank_std.toFixed(2)} on average, so the choice is stable but not fixed.`}
              </p>
            </Card>
          ) : null}

          <Card
            title="Rank interval"
            aside={`10th to 90th percentile across ${sensitivity.iterations.toLocaleString()} runs`}
            pin="tape"
            i={1}
          >
            <RankIntervals rows={rows} worstRank={worstRank} />
          </Card>

          <Card title="Robustness and movement" aside="against the current ranking" pin="blue" i={2}>
            <div style={{ overflowX: "auto" }}>
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
                  {rows.map((row, i) => {
                    const drift = row.mean_rank - row.base_rank;
                    return (
                      <tr key={row.market_id} className="rise" style={{ ["--i" as string]: i }}>
                        <td className="left" style={{ fontWeight: 500 }}>{shortName(row.name)}</td>
                        <td className="num">{row.base_rank}</td>
                        <td className="num">{row.mean_rank.toFixed(2)}</td>
                        <td
                          className="num"
                          style={{
                            color:
                              Math.abs(drift) < 0.5
                                ? "var(--faint)"
                                : drift < 0
                                  ? "var(--phosphor)"
                                  : "var(--red)",
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
                                background: i === 0 ? "var(--red)" : "var(--ink-soft)",
                                animationDelay: `${i * 40}ms`,
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
            <p className="hint" style={{ marginTop: 14 }}>
              Movement is mean rank minus the rank under the current weights. A market that
              drifts upward under perturbation is being flattered by one specific assumption.
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}

/** One row per market: the bar spans p10 to p90, the tick is the median. */
function RankIntervals({ rows, worstRank }: { rows: MarketSensitivity[]; worstRank: number }) {
  const rowHeight = 22;
  const W = 900;
  const labelWidth = 214;
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
        fill="var(--amber)"
        opacity={0.06}
      />

      {rows.map((row, i) => {
        const y = 16 + i * rowHeight + rowHeight / 2;
        const x1 = scale(row.rank_p10);
        const x2 = scale(row.rank_p90);
        const mid = scale(row.rank_median);
        return (
          <g key={row.market_id}>
            <text
              x={labelWidth - 10}
              y={y + 4}
              textAnchor="end"
              fontSize={11.5}
              fill={i === 0 ? "var(--amber)" : "var(--ink)"}
              style={{ fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.04em" }}
            >
              {shortName(row.name).length > 24 ? `${shortName(row.name).slice(0, 23)}…` : shortName(row.name)}
            </text>
            {/* The interval opens outward from the median. */}
            <rect
              className="interval"
              x={x1}
              y={y - 4}
              width={Math.max(x2 - x1, 2)}
              height={8}
              fill={i === 0 ? "var(--amber)" : "var(--amber-soft)"}
              opacity={i === 0 ? 0.55 : 0.3}
              style={{ ["--ox" as string]: `${mid}px`, ["--oy" as string]: `${y}px`, ["--i" as string]: i }}
            />
            <line
              x1={mid}
              x2={mid}
              y1={y - 7}
              y2={y + 7}
              stroke={i === 0 ? "var(--amber)" : "var(--ink-soft)"}
              strokeWidth={2}
              className="rise"
              style={{ ["--i" as string]: i }}
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

/** The leader's top-3 odds as a dial. */
function SurvivalRing({ value }: { value: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <svg width="104" height="104" viewBox="0 0 104 104" aria-hidden="true">
      <circle className="ring-track" cx="52" cy="52" r={r} strokeWidth="6" />
      {Array.from({ length: 20 }, (_, i) => {
        const a = (i / 20) * Math.PI * 2;
        return (
          <line
            key={i}
            x1={52 + Math.sin(a) * 48}
            y1={52 - Math.cos(a) * 48}
            x2={52 + Math.sin(a) * 51}
            y2={52 - Math.cos(a) * 51}
            stroke="var(--rule-strong)"
          />
        );
      })}
      <circle
        className="ring-value"
        cx="52"
        cy="52"
        r={r}
        strokeWidth="6"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - value)}
        transform="rotate(-90 52 52)"
        style={{ animation: "ring-fill 1.2s var(--ease) both", ["--c" as string]: c }}
      />
      <text x="52" y="57" textAnchor="middle" fill="var(--ink)" fontSize="17" className="num">
        {pct(value)}
      </text>
    </svg>
  );
}
