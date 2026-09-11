/** The selected market, in three separated layers:
 *  what the model concluded, how the factors contributed, and the raw evidence.
 *
 * The three are never blended: a percentile is not a dollar figure, and a
 * weighted contribution is neither.
 */

import { useEffect, useState } from "react";
import { api, type MarketDetail as MarketDetailPayload, type ScoredMarket } from "../api";
import { FACTOR_ORDER, factorLabel, formatMetric, pct, shortName } from "../model";
import { useStore } from "../store";
import { ScoreBar, SectionHeading } from "./Bits";

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

  // The newest vintage per metric, so the panel can cite what it is showing.
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
    <>
      <div className="block">
        <div className="spread" style={{ alignItems: "flex-start" }}>
          <div>
            <div className="mid">{shortName(market.name)}</div>
            <div className="hint">{market.name.split(",").slice(1).join(",").trim()}</div>
          </div>
          <span className="tag num">CBSA {market.market_id}</span>
        </div>

        <div className="row" style={{ gap: 20, marginTop: 12, alignItems: "baseline" }}>
          <div>
            <div className="big num">{market.score.toFixed(1)}</div>
            <div className="hint">Attractiveness</div>
          </div>
          <div>
            <div className="big num" style={{ color: market.rank === 1 ? "var(--accent)" : undefined }}>
              #{market.rank}
            </div>
            <div className="hint">of {markets.length}</div>
          </div>
          {robustness ? (
            <div>
              <div className="big num">{pct(robustness.top_3_probability)}</div>
              <div className="hint">Top-3 probability</div>
            </div>
          ) : null}
        </div>

        <button
          className="btn btn-sm"
          onClick={() => togglePin(market.market_id)}
          style={{ marginTop: 12 }}
          disabled={!isPinned && pinned.length >= 4}
        >
          {isPinned ? "Unpin from comparison" : "Pin to comparison"}
        </button>
      </div>

      <div className="block">
        <SectionHeading title="Factor scores" aside="percentile · contribution" />
        {contributions.map(({ factor, score, weight, contribution }) => (
          <div key={factor} style={{ padding: "5px 0", opacity: weight > 0 ? 1 : 0.6 }}>
            <div className="spread" style={{ marginBottom: 2 }}>
              <span>{factorLabel(factor)}</span>
              <span className="num">
                {score.toFixed(0)}
                <span className="hint"> · {weight > 0 ? contribution.toFixed(1) : "—"}</span>
              </span>
            </div>
            <ScoreBar
              value={score}
              color={
                weight === 0 ? "var(--rule-strong)" : score >= 70 ? "var(--slate)" : "var(--slate-soft)"
              }
            />
            <div className="hint">
              {weight > 0 ? `weight ${pct(weight)}` : "no weight — scored but excluded"}
            </div>
          </div>
        ))}
        <div className="hint" style={{ marginTop: 8 }}>
          Contributions sum to the attractiveness score. A percentile is the market's
          standing against the other {markets.length}, not an absolute measure.
        </div>
      </div>

      <div className="block">
        <SectionHeading title="Raw evidence" aside="observed values" />
        <table>
          <tbody>
            {Object.keys(METRIC_LABELS).map((metric) => {
              const raw = market.metrics[metric];
              const normalized = market.metric_scores?.[metric];
              const cite = provenance.get(metric);
              return (
                <tr key={metric}>
                  <td className="left" style={{ whiteSpace: "normal", paddingLeft: 0 }}>
                    {METRIC_LABELS[metric]}
                    {cite ? (
                      <div className="hint num">
                        {cite.source} {cite.vintage}
                      </div>
                    ) : raw === null || raw === undefined ? (
                      <div className="hint">no source covers this</div>
                    ) : null}
                  </td>
                  <td
                    className="num"
                    style={{ paddingRight: 0, color: raw == null ? "var(--faint)" : undefined }}
                  >
                    {formatMetric(metric, raw)}
                    <div className="hint num">
                      {normalized === undefined ? "—" : `${normalized.toFixed(0)} pctl`}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="hint" style={{ marginTop: 8 }}>
          Growth is the change between the two ACS vintages, not an annualised rate.
          Rent is residential, standing in for operating cost.
        </div>
      </div>
    </>
  );
}
