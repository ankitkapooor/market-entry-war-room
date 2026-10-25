/** The assumptions: factor weights as troops, presets as playing cards.
 *
 * Twenty troops are spread across the factors — one chip per 5% — so moving
 * one slider visibly pulls chips off the others. Presets are a hand of
 * cards; playing one re-weights the whole board.
 */

import { useStore } from "../store";
import {
  FACTOR_MEANING,
  FACTOR_ORDER,
  PRESETS,
  factorColor,
  factorLabel,
  weightsEqual,
} from "../model";
import type { Weights } from "../api";
import { Card } from "./Bits";

const TROOPS = 20;
const SUITS = ["♠", "♥", "♦", "♣", "♠", "♥"];
const TILTS = [-2.2, 1.4, -0.8, 2, -1.6, 0.9];

function Allocation({ weights, small }: { weights: Weights; small?: boolean }) {
  return (
    <div className={`allocation ${small ? "allocation-sm" : ""}`} aria-hidden="true">
      {FACTOR_ORDER.map((factor) => (
        <div
          key={factor}
          style={{ width: `${(weights[factor] ?? 0) * 100}%`, background: factorColor(factor) }}
        />
      ))}
    </div>
  );
}

export function WeightEditor() {
  const { weights, adjustWeight, effective } = useStore();

  return (
    <div className="wr-side">
      <Card title="Troop allocation" aside={`${TROOPS} troops · 5% each`} i={0}>
        {FACTOR_ORDER.map((factor) => {
          const weight = weights[factor] ?? 0;
          const applied = effective[factor];
          const offline = applied === undefined && weight > 0;
          const chips = Math.round((applied ?? 0) * TROOPS);
          return (
            <div key={factor} className="alloc-row">
              <div className="spread" style={{ alignItems: "center" }}>
                <label
                  htmlFor={`w-${factor}`}
                  title={FACTOR_MEANING[factor]}
                  style={{ display: "flex", alignItems: "center", fontWeight: 500 }}
                >
                  <span className="swatch" style={{ background: factorColor(factor) }} />
                  {factorLabel(factor)}
                </label>
                <span className="num" style={{ color: weight === 0 ? "var(--faint)" : "var(--ink)" }}>
                  {offline ? (
                    <span style={{ color: "var(--red)" }}>no data</span>
                  ) : (
                    `${((applied ?? weight) * 100).toFixed(0)}%`
                  )}
                </span>
              </div>
              <div className="chips" aria-hidden="true">
                {offline
                  ? Array.from({ length: Math.round(weight * TROOPS) }, (_, i) => (
                      <span key={i} className="chip chip-ghost" />
                    ))
                  : Array.from({ length: chips }, (_, i) => (
                      <span
                        key={i}
                        className="chip"
                        style={{ background: factorColor(factor), animationDelay: `${i * 25}ms` }}
                      />
                    ))}
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
                style={{
                  ["--c" as string]: factorColor(factor),
                  ["--fill" as string]: `${(Math.round(weight * 100) / 60) * 100}%`,
                }}
              />
            </div>
          );
        })}
        <p className="hint" style={{ marginTop: 12 }}>
          Moving one weight rescales the others so the set still sums to 100%. Chips show the
          weight the model actually applied.
        </p>
      </Card>

    </div>
  );
}

/** What the model dropped or warned about, as notes pinned under the map. */
export function BoardNotes() {
  const { weights, effective, scenario } = useStore();
  const dropped = FACTOR_ORDER.filter((f) => weights[f] > 0 && effective[f] === undefined);
  const warnings = scenario?.warnings ?? [];
  if (!dropped.length && !warnings.length) return null;

  return (
    <div className="board-notes">
      {dropped.length ? (
        <div className="sticky" style={{ ["--tilt" as string]: "-1.2deg", ["--i" as string]: 3 }}>
          <span className="code">Troops redistributed</span>
          <p style={{ fontSize: 13.5, lineHeight: 1.55 }}>
            {dropped.map(factorLabel).join(" and ")} carr
            {dropped.length > 1 ? "y" : "ies"} weight but no market has data for{" "}
            {dropped.length > 1 ? "them" : "it"}. Those troops are spread across the other
            factors, never scored as zero.
          </p>
        </div>
      ) : null}
      {warnings.length ? (
        <div
          className="sticky sticky-blue"
          style={{ ["--tilt" as string]: "1deg", ["--i" as string]: 4 }}
        >
          <span className="code">
            Model warnings · {warnings.length}
          </span>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13, lineHeight: 1.5 }}>
            {warnings.map((warning) => (
              <li key={warning} style={{ marginBottom: 4 }}>
                {warning.length > 150 ? (
                  <details>
                    <summary style={{ cursor: "pointer" }}>{warning.slice(0, 120)}…</summary>
                    {warning.slice(120)}
                  </details>
                ) : (
                  warning
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** The presets, dealt as a hand of cards. */
export function CoursesOfAction() {
  const { weights, applyWeights } = useStore();
  const active = PRESETS.find((preset) => weightsEqual(preset.weights, weights));

  return (
    <div className="coa-row">
      {PRESETS.map((preset, i) => {
        const isActive = active?.id === preset.id;
        return (
          <button
            key={preset.id}
            className="playing-card"
            onClick={() => applyWeights(preset.weights)}
            aria-pressed={isActive}
            style={{ ["--i" as string]: i, ["--tilt" as string]: `${TILTS[i]}deg` }}
            title={FACTOR_ORDER.map(
              (f) => `${factorLabel(f)} ${(preset.weights[f] * 100).toFixed(0)}%`
            ).join(" · ")}
          >
            <span className="pc-corner">
              <span>
                COA
                <br />
                {i + 1}
              </span>
              <span className="pc-suit">{SUITS[i]}</span>
            </span>
            <span className="pc-name">{preset.name}</span>
            <span className="hint" style={{ flex: 1 }}>
              {preset.rationale}
            </span>
            <Allocation weights={preset.weights} small />
            <span className="code" style={{ color: isActive ? "var(--red)" : "var(--faint)" }}>
              {isActive ? "In play" : "Play this card"}
            </span>
            {isActive ? (
              <span className="pc-played">
                <span className="stamp" key={preset.id}>
                  Played
                </span>
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
