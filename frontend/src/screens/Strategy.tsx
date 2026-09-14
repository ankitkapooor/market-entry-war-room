/** Step one: a sentence about the business becomes a set of editable assumptions.
 *
 * The interpretation is shown as fields the user can overwrite, because the
 * model's answer depends on it and a reader should not have to take the
 * parser's word for anything.
 */

import { useState } from "react";
import { FACTOR_ORDER, factorLabel } from "../model";
import { useStore } from "../store";
import { Readout, ScoreBar, SectionHeading } from "../components/Bits";

const EXAMPLES = [
  "A premium fitness studio charging about $180/month, aimed at affluent professionals aged 25 to 44.",
  "A budget family diner with $14 entrees, serving households with children in lower-cost metros.",
  "A specialty coffee roastery and cafe for students and young creatives aged 18 to 29.",
];

export function StrategyScreen() {
  const {
    strategy,
    setStrategy,
    parse,
    parsing,
    parseNotes,
    provider,
    weights,
    run,
    running,
    health,
    scenario,
  } = useStore();
  const [description, setDescription] = useState(strategy.description);
  const parsed = Boolean(strategy.description);

  const field = (label: string, control: React.ReactNode, hint?: string) => (
    <label style={{ display: "block", padding: "8px 0", borderBottom: "1px solid var(--rule)" }}>
      <div className="label" style={{ marginBottom: 4 }}>
        {label}
      </div>
      {control}
      {hint ? <div className="hint" style={{ marginTop: 3 }}>{hint}</div> : null}
    </label>
  );

  return (
    <div className="strategy">
      <div className="stack">
      <div>
        <h1 className="big" style={{ marginBottom: 6 }}>
          Where should this business open next?
        </h1>
        <p className="note" style={{ maxWidth: 620 }}>
          Describe the business. The parser turns it into measurable assumptions, which you
          can correct. The ranking that follows comes from Census data and an explicit
          weighted model — nothing here is a language model's opinion about a city.
        </p>
      </div>

      <div className="panel" style={{ padding: 16 }}>
        <SectionHeading
          title="Business description"
          aside={health ? `${health.markets_with_data} metros loaded` : undefined}
        />
        <textarea
          rows={3}
          maxLength={2000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={EXAMPLES[0]}
          aria-label="Business description"
        />
        <div className="row" style={{ marginTop: 10, flexWrap: "wrap" }}>
          <button
            className="btn btn-primary"
            onClick={() => parse(description)}
            disabled={parsing || description.trim().length === 0}
          >
            {parsing ? "Interpreting…" : "Interpret the business"}
          </button>
          <span className="hint">or start from</span>
          {EXAMPLES.map((example, i) => (
            <button
              key={example}
              className="btn btn-sm"
              onClick={() => setDescription(example)}
              title={example}
            >
              {["Premium fitness", "Family diner", "Coffee roastery"][i]}
            </button>
          ))}
        </div>
      </div>

      {parsed ? (
        <>
          <div className="panel" style={{ padding: 16 }}>
            <SectionHeading
              title="Interpreted strategy"
              aside={provider ? `parsed by ${provider} · every field is editable` : undefined}
            />
            <div className="grid-2">
              {field(
                "Business category",
                <input
                  type="text"
                  value={strategy.category}
                  onChange={(e) => setStrategy({ ...strategy, category: e.target.value })}
                />,
                "Selects the competitor set, once competition data exists."
              )}
              {field(
                "Price positioning",
                <select
                  value={strategy.price_positioning}
                  onChange={(e) =>
                    setStrategy({
                      ...strategy,
                      price_positioning: e.target.value as typeof strategy.price_positioning,
                    })
                  }
                >
                  <option value="value">Value</option>
                  <option value="mass_market">Mass market</option>
                  <option value="premium">Premium</option>
                  <option value="luxury">Luxury</option>
                </select>
              )}
              {field(
                "Target age range",
                <div className="row">
                  <input
                    type="number"
                    value={strategy.target_age_min ?? ""}
                    min={0}
                    max={99}
                    onChange={(e) =>
                      setStrategy({
                        ...strategy,
                        target_age_min: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    className="num"
                  />
                  <span className="hint">to</span>
                  <input
                    type="number"
                    value={strategy.target_age_max ?? ""}
                    min={0}
                    max={99}
                    onChange={(e) =>
                      setStrategy({
                        ...strategy,
                        target_age_max: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    className="num"
                  />
                </div>,
                "Prorated from ACS age brackets into target population and target-age share."
              )}
              {field(
                "Household income floor",
                <input
                  type="text"
                  className="num"
                  value={strategy.target_income ?? ""}
                  placeholder="100000+"
                  onChange={(e) =>
                    setStrategy({ ...strategy, target_income: e.target.value || null })
                  }
                />,
                "Sets the threshold for the share-of-households-above metric."
              )}
            </div>

            {parseNotes.length ? (
              <div style={{ marginTop: 14 }}>
                <div className="label" style={{ marginBottom: 5 }}>
                  Why it read the business this way
                </div>
                <ul className="hint" style={{ margin: 0, paddingLeft: 16 }}>
                  {parseNotes.map((note) => (
                    <li key={note} style={{ marginBottom: 3 }}>
                      {note}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div className="row">
            <button className="btn btn-primary" onClick={run} disabled={running}>
              {running ? "Scoring markets…" : "Run the model"}
            </button>
            <span className="hint">
              {health
                ? `Scores ${health.markets_with_data} metros on ACS ${health.vintages.current} against ${health.vintages.prior}.`
                : ""}
              {scenario ? ` Last run: ${scenario.scenario_id}.` : ""}
            </span>
          </div>
        </>
      ) : null}
      </div>

      <aside className="strategy-aside">
        {parsed ? (
          <div style={{ marginBottom: 22 }}>
            <SectionHeading title="Starting weights" aside="editable in the war room" />
            {FACTOR_ORDER.map((factor) => (
              <div key={factor} style={{ padding: "3px 0" }}>
                <div className="spread">
                  <span>{factorLabel(factor)}</span>
                  <span
                    className="num"
                    style={{ color: (weights[factor] ?? 0) === 0 ? "var(--faint)" : undefined }}
                  >
                    {((weights[factor] ?? 0) * 100).toFixed(0)}%
                  </span>
                </div>
                <ScoreBar value={(weights[factor] ?? 0) * 100 * 2.5} height={4} />
              </div>
            ))}
          </div>
        ) : null}
        <DataFooting />
      </aside>
    </div>
  );
}

/** What a run would rest on, before anything has been run. Stated up front so
 *  the model's output is read with its inputs in mind. */
function DataFooting() {
  const { health, catalog, go } = useStore();

  return (
    <>
      <SectionHeading title="What it reads" />
      <Readout label="Metropolitan markets" value={health?.markets_with_data ?? "—"} />
      <Readout label="Scored metrics" value={catalog?.metrics.length ?? "—"} />
      <Readout label="Factors" value={catalog ? Object.keys(catalog.factors).length : "—"} />
      <Readout
        label="Census vintages"
        value={health ? `${health.vintages.current} / ${health.vintages.prior}` : "—"}
      />
      <Readout label="Sources" value={health?.sources.join(", ") || "—"} />
      <Readout label="Strategy parser" value={health?.llm_provider ?? "—"} />

      <hr className="rule" style={{ margin: "16px 0 14px" }} />

      <SectionHeading title="What it will not tell you" />
      <p className="note" style={{ marginBottom: 8 }}>
        Competition is unmeasured: no public source covers every business category
        consistently, so that factor is dropped on every run and its weight redistributed.
      </p>
      <p className="note" style={{ marginBottom: 8 }}>
        Rent is residential, standing in for operating cost, and growth is a five-year delta
        rather than an annualised rate.
      </p>
      <p className="note">
        Scores are percentiles against the other metros in the run, so a 90 means the market
        beats 90% of the others — not that it is good.{" "}
        <a
          href="#methodology"
          onClick={(e) => {
            e.preventDefault();
            go("methodology");
          }}
        >
          Full methodology
        </a>
        .
      </p>
    </>
  );
}
