/** Step one: a sentence about the business becomes a set of editable assumptions.
 *
 * Laid out as an operation order — situation, mission, execution — because
 * that is the order the work happens in. The interpretation is shown as
 * fields the user can overwrite, because the model's answer depends on it and
 * a reader should not have to take the parser's word for anything.
 */

import { useState, type ReactNode } from "react";
import { FACTOR_ORDER, factorColor, factorLabel } from "../model";
import { useStore } from "../store";
import { Card, ScoreBar } from "../components/Bits";
import { Teletype } from "../ui";

const EXAMPLES = [
  "A premium fitness studio charging about $180/month, aimed at affluent professionals aged 25 to 44.",
  "A budget family diner with $14 entrees, serving households with children in lower-cost metros.",
  "A specialty coffee roastery and cafe for students and young creatives aged 18 to 29.",
];

function Paragraph({
  num,
  title,
  aside,
  children,
  fastener = "pinned pin-left",
  i = 0,
}: {
  num: string;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  fastener?: string;
  i?: number;
}) {
  return (
    <section className={`card ${fastener}`} style={{ ["--i" as string]: i + 2 }}>
      <div className="para-head">
        <span className="para-num">{num}</span>
        <span className="para-title">{title}</span>
        {aside ? <span className="hint">{aside}</span> : null}
      </div>
      <div className="para-body">{children}</div>
    </section>
  );
}

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

  const field = (label: string, control: ReactNode, hint?: string) => (
    <label className="field">
      <span className="code">{label}</span>
      {control}
      {hint ? <div className="hint" style={{ marginTop: 4 }}>{hint}</div> : null}
    </label>
  );

  return (
    <div className="strategy">
      <div className="stack">
        <div>
          <p className="kicker code">Operation order · Market entry</p>
          <h1 className="hero-title">
            <span>Where should</span>
            <span>this business</span>
            <span>open next?</span>
          </h1>
          <p className="lede">
            Describe the business. The parser turns it into measurable assumptions, which you
            can correct. The ranking that follows comes from Census data and an explicit
            weighted model — nothing here is a language model's opinion about a city.
          </p>
        </div>

        <Paragraph
          num="1"
          title="Situation"
          aside={health ? `${health.markets_with_data} metros on the board` : undefined}
          fastener="taped"
        >
          <div className="code" style={{ color: "var(--faint)", marginBottom: 10 }}>
            Describe the business
          </div>
          <textarea
            rows={3}
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={EXAMPLES[0]}
            aria-label="Business description"
          />
          <div className="row" style={{ marginTop: 18, flexWrap: "wrap", gap: 12 }}>
            <button
              className="btn btn-primary"
              onClick={() => parse(description)}
              disabled={parsing || description.trim().length === 0}
              data-busy={parsing}
            >
              {parsing ? "Interpreting…" : "Interpret the business"}
            </button>
            <span className="hint" style={{ marginLeft: 6 }}>or try</span>
            {EXAMPLES.map((example, i) => (
              <button
                key={example}
                className="btn btn-sm btn-ghost"
                onClick={() => setDescription(example)}
                title={example}
              >
                {["Premium fitness", "Family diner", "Coffee roastery"][i]}
              </button>
            ))}
          </div>
        </Paragraph>

        {parsed ? (
          <>
            <Paragraph
              num="2"
              title="Mission"
              i={1}
              aside={provider ? `parsed by ${provider} · every field is editable` : undefined}
            >
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
                <div style={{ marginTop: 16 }}>
                  <div className="code" style={{ color: "var(--faint)", marginBottom: 8 }}>
                    Why it read the business this way
                  </div>
                  <div className="note" style={{ fontFamily: "var(--mono)", fontSize: 12.5 }}>
                    {parseNotes.map((note, i) => (
                      <div key={note} style={{ marginBottom: 4 }}>
                        <span style={{ color: "var(--amber)" }}>&gt; </span>
                        <Teletype text={note} delay={i * 600} cps={90} />
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </Paragraph>

            <Paragraph num="3" title="Execution" i={2} fastener="pinned pin-left pin-blue">
              <div className="row" style={{ gap: 16 }}>
                <button
                  className="btn btn-primary"
                  onClick={run}
                  disabled={running}
                  data-busy={running}
                  style={{ minHeight: 46, paddingInline: 22 }}
                >
                  {running ? "Scoring markets…" : "Run the model"}
                </button>
                <span className="hint" style={{ flex: 1, minWidth: 200 }}>
                  {health
                    ? `Scores ${health.markets_with_data} metros on ACS ${health.vintages.current} against ${health.vintages.prior}, then opens the war room.`
                    : ""}
                  {scenario ? ` Last run: ${scenario.scenario_id}.` : ""}
                </span>
              </div>
            </Paragraph>
          </>
        ) : null}
      </div>

      <aside className="strategy-aside">
        {parsed ? (
          <Card title="Opening allocation" aside="editable on the board" pin="brass" i={1}>
            {FACTOR_ORDER.map((factor, i) => (
              <div key={factor} style={{ padding: "6px 0" }}>
                <div className="spread" style={{ marginBottom: 5 }}>
                  <span style={{ display: "flex", alignItems: "center" }}>
                    <span className="swatch" style={{ background: factorColor(factor) }} />
                    {factorLabel(factor)}
                  </span>
                  <span
                    className="num"
                    style={{ color: (weights[factor] ?? 0) === 0 ? "var(--faint)" : undefined }}
                  >
                    {((weights[factor] ?? 0) * 100).toFixed(0)}%
                  </span>
                </div>
                <ScoreBar
                  value={(weights[factor] ?? 0) * 100 * 2.5}
                  height={5}
                  color={factorColor(factor)}
                  delay={i * 80}
                />
              </div>
            ))}
          </Card>
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

  const sources: [string, string, "ok" | "warn"][] = [
    ["Metropolitan markets", String(health?.markets_with_data ?? "—"), "ok"],
    ["Scored metrics", String(catalog?.metrics.length ?? "—"), "ok"],
    ["Factors", catalog ? String(Object.keys(catalog.factors).length) : "—", "ok"],
    ["Census vintages", health ? `${health.vintages.current} / ${health.vintages.prior}` : "—", "ok"],
    ["Sources", health?.sources.join(", ") || "—", "ok"],
    ["Strategy parser", health?.llm_provider ?? "—", "ok"],
    ["Competition data", "none", "warn"],
  ];

  return (
    <>
      <Card title="Intelligence" aside="what a run reads" i={2}>
        {sources.map(([label, value, tone], i) => (
          <div className="intel-row rise" key={label} style={{ ["--i" as string]: i + 4 }}>
            <span
              className={`led ${tone === "ok" ? "" : "led-live"}`}
              style={{ color: tone === "ok" ? "var(--blue)" : "var(--red)" }}
            />
            <span className="note">{label}</span>
            <span className="num" style={{ color: tone === "ok" ? "var(--ink)" : "var(--red)" }}>
              {value}
            </span>
          </div>
        ))}
      </Card>

      <div className="sticky" style={{ ["--tilt" as string]: "-1.6deg", ["--i" as string]: 4 }}>
        <span className="code">Known gap</span>
        <p style={{ fontSize: 13.5, lineHeight: 1.55 }}>
          Competition is unmeasured: no public source covers every business category
          consistently, so that factor is dropped on every run and its weight redistributed.
        </p>
      </div>
      <div
        className="sticky sticky-blue"
        style={{ ["--tilt" as string]: "1.2deg", ["--i" as string]: 5 }}
      >
        <span className="code">Read with care</span>
        <p style={{ fontSize: 13.5, lineHeight: 1.55 }}>
          Rent is residential, growth is a five-year delta, and scores are percentiles: a 90
          beats 90% of the other metros, which is not the same as being good.{" "}
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
      </div>
    </>
  );
}
