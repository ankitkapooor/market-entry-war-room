import { useEffect, useMemo, useRef, useState } from "react";
import { StoreProvider, useStore, type Screen } from "./store";
import { StrategyScreen } from "./screens/Strategy";
import { WarRoomScreen } from "./screens/WarRoom";
import { CompareScreen } from "./screens/Compare";
import { SensitivityScreen } from "./screens/Sensitivity";
import { MethodologyScreen } from "./screens/Methodology";
import { shortName } from "./model";
import { useReducedMotion, useZulu } from "./ui";

const TABS: { id: Screen; label: string }[] = [
  { id: "strategy", label: "Strategy" },
  { id: "warroom", label: "War room" },
  { id: "compare", label: "Compare" },
  { id: "sensitivity", label: "Stress test" },
  { id: "methodology", label: "Methodology" },
];

/** A compass rose: the board's maker's mark. */
function Crosshair() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <g className="ring">
        <circle cx="11" cy="11" r="8.5" fill="none" stroke="#efe8d6" strokeWidth="1.2" strokeDasharray="2.5 2.5" />
      </g>
      <path d="M11 1.5 13 11 11 20.5 9 11Z" fill="#efe8d6" />
      <path d="M11 1.5 13 11H9Z" fill="var(--red)" />
      <path d="M1.5 11 11 9.5 20.5 11 11 12.5Z" fill="#efe8d6" opacity=".55" />
    </svg>
  );
}

