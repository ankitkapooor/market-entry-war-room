/** The workspace: assumptions on the left drive the map and the ranking, and
 *  whatever is selected is explained on the right. One selection, three views. */

import { MarketMap } from "../components/MarketMap";
import { RankingTable } from "../components/RankingTable";
import { MarketDetailPanel } from "../components/MarketDetail";
import { WeightEditor } from "../components/WeightEditor";
import { factorLabel, shortName } from "../model";
import { useSelectedMarket, useStore } from "../store";

export function WarRoomScreen() {
  const { markets, go } = useStore();
  const selectedMarket = useSelectedMarket();

  if (!markets.length) {
    return (
      <div className="reading stack">
        <h1 className="mid">No scenario has been run yet.</h1>
        <p className="note">
          Describe the business and run the model; the ranking, the map and the
          sensitivity analysis all read from that one result.
        </p>
        <div>
          <button className="btn btn-primary" onClick={() => go("strategy")}>
            Go to strategy
          </button>
        </div>
      </div>
    );
  }

  const leader = markets[0];
  const runnerUp = markets[1];
  const strength = leader.strengths[0];
  const weakness = leader.weaknesses[0];

  return (
    <div className="warroom">
      <div className="rail">
        <WeightEditor />
      </div>

      <div className="warroom-center">
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div
            className="spread"
            style={{
              padding: "9px 14px",
              borderBottom: "1px solid var(--rule)",
              background: "var(--field)",
              alignItems: "center",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <span className="mid">{shortName(leader.name)}</span>{" "}
              <span className="note">ranks first under these assumptions,</span>{" "}
              <span className="note">
                leading on {factorLabel(strength.factor).toLowerCase()} (
                <span className="num">{strength.score.toFixed(0)}</span>) and giving up{" "}
                {factorLabel(weakness.factor).toLowerCase()} (
                <span className="num">{weakness.score.toFixed(0)}</span>).
              </span>
            </div>
            {runnerUp ? (
              <span className="hint" style={{ whiteSpace: "nowrap" }}>
                <span className="num">{(leader.score - runnerUp.score).toFixed(1)}</span> ahead of{" "}
                {shortName(runnerUp.name)}
              </span>
            ) : null}
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <MarketMap />
          </div>
        </div>

        <RankingTable />
      </div>

      <div className="rail">
        {selectedMarket ? <MarketDetailPanel market={selectedMarket} /> : null}
      </div>
    </div>
  );
}
