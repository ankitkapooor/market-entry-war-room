/** What the numbers mean and where they came from, including what is missing. */

import { FACTOR_MEANING, FACTOR_ORDER, factorLabel } from "../model";
import { useStore } from "../store";
import type { ReactNode } from "react";
import { Caveat, SectionHeading } from "../components/Bits";
import { useReveal } from "../ui";

/** Slides into place the first time it scrolls into view. */
function Reveal({ as = "div", children, delay = 0 }: {
  as?: "div" | "li";
  children: ReactNode;
  delay?: number;
}) {
  const ref = useReveal<HTMLDivElement & HTMLLIElement>();
  const Tag = as;
  return (
    <Tag ref={ref} className="reveal" style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </Tag>
  );
}

const STAGES: [string, string][] = [
  ["Business description", "One sentence about what is being opened and for whom."],
  ["Structured strategy", "Category, target age range, income floor, price positioning — editable."],
  ["Market metrics", "Nine metrics assembled per metro; three depend on the strategy."],
  ["Percentile normalisation", "Each metric becomes a 0–100 standing against the other metros."],
  ["Weighted scoring", "Metrics roll into six factors; factors are weighted into one score."],
  ["Ranking", "Markets ordered by score."],
  ["Monte Carlo sensitivity", "Weights perturbed and re-ranked, to test whether the order holds."],
];

const DEFINITIONS: [string, string][] = [
  ["Raw value", "An observation as published — 2,473,275 people, $98,508 of income. Comparable across markets only in its own unit."],
  ["Normalised score", "That raw value expressed as a percentile across the metros in the run. 100 means no metro is higher. Negative-direction metrics such as rent are flipped, so a cheap market scores high."],
  ["Factor score", "The weighted average of the normalised metrics inside one factor, over the metrics that exist. A missing metric is dropped and the rest carry the factor."],
  ["Overall score", "The weighted sum of factor scores. It is a percentile-of-percentiles: useful for ordering markets, meaningless as an absolute quantity."],
  ["Contribution", "A factor score times its effective weight. Contributions sum to the overall score, which is how you see what a market's rank is actually made of."],
  ["Robustness", "The share of simulated weightings in which a market still finishes in the top 3 or top 5."],
];

