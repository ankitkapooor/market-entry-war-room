/** The selected market, in three separated layers:
 *  what the model concluded, how the factors contributed, and the raw evidence.
 *
 * The three are never blended: a percentile is not a dollar figure, and a
 * weighted contribution is neither. The first two sit on the dossier card;
 * the evidence gets its own sheet.
 */

import { useEffect, useState } from "react";
import { api, type MarketDetail as MarketDetailPayload, type ScoredMarket } from "../api";
import { FACTOR_ORDER, factorColor, factorLabel, formatMetric, pct, shortName } from "../model";
import { useStore } from "../store";
import { Card, ScoreBar, SectionHeading } from "./Bits";
import { Count } from "../ui";

const METRIC_LABELS: Record<string, string> = {
  population: "Population",
  target_population: "In target age range",
  target_age_share: "Target-age share",
  median_household_income: "Median household income",
  high_income_share: "Above income floor",
  population_growth: "Population growth",
  income_growth: "Income growth",
  bachelor_degree_share: "Bachelor's degree or higher",
  median_rent: "Median gross rent",
  competitive_density: "Competing establishments",
};

export function MarketDetailPanel({ market }: { market: ScoredMarket }) {
  const { effective, markets, pinned, togglePin, sensitivity } = useStore();

  // Weighted factors first, best to worst; then factors that scored but were
  // given no weight, so it is visible what this strategy is choosing to ignore.
  const contributions = FACTOR_ORDER.filter((f) => market.factor_scores[f] !== undefined)
    .map((factor) => ({
      factor,
      score: market.factor_scores[factor],
      weight: effective[factor] ?? 0,
      contribution: market.factor_scores[factor] * (effective[factor] ?? 0),
    }))
    .sort((a, b) => Number(b.weight > 0) - Number(a.weight > 0) || b.score - a.score);

  const robustness = sensitivity?.markets.find((m) => m.market_id === market.market_id);
  const isPinned = pinned.includes(market.market_id);
  const subtitle = market.name.split(",").slice(1).join(",").trim();

  return (
    <Card pin="blue" i={2}>
      <div className="spread" style={{ alignItems: "center", marginTop: 4 }}>
        <span className="code" style={{ color: "var(--faint)" }}>
          Target dossier · CBSA {market.market_id}
        </span>
        <span className="stamp" key={market.market_id} style={{ color: market.rank === 1 ? "var(--red)" : "var(--blue)" }}>
          {market.rank === 1 ? "Objective" : `Rank ${market.rank}`}
        </span>
      </div>

      <div key={market.market_id} className="rise" style={{ marginTop: 14 }}>
        <div className="dossier-name">{shortName(market.name)}</div>
        <div className="hint" style={{ marginTop: 6 }}>
          {subtitle}
        </div>
      </div>

      <div className="gauges">
        <div className="gauge">
          <span className="num" style={{ color: "var(--red)" }}>
            <Count value={market.score} format={(n) => n.toFixed(1)} />
          </span>
          <span className="code">Score</span>
        </div>
        <div className="gauge">
          <span className="num">
            #<Count value={market.rank} format={(n) => Math.round(n).toString()} />
          </span>
          <span className="code">of {markets.length}</span>
        </div>
        <div className="gauge">
          <span className="num" style={{ color: robustness ? "var(--blue)" : "var(--faint)" }}>
            {robustness ? (
              <Count value={robustness.top_3_probability * 100} format={(n) => `${n.toFixed(0)}%`} />
            ) : (
              "—"
            )}
          </span>
          <span className="code">{robustness ? "Top-3 odds" : "Untested"}</span>
        </div>
      </div>

      <button
        className={`btn btn-sm ${isPinned ? "" : "btn-ghost"}`}
        onClick={() => togglePin(market.market_id)}
        style={{ marginTop: 16, width: "100%" }}
        disabled={!isPinned && pinned.length >= 4}
      >
        {isPinned ? "Unpin from comparison" : "+ Pin to comparison"}
      </button>

      <div style={{ marginTop: 24 }}>
        <SectionHeading title="Factor scores" aside="percentile · contribution" />
        {contributions.map(({ factor, score, weight, contribution }, i) => (
          <div key={factor} className="factor-row" style={{ opacity: weight > 0 ? 1 : 0.55 }}>
            <div className="spread" style={{ marginBottom: 6, alignItems: "center" }}>
              <span style={{ display: "flex", alignItems: "center", fontWeight: 500 }}>
                <span className="swatch" style={{ background: factorColor(factor) }} />
                {factorLabel(factor)}
              </span>
              <span className="num">
                {score.toFixed(0)}
                <span className="hint"> · {weight > 0 ? contribution.toFixed(1) : "—"}</span>
              </span>
            </div>
            <ScoreBar
              key={`${market.market_id}-${factor}`}
              value={score}
              delay={i * 70}
              color={weight === 0 ? "var(--line-strong)" : factorColor(factor)}
            />
            <div className="hint" style={{ marginTop: 4, fontSize: 11.5 }}>
              {weight > 0 ? `weight ${pct(weight)}` : "no weight — scored but excluded"}
            </div>
          </div>
        ))}
        <p className="hint" style={{ marginTop: 12 }}>
          Contributions sum to the score. A percentile is the market's standing against the
          other {markets.length}, not an absolute measure.
        </p>
      </div>
    </Card>
  );
}

/** The observations behind the selected market, with their sources. */
export function EvidenceCard({ market }: { market: ScoredMarket }) {
  const [detail, setDetail] = useState<MarketDetailPayload | null>(null);

  useEffect(() => {
    let current = true;
    setDetail(null);
    api
      .marketDetail(market.market_id)
      .then((payload) => current && setDetail(payload))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [market.market_id]);

  // The newest vintage per metric, so the card can cite what it is showing.
  const provenance = new Map<string, { source: string; vintage: number }>();
  for (const observation of detail?.metrics ?? []) {
    const existing = provenance.get(observation.metric);
    if (!existing || observation.vintage > existing.vintage) {
      provenance.set(observation.metric, {
        source: observation.source,
        vintage: observation.vintage,
      });
    }
  }

  return (
    <Card title="Field evidence" aside={shortName(market.name)} pin="brass" i={5}>
      <table>
        <tbody key={market.market_id}>
          {Object.keys(METRIC_LABELS).map((metric, i) => {
            const raw = market.metrics[metric];
            const normalized = market.metric_scores?.[metric];
            const cite = provenance.get(metric);
            return (
              <tr key={metric} className="rise" style={{ ["--i" as string]: i }}>
                <td className="left" style={{ whiteSpace: "normal", paddingLeft: 0 }}>
                  {METRIC_LABELS[metric]}
                  {cite ? (
                    <div className="hint num" style={{ fontSize: 11 }}>
                      {cite.source} {cite.vintage}
                    </div>
                  ) : raw === null || raw === undefined ? (
                    <div className="hint" style={{ fontSize: 11 }}>
                      no source covers this
                    </div>
                  ) : null}
                </td>
                <td
                  className="num"
                  style={{ paddingRight: 0, color: raw == null ? "var(--faint)" : undefined, fontWeight: 500 }}
                >
                  {formatMetric(metric, raw)}
                  <div className="hint num" style={{ fontSize: 11, fontWeight: 400 }}>
                    {normalized === undefined ? "—" : `${normalized.toFixed(0)} pctl`}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="hint" style={{ marginTop: 12 }}>
        Growth is the change between the two ACS vintages, not an annualised rate. Rent is
        residential, standing in for operating cost.
      </p>
    </Card>
  );
}
