/** The assumptions rail: factor weights, presets, and what the model dropped. */

import { useStore } from "../store";
import { FACTOR_MEANING, FACTOR_ORDER, PRESETS, factorLabel, weightsEqual } from "../model";
import { Caveat, SectionHeading } from "./Bits";

export function WeightEditor() {
  const { weights, adjustWeight, applyWeights, effective, scenario } = useStore();
  const active = PRESETS.find((preset) => weightsEqual(preset.weights, weights));
  const dropped = FACTOR_ORDER.filter((f) => weights[f] > 0 && effective[f] === undefined);

  return (
    <>
      <div className="block">
        <SectionHeading title="Assumptions" aside="sums to 100%" />
        <div>
          {FACTOR_ORDER.map((factor) => {
            const weight = weights[factor] ?? 0;
            const applied = effective[factor];
            return (
              <div key={factor} style={{ padding: "5px 0" }}>
                <div className="spread" style={{ marginBottom: 1 }}>
                  <label htmlFor={`w-${factor}`} title={FACTOR_MEANING[factor]}>
                    {factorLabel(factor)}
                  </label>
                  <span
                    className="num"
                    style={{ color: weight === 0 ? "var(--faint)" : "var(--ink)" }}
                  >
                    {applied !== undefined && Math.abs(applied - weight) > 0.005 ? (
                      <span className="hint" title="After redistributing dropped factors">
                        {(weight * 100).toFixed(0)} →{" "}
                      </span>
                    ) : null}
                    {((applied ?? weight) * 100).toFixed(0)}%
                  </span>
                </div>
                <input
                  id={`w-${factor}`}
                  type="range"
                  min={0}
                  max={60}
                  step={1}
                  value={Math.round(weight * 100)}
                  onChange={(e) => adjustWeight(factor, Number(e.target.value) / 100)}
                  aria-label={`${factorLabel(factor)} weight`}
                />
              </div>
            );
          })}
        </div>
        <div className="hint" style={{ marginTop: 8 }}>
          Moving one weight rescales the others so the set still sums to 100%. Where a
          factor shows <span className="num">20 → 22%</span>, the higher figure is what the
          model applied after redistributing a dropped factor.
        </div>
      </div>

      {dropped.length ? (
        <div className="block">
          <Caveat>
            {dropped.map(factorLabel).join(" and ")} carr
            {dropped.length > 1 ? "y" : "ies"} weight but no market has data for{" "}
            {dropped.length > 1 ? "them" : "it"}. That weight is redistributed across the
            remaining factors, never scored as zero.
          </Caveat>
        </div>
      ) : null}

      <div className="block">
        <SectionHeading title="Scenario presets" />
        <div style={{ display: "grid", gap: 1 }}>
          {PRESETS.map((preset) => {
            const isActive = active?.id === preset.id;
            return (
              <button
                key={preset.id}
                onClick={() => applyWeights(preset.weights)}
                aria-pressed={isActive}
                title={preset.rationale}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 8px",
                  border: "1px solid",
                  borderColor: isActive ? "var(--accent)" : "var(--rule)",
                  background: isActive ? "var(--accent-wash)" : "transparent",
                }}
              >
                <div className="spread">
                  <span style={{ fontWeight: isActive ? 600 : 400 }}>{preset.name}</span>
                  <span className="num hint">
                    {FACTOR_ORDER.map((f) => (preset.weights[f] * 100).toFixed(0)).join(" ")}
                  </span>
                </div>
                <div className="hint">{preset.rationale}</div>
              </button>
            );
          })}
        </div>
        <div className="hint" style={{ marginTop: 8 }}>
          Figures read {FACTOR_ORDER.map(factorLabel).join(" · ").toLowerCase()}.
        </div>
      </div>

      {scenario?.warnings.length ? (
        <div className="block">
          <SectionHeading title="Model warnings" />
          <ul style={{ margin: 0, paddingLeft: 16 }} className="hint">
            {scenario.warnings.map((warning) => (
              <li key={warning} style={{ marginBottom: 5 }}>
                {warning}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}