export function MethodologyScreen() {
  const { catalog, health } = useStore();

  return (
    <div className="reading stack doctrine">
      <div>
        <p className="kicker code">Doctrine · how the answer is made</p>
        <h1 className="screen-title">Methodology</h1>
        <p className="lede">
          The ranking is produced by an explicit model, not by a language model. A model is
          only worth as much as the reader's ability to audit it, so every stage is listed
          here with its inputs and its failure modes.
        </p>
      </div>

      <div>
        <SectionHeading title="The pipeline" aside="each stage feeds the next" />
        <ol className="chain">
          {STAGES.map(([stage, detail], i) => (
            <Reveal as="li" key={stage} delay={i * 60}>
              <span className="chain-node">{String(i + 1).padStart(2, "0")}</span>
              <span style={{ paddingTop: 5 }}>
                <span style={{ fontWeight: 600 }}>{stage}</span>
                <div className="note">{detail}</div>
              </span>
            </Reveal>
          ))}
        </ol>
      </div>

      <div>
        <SectionHeading title="Terms" aside="these are not interchangeable" />
        <dl style={{ margin: 0 }}>
          {DEFINITIONS.map(([term, meaning], i) => (
            <Reveal key={term} delay={i * 40}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(140px, 180px) 1fr",
                  gap: 16,
                  padding: "10px 0",
                  borderBottom: "1px solid var(--rule)",
                }}
              >
                <dt className="code" style={{ color: "var(--red)", paddingTop: 3 }}>
                  {term}
                </dt>
                <dd className="note" style={{ margin: 0 }}>
                  {meaning}
                </dd>
              </div>
            </Reveal>
          ))}
        </dl>
      </div>

      <div>
        <SectionHeading title="Factors" aside="defined in config/default_weights.yaml" />
        <table className="panel">
          <thead>
            <tr>
              <th className="left" scope="col">
                Factor
              </th>
              <th className="left" scope="col">
                What it measures
              </th>
              <th scope="col">Default</th>
            </tr>
          </thead>
          <tbody>
            {FACTOR_ORDER.map((factor) => (
              <tr key={factor}>
                <td className="left" style={{ fontWeight: 500 }}>
                  {factorLabel(factor)}
                </td>
                <td className="left" style={{ whiteSpace: "normal" }}>
                  <span className="note">{FACTOR_MEANING[factor]}</span>
                </td>
                <td className="num">
                  {catalog ? `${((catalog.factors[factor] ?? 0) * 100).toFixed(0)}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {catalog ? (
        <div>
          <SectionHeading title="Metrics" aside="direction says which way is better" />
          <table className="panel">
            <thead>
              <tr>
                <th className="left" scope="col">
                  Metric
                </th>
                <th className="left" scope="col">
                  Factor
                </th>
                <th className="left" scope="col">
                  Direction
                </th>
                <th className="left" scope="col">
                  Unit
                </th>
                <th scope="col">Within factor</th>
              </tr>
            </thead>
            <tbody>
              {catalog.metrics.map((metric) => (
                <tr key={metric.metric}>
                  <td className="left">
                    {metric.label}
                    <div className="hint num">{metric.metric}</div>
                  </td>
                  <td className="left note">
                    {metric.factor ? factorLabel(metric.factor) : "—"}
                  </td>
                  <td className="left note">
                    {metric.direction === "positive" ? "higher is better" : "lower is better"}
                  </td>
                  <td className="left hint num">{metric.unit}</td>
                  <td className="num">
                    {metric.factor_weight_within_factor != null
                      ? `${(metric.factor_weight_within_factor * 100).toFixed(0)}%`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div>
        <SectionHeading title="Data in this build" />
        {health ? (
          <table className="panel">
            <tbody>
              <tr>
                <td className="left">Markets with data</td>
                <td className="num">{health.markets_with_data}</td>
              </tr>
              <tr>
                <td className="left">Sources</td>
                <td className="num">{health.sources.join(", ") || "none"}</td>
              </tr>
              <tr>
                <td className="left">Vintages</td>
                <td className="num">
                  {health.vintages.current} against {health.vintages.prior}
                </td>
              </tr>
              <tr>
                <td className="left">Strategy parser</td>
                <td className="num">{health.llm_provider}</td>
              </tr>
            </tbody>
          </table>
        ) : null}
        {health?.sources.includes("synthetic_seed") ? (
          <div style={{ marginTop: 12 }}>
            <Caveat>
              Some or all of this run uses the placeholder dataset, not Census observations.
              Every value carries the tag <span className="num">synthetic_seed</span>. The
              rankings are structurally correct but resting on invented numbers.
            </Caveat>
          </div>
        ) : null}
      </div>

      <div>
        <SectionHeading title="Known limits" aside="stated, not hidden" />
        <ul className="note" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
          <li>
            <strong>Competition data is absent.</strong> No public source covers every
            business category consistently, so the competition factor is dropped on every run
            and its weight is redistributed. Nothing about saturation is being measured.
          </li>
          <li>
            <strong>Rent is residential.</strong> Median gross rent stands in for operating
            cost. It is not commercial rent and should not be read as storefront occupancy
            cost.
          </li>
          <li>
            <strong>Growth is a five-year delta, not a rate.</strong> ACS 1-year was never
            published for 2020, so the vintage pair is not contiguous. CBSA codes are also
            reissued between vintages, which leaves some metros without a prior counterpart;
            their growth is recorded as missing rather than as zero.
          </li>
          <li>
            <strong>Metro areas only.</strong> A state-level scope is rejected rather than
            silently approximated.
          </li>
          <li>
            <strong>Percentiles are relative.</strong> A score of 90 means the market beats
            90% of the others in this run. It does not mean the market is good.
          </li>
        </ul>
      </div>
    </div>
  );
}
