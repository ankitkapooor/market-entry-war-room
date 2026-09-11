import { StoreProvider, useStore, type Screen } from "./store";
import { StrategyScreen } from "./screens/Strategy";
import { WarRoomScreen } from "./screens/WarRoom";
import { CompareScreen } from "./screens/Compare";
import { SensitivityScreen } from "./screens/Sensitivity";
import { MethodologyScreen } from "./screens/Methodology";
import { shortName } from "./model";

const TABS: { id: Screen; label: string }[] = [
  { id: "strategy", label: "Strategy" },
  { id: "warroom", label: "War room" },
  { id: "compare", label: "Compare" },
  { id: "sensitivity", label: "Sensitivity" },
  { id: "methodology", label: "Methodology" },
];

function Shell() {
  const { screen, go, markets, scenario, strategy, error, dismissError, pinned, stale } =
    useStore();

  const leader = markets[0];

  return (
    <div className="app">
      <header className="topbar">
        <div className="wordmark">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <rect x="0.5" y="0.5" width="13" height="13" fill="none" stroke="var(--ink)" />
            <circle cx="7" cy="7" r="2.5" fill="var(--accent)" />
            <line x1="7" y1="0" x2="7" y2="4" stroke="var(--ink)" />
            <line x1="7" y1="10" x2="7" y2="14" stroke="var(--ink)" />
          </svg>
          Market Entry War Room
        </div>

        <div className="topbar-scenario">
          {leader ? (
            <>
              <span className="tag tag-accent num">#1 {shortName(leader.name)}</span>
              <span className="num">{leader.score.toFixed(1)}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                {strategy.description || "Untitled strategy"}
              </span>
              {stale ? <span className="tag tag-warn">weights edited since last run</span> : null}
              {scenario ? <span className="hint num">{scenario.scenario_id}</span> : null}
            </>
          ) : (
            <span>No scenario yet — describe a business to begin.</span>
          )}
        </div>

        <nav className="nav">
          {TABS.map((tab) => {
            const needsResults = tab.id !== "strategy" && tab.id !== "methodology";
            return (
              <button
                key={tab.id}
                aria-current={screen === tab.id}
                disabled={needsResults && !markets.length}
                onClick={() => go(tab.id)}
              >
                {tab.label}
                {tab.id === "compare" && pinned.length ? (
                  <span className="num hint"> {pinned.length}</span>
                ) : null}
              </button>
            );
          })}
        </nav>
      </header>

      {error ? (
        <div
          className="row"
          style={{
            padding: "8px 16px",
            background: "var(--accent)",
            color: "#f6f2f2",
            borderBottom: "1px solid var(--rule-strong)",
          }}
          role="alert"
        >
          <strong>Request failed.</strong>
          <span style={{ flex: 1 }}>{error}</span>
          <button className="btn btn-sm" onClick={dismissError}>
            Dismiss
          </button>
        </div>
      ) : null}

      <main className="screen">
        {screen === "strategy" ? <StrategyScreen /> : null}
        {screen === "warroom" ? <WarRoomScreen /> : null}
        {screen === "compare" ? <CompareScreen /> : null}
        {screen === "sensitivity" ? <SensitivityScreen /> : null}
        {screen === "methodology" ? <MethodologyScreen /> : null}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
