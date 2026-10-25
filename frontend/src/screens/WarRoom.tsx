/** The board: the situation across the top, assumptions on the left driving the
 *  map and the ranking, the selected market explained on the right, and the
 *  presets dealt as a hand of cards. One selection, every view. */

import { MarketMap } from "../components/MarketMap";
import { RankingTable } from "../components/RankingTable";
import { EvidenceCard, MarketDetailPanel } from "../components/MarketDetail";
import { BoardNotes, CoursesOfAction, WeightEditor } from "../components/WeightEditor";
import { Empty, SectionTitle } from "../components/Bits";
import { factorLabel, shortName } from "../model";
import { useSelectedMarket, useStore } from "../store";
import { Count, useZulu } from "../ui";

export function WarRoomScreen() {
  const { markets, go } = useStore();
  const selectedMarket = useSelectedMarket();
  const zulu = useZulu();

  if (!markets.length) {
    return (
      <Empty code="Board is empty" title="Nothing has been run yet.">
        <p className="note" style={{ marginBottom: 20 }}>
          Describe the business and run the model; the ranking, the map and the stress test
          all read from that one result.
        </p>
        <button className="btn btn-primary" onClick={() => go("strategy")}>
          Go to strategy
        </button>
      </Empty>
    );
  }

  const leader = markets[0];
  const runnerUp = markets[1];
  const strength = leader.strengths[0];
  const weakness = leader.weaknesses[0];

  return (
    <div className="board">
      <div className="sitrep-band">
        <div>
          <span className="sitrep-kicker code">
            <span className="led led-live" style={{ color: "#e7766c" }} /> Situation report ·{" "}
            {zulu.slice(0, 5)}Z
          </span>
          <h1 className="sitrep-lead">
            <span key={leader.market_id} className="rise" style={{ display: "block" }}>
              {shortName(leader.name)}
            </span>
            <span className="holds">holds first under these assumptions</span>
          </h1>
        </div>

        <div className="notes">
          {runnerUp ? (
            <div className="sticky" style={{ ["--tilt" as string]: "-2.4deg", ["--i" as string]: 0 }}>
              <span className="code">Margin</span>
              <span className="marker">
                +<Count value={leader.score - runnerUp.score} format={(n) => n.toFixed(1)} />
              </span>
              <span className="hint" style={{ color: "var(--ink-soft)" }}>
                over {shortName(runnerUp.name)}
              </span>
            </div>
          ) : null}
          {strength ? (
            <div
              className="sticky sticky-blue"
              style={{ ["--tilt" as string]: "1.8deg", ["--i" as string]: 1 }}
            >
              <span className="code">Strongest suit</span>
              <span className="marker">{factorLabel(strength.factor)}</span>
              <span className="hint num" style={{ color: "var(--ink-soft)" }}>
                {strength.score.toFixed(0)} percentile
              </span>
            </div>
          ) : null}
          {weakness ? (
            <div
              className="sticky sticky-paper"
              style={{ ["--tilt" as string]: "-1deg", ["--i" as string]: 2 }}
            >
              <span className="code">Exposed flank</span>
              <span className="marker" style={{ color: "var(--red)" }}>
                {factorLabel(weakness.factor)}
              </span>
              <span className="hint num" style={{ color: "var(--ink-soft)" }}>
                {weakness.score.toFixed(0)} percentile
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="wr-main">
        <WeightEditor />
        <div className="wr-side">
          <MarketMap />
          <BoardNotes />
        </div>
        {selectedMarket ? <MarketDetailPanel market={selectedMarket} /> : <div />}
      </div>

      <div style={{ paddingTop: 12 }}>
        <SectionTitle title="Courses of action" aside="Play a card to re-weight the whole board." />
        <CoursesOfAction />
      </div>

      <div className="wr-lower">
        <RankingTable />
        {selectedMarket ? <EvidenceCard market={selectedMarket} /> : null}
      </div>
    </div>
  );
}
