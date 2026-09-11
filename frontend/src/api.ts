/** Typed wrappers over the War Room API. Types mirror app/models/*.py. */

export interface BusinessStrategy {
  business_name: string | null;
  description: string;
  category: string;
  target_age_min: number | null;
  target_age_max: number | null;
  target_income: string | null;
  price_positioning: "value" | "mass_market" | "premium" | "luxury";
  geographic_scope: "metro" | "state";
  priorities: Weights;
}

export type Weights = Record<string, number>;

export interface ParseResponse {
  strategy: BusinessStrategy;
  initial_weights: Weights;
  provider: string;
  notes: string[];
}

export interface FactorScore {
  factor: string;
  score: number;
}

export interface ScoredMarket {
  rank: number;
  market_id: string;
  name: string;
  score: number;
  factor_scores: Record<string, number>;
  metric_scores: Record<string, number>;
  metrics: Record<string, number | null>;
  strengths: FactorScore[];
  weaknesses: FactorScore[];
}

export interface ScenarioResponse {
  scenario_id: string;
  weights: Weights;
  effective_weights: Weights;
  warnings: string[];
  markets: ScoredMarket[];
}

export interface MarketSensitivity {
  market_id: string;
  name: string;
  base_rank: number;
  mean_score: number;
  mean_rank: number;
  rank_std: number;
  rank_p10: number;
  rank_median: number;
  rank_p90: number;
  top_3_probability: number;
  top_5_probability: number;
}

export interface SensitivityResponse {
  scenario_id: string;
  iterations: number;
  weight_variation: number;
  markets: MarketSensitivity[];
}

export interface MetricDefinition {
  metric: string;
  label: string;
  direction: "positive" | "negative";
  unit: string;
  factor: string | null;
  factor_weight_within_factor: number | null;
  derived_from?: string;
}

export interface MetricCatalog {
  metrics: MetricDefinition[];
  factors: Weights;
}

export interface MetricValue {
  metric: string;
  value: number;
  source: string;
  vintage: number;
}

export interface MarketDetail {
  market_id: string;
  name: string;
  state_codes: string;
  metrics: MetricValue[];
}

export interface Health {
  status: string;
  markets_with_data: number;
  sources: string[];
  census_key_configured: boolean;
  llm_provider: string;
  vintages: { current: number; prior: number };
}

const BASE = "/api/v1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(BASE + path, {
    ...init,
    headers: init?.body ? { "content-type": "application/json" } : undefined,
  });
  if (!response.ok) {
    // Surface the API's own message; it explains the problem better than a status code.
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail ?? body?.error ?? `${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  health: () => request<Health>("/health"),

  metricCatalog: () => request<MetricCatalog>("/data/metrics"),

  parseStrategy: (description: string) =>
    request<ParseResponse>("/strategy/parse", {
      method: "POST",
      body: JSON.stringify({ description }),
    }),

  createScenario: (strategy: BusinessStrategy, weights: Weights, description: string) =>
    request<ScenarioResponse>("/scenarios", {
      method: "POST",
      body: JSON.stringify({ business_strategy: strategy, weights, description }),
    }),

  sensitivity: (scenarioId: string, iterations: number, weightVariation: number) =>
    request<SensitivityResponse>(`/scenarios/${scenarioId}/sensitivity`, {
      method: "POST",
      body: JSON.stringify({
        iterations,
        weight_variation: weightVariation,
        seed: 42,
      }),
    }),

  marketDetail: (marketId: string) => request<MarketDetail>(`/markets/${marketId}`),
};