/** The wire: what the room currently believes, scrolling past. */
function Ticker() {
  const { markets, scenario, strategy, stale, health } = useStore();

  const items = useMemo(() => {
    if (!markets.length || !scenario) {
      return [
        <>AWAITING ORDERS — <b>DESCRIBE A BUSINESS TO BEGIN</b></>,
        <><b>{health?.markets_with_data ?? "—"}</b> METROS ON THE TABLE</>,
        <>CENSUS ACS <b>{health ? `${health.vintages.current} / ${health.vintages.prior}` : "—"}</b></>,
        <>STRATEGY PARSER <b>{health?.llm_provider?.toUpperCase() ?? "—"}</b></>,
        <>COMPETITION FACTOR <span className="down">NO DATA — WEIGHT REDISTRIBUTED</span></>,
        <>RANKING BY EXPLICIT MODEL, <b>NOT BY LANGUAGE MODEL</b></>,
      ];
    }
    const baseRank = new Map(scenario.markets.map((m) => [m.market_id, m.rank]));
    const lines = markets.slice(0, 10).map((m) => {
      const moved = (baseRank.get(m.market_id) ?? m.rank) - m.rank;
      return (
        <>
          <b>#{m.rank}</b> {shortName(m.name).toUpperCase()} {m.score.toFixed(1)}
          {moved > 0 ? <span className="up"> ▲{moved}</span> : null}
          {moved < 0 ? <span className="down"> ▼{-moved}</span> : null}
        </>
      );
    });
    const lead = markets[1] ? markets[0].score - markets[1].score : 0;
    return [
      <>OBJECTIVE: <b>{(strategy.description || "UNTITLED").toUpperCase().slice(0, 90)}</b></>,
      ...lines.slice(0, 5),
      <>MARGIN AT THE TOP <b>{lead.toFixed(1)} PTS</b></>,
      ...(stale ? [<span className="down">WEIGHTS EDITED SINCE LAST RUN</span>] : []),
      ...lines.slice(5),
      <>SCENARIO <b>{scenario.scenario_id.toUpperCase()}</b></>,
    ];
  }, [markets, scenario, strategy.description, stale, health]);

  return (
    <div className="ticker" aria-hidden="true">
      <span className="ticker-label code">
        <span className="led led-live" /> SITREP
      </span>
      <div className="ticker-window">
        <div className="ticker-track" style={{ ["--ticker-time" as string]: `${items.length * 7}s` }}>
          {[0, 1].map((copy) =>
            items.map((item, i) => (
              <span className="ticker-item" key={`${copy}-${i}`}>
                {item}
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function Clock() {
  const zulu = useZulu();
  return (
    <div className="clock" aria-label={`UTC ${zulu}`}>
      <span>{zulu}Z</span>
      <span className="code">ZULU · UTC</span>
    </div>
  );
}

/** A short boot sequence, once per session. Click anywhere to skip. */
function Boot() {
  const { health } = useStore();
  const reduced = useReducedMotion();
  const [show, setShow] = useState(() => {
    try {
      return !sessionStorage.getItem("wr-booted");
    } catch {
      return true; // storage blocked: show it, it is short
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem("wr-booted", "1");
    } catch {
      /* nothing to remember it in */
    }
  }, []);
  if (!show || reduced) return null;

  const lines: [string, string, string?][] = [
    ["SECURE CHANNEL", "OPEN"],
    ["CENSUS ACS", health ? `${health.vintages.current} / ${health.vintages.prior}` : "LINKED"],
    ["METROS ON THE TABLE", health ? String(health.markets_with_data) : "LOADING"],
    ["COMPETITION DATA", "OFFLINE", "warn"],
    ["SCORING MODEL", "ARMED"],
  ];

  return (
    <div
      className="boot"
      onClick={() => setShow(false)}
      onAnimationEnd={(e) => e.target === e.currentTarget && setShow(false)}
      role="presentation"
    >
      <div className="boot-inner">
        <div className="boot-title">
          War Room
          <small>MARKET ENTRY · OPERATIONS</small>
        </div>
        {lines.map(([label, status, tone], i) => (
          <div className="boot-line" key={label} style={{ animationDelay: `${0.25 + i * 0.28}s` }}>
            <span>&gt; {label}</span>
            <span className="dots">{".".repeat(80)}</span>
            <span className={tone ?? "ok"}>{status}</span>
          </div>
        ))}
        <div className="boot-skip">click to enter</div>
      </div>
    </div>
  );
}

function Shell() {
  const { screen, go, markets, error, dismissError, pinned } = useStore();
  const main = useRef<HTMLElement>(null);
  useEffect(() => {
    main.current?.scrollTo(0, 0);
  }, [screen]);

  return (
    <div className="app">
      <div className="classbar">
        <a href="https://ankitkapoor.me/#work">◂ ankit.kapoor</a>
        <span>
          Operation <b>Market entry</b> · strategy board
        </span>
        <span>01 / Growth</span>
      </div>

      <header className="topbar">
        <div className="wordmark">
          <Crosshair />
          <div>
            <div className="wordmark-title">War Room</div>
            <span className="wordmark-sub">MARKET ENTRY</span>
          </div>
        </div>

        <Ticker />
        <div className="spacer" />
        <Clock />

        <nav className="nav">
          {TABS.map((tab, i) => {
            const needsResults = tab.id !== "strategy" && tab.id !== "methodology";
            return (
              <button
                key={tab.id}
                aria-current={screen === tab.id}
                disabled={needsResults && !markets.length}
                onClick={() => go(tab.id)}
              >
                <span className="code">{String(i + 1).padStart(2, "0")}</span>
                <span>
                  {tab.label}
                  {tab.id === "compare" && pinned.length ? (
                    <span className="nav-badge">{pinned.length}</span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </nav>
      </header>

      {error ? (
        <div className="alert" role="alert">
          <span className="code">Request failed</span>
          <span style={{ flex: 1 }}>{error}</span>
          <button className="btn btn-sm" onClick={dismissError}>
            Dismiss
          </button>
        </div>
      ) : null}

      <main className="screen" ref={main}>
        <div key={screen} className="screen-enter">
          {screen === "strategy" ? <StrategyScreen /> : null}
          {screen === "warroom" ? <WarRoomScreen /> : null}
          {screen === "compare" ? <CompareScreen /> : null}
          {screen === "sensitivity" ? <SensitivityScreen /> : null}
          {screen === "methodology" ? <MethodologyScreen /> : null}
        </div>
      </main>
      <Boot />
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
