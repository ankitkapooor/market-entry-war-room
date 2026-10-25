/** The ranking. Sortable, one row per market — not one card per market.
 *
 * Factor cells are tinted by score so a strength or a hole is visible while
 * scanning. When a weight moves, rows slide to their new places and the
 * movement column says how far each market has climbed or fallen against the
 * scenario the server last scored.
 */

import { useMemo, useRef, useState } from "react";
import { factorColor, factorLabel, scoredFactors, shortName, stateOf } from "../model";
import { useStore } from "../store";
import { useFlip } from "../ui";
import { Card } from "./Bits";

type SortKey = "rank" | "name" | string;

export function RankingTable() {
  const { markets, effective, selected, select, pinned, togglePin, scenario } = useStore();
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({
    key: "rank",
    descending: false,
  });
  const [query, setQuery] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  // Only the rows on screen when the table first opens arrive in sequence;
  // later re-ranks are carried by the slide instead.
  const [entering] = useState(() => new Set(markets.slice(0, 14).map((m) => m.market_id)));

  const factors = scoredFactors(markets);

  const baseRank = useMemo(
    () => new Map(scenario?.markets.map((m) => [m.market_id, m.rank]) ?? []),
    [scenario]
  );

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    const filtered = term ? markets.filter((m) => m.name.toLowerCase().includes(term)) : markets;
    const sorted = [...filtered].sort((a, b) => {
      if (sort.key === "rank") return a.rank - b.rank;
      if (sort.key === "name") return a.name.localeCompare(b.name);
      return (b.factor_scores[sort.key] ?? -1) - (a.factor_scores[sort.key] ?? -1);
    });
    return sort.descending ? sorted.reverse() : sorted;
  }, [markets, query, sort]);

  useFlip(scroller, rows.map((m) => m.market_id).join(","));

  const toggleSort = (key: SortKey) =>
    setSort((current) =>
      current.key === key ? { key, descending: !current.descending } : { key, descending: false }
    );

  const header = (
    key: SortKey,
    label: string,
    align: "left" | "right" = "right",
    weight?: number
  ) => (
    <th
      key={label}
      className={align === "left" ? "left" : undefined}
      aria-sort={sort.key === key ? (sort.descending ? "ascending" : "descending") : undefined}
      scope="col"
    >
      <button onClick={() => toggleSort(key)}>{label}</button>
      {weight !== undefined ? (
        <div
          className="num"
          style={{ color: weight > 0 ? "var(--ink-soft)" : "var(--faint)", letterSpacing: 0, marginTop: 3 }}
        >
          {weight > 0 ? `${(weight * 100).toFixed(0)}%` : "—"}
        </div>
      ) : null}
    </th>
  );

  return (
    <Card
      title="Order of battle"
      aside={`${rows.length} of ${markets.length} metros`}
      pin="red"
      i={4}
    >
      <div className="ranking-bar" style={{ marginBottom: 16 }}>
        <span className="hint" style={{ flex: 1 }}>
          Drag a weight or play a card and watch the order change. ▲ and ▼ count places
          gained or lost since the last run.{" "}
          {pinned.length ? `${pinned.length} of 4 pinned to compare.` : "Pin up to four to compare."}
        </span>
        <input
          type="text"
          value={query}
          placeholder="Find a market"
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: 220 }}
          aria-label="Filter markets by name"
        />
      </div>

      <div className="ranking-scroll" ref={scroller}>
        <table>
          <thead>
            <tr>
              {header("rank", "#")}
              <th scope="col" title="Places moved since the last server run">
                Moved
              </th>
              {header("name", "Market", "left")}
              {header("rank", "Score")}
              <th scope="col" style={{ width: 96 }} />
              {factors.map((factor) =>
                header(factor, factorLabel(factor), "right", effective[factor] ?? 0)
              )}
              <th scope="col" style={{ width: 52 }}>
                Pin
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((market, i) => {
              const isSelected = market.market_id === selected;
              const isPinned = pinned.includes(market.market_id);
              const moved = (baseRank.get(market.market_id) ?? market.rank) - market.rank;
              return (
                <tr
                  key={market.market_id}
                  data-flip={market.market_id}
                  aria-selected={isSelected}
                  onClick={() => select(market.market_id)}
                  className={entering.has(market.market_id) ? "rise" : undefined}
                  style={{ cursor: "pointer", ["--i" as string]: i + 4 }}
                >
                  <td>
                    <span
                      className={`token ${market.rank === 1 ? "token-1" : market.rank <= 5 ? "token-top" : ""}`}
                    >
                      {market.rank}
                    </span>
                  </td>
                  <td className="num">
                    {moved !== 0 ? (
                      <span className={`delta ${moved > 0 ? "delta-up" : "delta-down"}`}>
                        {moved > 0 ? "▲" : "▼"}
                        {Math.abs(moved)}
                      </span>
                    ) : (
                      <span className="delta" style={{ color: "var(--line-strong)" }}>
                        –
                      </span>
                    )}
                  </td>
                  <td className="left">
                    <span style={{ fontWeight: isSelected ? 600 : 500 }}>{shortName(market.name)}</span>{" "}
                    <span className="hint num" style={{ marginLeft: 4 }}>
                      {stateOf(market.name)}
                    </span>
                  </td>
                  <td className="num" style={{ fontWeight: 600, fontSize: 15, color: isSelected ? "var(--red)" : undefined }}>
                    {market.score.toFixed(1)}
                  </td>
                  <td>
                    <div className="bar-track" style={{ height: 6 }}>
                      <div
                        className="bar-fill"
                        style={{
                          width: `${market.score}%`,
                          background: isSelected || market.rank === 1 ? "var(--red)" : "var(--ink-soft)",
                          animationDelay: `${Math.min(i, 14) * 40 + 200}ms`,
                        }}
                      />
                    </div>
                  </td>
                  {factors.map((factor) => {
                    const score = market.factor_scores[factor];
                    const weighted = (effective[factor] ?? 0) > 0;
                    return (
                      <td
                        key={factor}
                        className="num"
                        style={{ color: score === undefined || !weighted ? "var(--faint)" : "var(--ink)" }}
                        title={
                          score === undefined
                            ? "No data for this factor"
                            : weighted
                              ? undefined
                              : "Scored, but this factor carries no weight"
                        }
                      >
                        {score === undefined ? (
                          "—"
                        ) : (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                            <span
                              aria-hidden="true"
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                background: weighted ? factorColor(factor) : "var(--line-strong)",
                                opacity: 0.15 + (score / 100) ** 1.4 * 0.85,
                              }}
                            />
                            {score.toFixed(0)}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td>
                    <button
                      className="pin-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePin(market.market_id);
                      }}
                      title={isPinned ? "Unpin from comparison" : "Pin to comparison"}
                      aria-pressed={isPinned}
                      aria-label={`${isPinned ? "Unpin" : "Pin"} ${shortName(market.name)}`}
                    >
                      +
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
