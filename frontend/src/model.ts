/** Re-ranking, formatting and scenario presets.
 *
 * Factor scores are percentiles across markets, so they do not depend on the
 * weights. That means moving a weight only changes the weighted sum, and the
 * ranking can be recomputed here — the same arithmetic as
 * app/scoring/attractiveness.py, so dragging a slider re-ranks instantly
 * instead of waiting on a round trip.
 */

import type { ScoredMarket, Weights } from "./api";

export const FACTOR_ORDER = [
  "market_size",
  "affluence",
  "growth",
  "customer_fit",
  "competition",
  "cost",
];

export const FACTOR_LABELS: Record<string, string> = {
  market_size: "Market size",
  affluence: "Affluence",
  growth: "Growth",
  customer_fit: "Customer fit",
  competition: "Competition",
  cost: "Cost",
};

export const FACTOR_MEANING: Record<string, string> = {
  market_size: "How many people, and how many of them are in the target age range",
  affluence: "Median household income and the share of households above the income floor",
  growth: "Change in population and income between the two ACS vintages",
  customer_fit: "Concentration of the target age range and of degree holders",
  competition: "Competing establishments per 100k residents",
  cost: "Median gross rent, as a proxy for operating cost",
};

export const factorLabel = (factor: string) => FACTOR_LABELS[factor] ?? factor;

/** Weights the model can actually apply: unavailable factors dropped, rest renormalized. */
export function effectiveWeights(weights: Weights, available: Set<string>): Weights {
  const kept = Object.entries(weights).filter(([f, w]) => available.has(f) && w > 0);
  const total = kept.reduce((sum, [, w]) => sum + w, 0);
  if (total <= 0) return {};
  return Object.fromEntries(kept.map(([f, w]) => [f, w / total]));
}

/** Which factors any market could be scored on at all. */
export function availableFactors(markets: ScoredMarket[]): Set<string> {
  const available = new Set<string>();
  for (const market of markets) {
    for (const factor of Object.keys(market.factor_scores)) available.add(factor);
  }
  return available;
}

/** Factors with data, in display order. Includes ones carrying no weight. */
export function scoredFactors(markets: ScoredMarket[]): string[] {
  const available = availableFactors(markets);
  return FACTOR_ORDER.filter((factor) => available.has(factor));
}

/**
 * Rescore and re-rank under new weights. A market missing a factor that others
 * have is renormalized over the factors it does have, never scored as zero.
 */
export function rescore(markets: ScoredMarket[], effective: Weights): ScoredMarket[] {
  const scored = markets.map((market) => {
    let weighted = 0;
    let total = 0;
    for (const [factor, weight] of Object.entries(effective)) {
      const score = market.factor_scores[factor];
      if (score === undefined) continue;
      weighted += score * weight;
      total += weight;
    }
    const score = total > 0 ? Math.round((weighted / total) * 100) / 100 : 0;
    return { ...market, score };
  });

  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return scored.map((market, i) => ({ ...market, rank: i + 1 }));
}

/** Renormalize to 1.0 after a slider moves, holding the moved factor fixed. */
export function setWeight(weights: Weights, factor: string, value: number): Weights {
  const clamped = Math.max(0, Math.min(1, value));
  const others = Object.keys(weights).filter((f) => f !== factor);
  const otherTotal = others.reduce((sum, f) => sum + weights[f], 0);
  const remaining = 1 - clamped;

  const next: Weights = { [factor]: clamped };
  if (otherTotal <= 0) {
    // Everything else is zero: spread what is left evenly rather than dividing by zero.
    for (const f of others) next[f] = others.length ? remaining / others.length : 0;
  } else {
    for (const f of others) next[f] = (weights[f] / otherTotal) * remaining;
  }
  return next;
}

export const weightsEqual = (a: Weights, b: Weights) =>
  Object.keys({ ...a, ...b }).every((f) => Math.abs((a[f] ?? 0) - (b[f] ?? 0)) < 0.0005);

export interface Preset {
  id: string;
  name: string;
  rationale: string;
  weights: Weights;
}

export const PRESETS: Preset[] = [
  {
    id: "balanced",
    name: "Balanced",
    rationale: "The configured defaults. No factor is favoured.",
    weights: { market_size: 0.2, affluence: 0.2, growth: 0.2, customer_fit: 0.2, competition: 0.1, cost: 0.1 },
  },
  {
    id: "growth",
    name: "Growth first",
    rationale: "Bets on trajectory over today's size. Tolerates expensive markets.",
    weights: { market_size: 0.1, affluence: 0.15, growth: 0.4, customer_fit: 0.2, competition: 0.1, cost: 0.05 },
  },
  {
    id: "capital",
    name: "Capital efficient",
    rationale: "Weights operating cost heavily. Suits a thin balance sheet.",
    weights: { market_size: 0.15, affluence: 0.15, growth: 0.1, customer_fit: 0.15, competition: 0.1, cost: 0.35 },
  },
  {
    id: "premium",
    name: "Premium customer",
    rationale: "Finds spending power and the right demographic, whatever it costs.",
    weights: { market_size: 0.1, affluence: 0.35, growth: 0.1, customer_fit: 0.3, competition: 0.1, cost: 0.05 },
  },
  {
    id: "uncontested",
    name: "Low competition",
    rationale: "Avoids saturated markets. Needs competition data to have any effect.",
    weights: { market_size: 0.15, affluence: 0.15, growth: 0.15, customer_fit: 0.15, competition: 0.3, cost: 0.1 },
  },
  {
    id: "scale",
    name: "Scale first",
    rationale: "Absolute market size dominates. Favours the largest metros.",
    weights: { market_size: 0.45, affluence: 0.15, growth: 0.1, customer_fit: 0.15, competition: 0.05, cost: 0.1 },
  },
];

/* ── Formatting ────────────────────────────────────────────────────────── */

export function formatMetric(metric: string, value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (metric.endsWith("_share")) return `${(value * 100).toFixed(1)}%`;
  if (metric.endsWith("_growth")) return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
  if (metric === "median_household_income") return `$${Math.round(value).toLocaleString()}`;
  if (metric === "median_rent") return `$${Math.round(value).toLocaleString()}`;
  if (metric === "competitive_density") return value.toFixed(1);
  return compact(value);
}

export function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toLocaleString();
}

export const pct = (value: number, digits = 0) => `${(value * 100).toFixed(digits)}%`;

/** "Austin-Round Rock-San Marcos, TX Metro Area" -> "Austin-Round Rock" */
export function shortName(name: string): string {
  const [place] = name.split(",");
  const parts = place.split("-");
  return parts.slice(0, 2).join("-");
}

export const stateOf = (name: string) => name.split(",")[1]?.trim().split(" ")[0] ?? "";

/** Sequential ramp from a pale paper pin to full pin red. */
export function scoreColor(score: number): string {
  const t = Math.max(0, Math.min(1, score / 100));
  const from = [226, 214, 188];
  const to = [184, 50, 42];
  const mix = from.map((c, i) => Math.round(c + (to[i] - c) * t ** 1.5));
  return `rgb(${mix.join(",")})`;
}

/** One game-piece colour per factor, used wherever a factor's share is drawn. */
export const FACTOR_COLORS: Record<string, string> = {
  market_size: "#b8322a",
  affluence: "#2c5b8f",
  growth: "#d39b22",
  customer_fit: "#7b4a2a",
  competition: "#3a3f47",
  cost: "#7f97a8",
};

export const factorColor = (factor: string) => FACTOR_COLORS[factor] ?? "#6a6355";
