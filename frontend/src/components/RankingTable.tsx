/** The ranking. Dense and sortable, one row per market — not one card per market.
 *
 * Factor cells are tinted by score so a strength or a hole is visible while
 * scanning, without reading every number.
 */

import { useMemo, useState } from "react";
import { factorLabel, scoredFactors, shortName, stateOf } from "../model";
import { useStore } from "../store";

type SortKey = "rank" | "name" | string;

export function RankingTable() {
  const { markets, effective, selected, select, pinned, togglePin } = useStore();
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({
    key: "rank",
    descending: false,
  });
  const [query, setQuery] = useState("");

  const factors = scoredFactors(markets);

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
      key={key}
      className={align === "left" ? "left" : undefined}
      aria-sort={sort.key === key ? (sort.descending ? "ascending" : "descending") : undefined}
      scope="col"
    >
      <button onClick={() => toggleSort(key)}>{label}</button>
      {weight !== undefined ? (
        <div className="num hint" style={{ fontWeight: 400 }}>
          {weight > 0 ? `${(weight * 100).toFixed(0)}%` : "unweighted"}
        </div>
      ) : null}
    </th>
  );

  return (
    <div className="ranking">
      <div
        className="row"
        style={{ padding: "8px 12px", borderBottom: "1px solid var(--rule)", gap: 12 }}
      >
        <span className="label" style={{ color: "var(--ink)", fontWeight: 600 }}>
          Ranking
        </span>
        <span className="hint num">
          {rows.length} of {markets.length} metros
        </span>
        <div style={{ flex: 1 }} />
        <span className="hint">
          {pinned.length ? `${pinned.length} of 4 pinned to compare` : "Pin up to 4 to compare"}
        </span>
        <input
          type="text"
          value={query}
          placeholder="Filter markets"
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: 180 }}
          aria-label="Filter markets by name"
        />
      </div>

      <div className="ranking-scroll">
        <table>
          <thead>
            <tr>
              {header("rank", "#")}
              {header("name", "Market", "left")}
              <th className="left" scope="col">
                State
              </th>
              {header("rank", "Score")}
              <th scope="col" style={{ width: 74 }} />
              {factors.map((factor) =>
                header(factor, factorLabel(factor), "right", effective[factor] ?? 0)
              )}
              <th scope="col" style={{ width: 34 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((market) => {
              const isSelected = market.market_id === selected;
              const isPinned = pinned.includes(market.market_id);
              return (
                <tr
                  key={market.market_id}
                  aria-selected={isSelected}
                  onClick={() => select(market.market_id)}
                  style={{ cursor: "pointer" }}
                >
                  <td
                    className="num"
                    style={{
                      color: market.rank === 1 ? "var(--accent)" : "var(--muted)",
                      fontWeight: market.rank === 1 ? 600 : 400,
                    }}
                  >
                    {market.rank}
                  </td>
                  <td className="left" style={{ fontWeight: isSelected ? 600 : 400 }}>
                    {shortName(market.name)}
                  </td>
                  <td className="left num hint">{stateOf(market.name)}</td>
                  <td className="num" style={{ fontWeight: 500 }}>
                    {market.score.toFixed(1)}
                  </td>
                  <td>
                    <div className="bar-track" style={{ height: 5 }}>
                      <div
                        className="bar-fill"
                        style={{
                          width: `${market.score}%`,
                          background: isSelected ? "var(--accent)" : "var(--slate-soft)",
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
                        style={{
                          background:
                            score === undefined
                              ? undefined
                              : `rgba(47,72,88,${(score / 100) * (weighted ? 0.16 : 0.05)})`,
                          color:
                            score === undefined || !weighted
                              ? "var(--faint)"
                              : "var(--ink-soft)",
                        }}
                        title={
                          score === undefined
                            ? "No data for this factor"
                            : weighted
                              ? undefined
                              : "Scored, but this factor carries no weight"
                        }
                      >
                        {score === undefined ? "—" : score.toFixed(0)}
                      </td>
                    );
                  })}
                  <td>
                    <button
                      className="btn btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePin(market.market_id);
                      }}
                      style={{
                        padding: "0 5px",
                        borderColor: isPinned ? "var(--accent)" : "var(--rule)",
                        color: isPinned ? "var(--accent)" : "var(--faint)",
                        background: "transparent",
                      }}
                      title={isPinned ? "Unpin from comparison" : "Pin to comparison"}
                      aria-pressed={isPinned}
                    >
                      {isPinned ? "■" : "□"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
