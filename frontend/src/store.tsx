/** One store for the whole session: strategy, weights, results, selection. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  api,
  type BusinessStrategy,
  type Health,
  type MetricCatalog,
  type ScenarioResponse,
  type ScoredMarket,
  type SensitivityResponse,
  type Weights,
} from "./api";
import { availableFactors, effectiveWeights, rescore, setWeight, weightsEqual } from "./model";

export type Screen = "strategy" | "warroom" | "compare" | "sensitivity" | "methodology";

const BLANK_STRATEGY: BusinessStrategy = {
  business_name: null,
  description: "",
  category: "general",
  target_age_min: null,
  target_age_max: null,
  target_income: null,
  price_positioning: "mass_market",
  geographic_scope: "metro",
  priorities: {},
};

interface Store {
  screen: Screen;
  go: (screen: Screen) => void;

  health: Health | null;
  catalog: MetricCatalog | null;

  strategy: BusinessStrategy;
  setStrategy: (strategy: BusinessStrategy) => void;
  parseNotes: string[];
  provider: string | null;
  parsing: boolean;
  parse: (description: string) => Promise<void>;

  weights: Weights;
  adjustWeight: (factor: string, value: number) => void;
  applyWeights: (weights: Weights) => void;

  scenario: ScenarioResponse | null;
  markets: ScoredMarket[];
  effective: Weights;
  running: boolean;
  run: () => Promise<void>;
  /** Weights have moved since the scenario the server holds. */
  stale: boolean;

  selected: string | null;
  select: (marketId: string | null) => void;
  pinned: string[];
  togglePin: (marketId: string) => void;

  sensitivity: SensitivityResponse | null;
  sensitivityFor: string | null;
  simulating: boolean;
  simulate: (iterations: number, variation: number) => Promise<void>;

  error: string | null;
  dismissError: () => void;
}

const StoreContext = createContext<Store | null>(null);

const DEFAULT_WEIGHTS: Weights = {
  market_size: 0.2,
  affluence: 0.2,
  growth: 0.2,
  customer_fit: 0.2,
  competition: 0.1,
  cost: 0.1,
};

export function StoreProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<Screen>("strategy");
  const [health, setHealth] = useState<Health | null>(null);
  const [catalog, setCatalog] = useState<MetricCatalog | null>(null);

  const [strategy, setStrategy] = useState<BusinessStrategy>(BLANK_STRATEGY);
  const [parseNotes, setParseNotes] = useState<string[]>([]);
  const [provider, setProvider] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);

  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const [scenario, setScenario] = useState<ScenarioResponse | null>(null);
  const [running, setRunning] = useState(false);

  const [selected, setSelected] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string[]>([]);

  const [sensitivity, setSensitivity] = useState<SensitivityResponse | null>(null);
  const [sensitivityFor, setSensitivityFor] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.health().then(setHealth).catch((e: Error) => setError(e.message));
    api.metricCatalog().then(setCatalog).catch(() => undefined);
  }, []);

  const parse = useCallback(async (description: string) => {
    setParsing(true);
    setError(null);
    try {
      const result = await api.parseStrategy(description);
      setStrategy(result.strategy);
      setWeights(result.initial_weights);
      setParseNotes(result.notes);
      setProvider(result.provider);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setParsing(false);
    }
  }, []);

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const result = await api.createScenario(strategy, weights, strategy.description);
      setScenario(result);
      setSensitivity(null);
      setSensitivityFor(null);
      const best = [...result.markets].sort((a, b) => a.rank - b.rank)[0];
      setSelected(best?.market_id ?? null);
      setScreen("warroom");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }, [strategy, weights]);

  const simulate = useCallback(
    async (iterations: number, variation: number) => {
      setSimulating(true);
      setError(null);
      try {
        // Sensitivity runs against a stored scenario, so commit the current
        // weights first if they have drifted from the one the server holds.
        let id = scenario?.scenario_id;
        if (!scenario || !weightsEqual(scenario.weights, weights)) {
          const fresh = await api.createScenario(strategy, weights, strategy.description);
          setScenario(fresh);
          id = fresh.scenario_id;
        }
        if (!id) return;
        const result = await api.sensitivity(id, iterations, variation);
        setSensitivity(result);
        setSensitivityFor(id);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setSimulating(false);
      }
    },
    [scenario, strategy, weights]
  );

  const adjustWeight = useCallback((factor: string, value: number) => {
    setWeights((current) => setWeight(current, factor, value));
  }, []);

  const togglePin = useCallback((marketId: string) => {
    setPinned((current) =>
      current.includes(marketId)
        ? current.filter((id) => id !== marketId)
        : current.length >= 4
          ? current
          : [...current, marketId]
    );
  }, []);

  const { markets, effective } = useMemo(() => {
    if (!scenario) return { markets: [] as ScoredMarket[], effective: {} as Weights };
    const eff = effectiveWeights(weights, availableFactors(scenario.markets));
    return { markets: rescore(scenario.markets, eff), effective: eff };
  }, [scenario, weights]);

  const stale = Boolean(scenario) && !weightsEqual(scenario!.weights, weights);

  const value: Store = {
    screen,
    go: setScreen,
    health,
    catalog,
    strategy,
    setStrategy,
    parseNotes,
    provider,
    parsing,
    parse,
    weights,
    adjustWeight,
    applyWeights: setWeights,
    scenario,
    markets,
    effective,
    running,
    run,
    stale,
    selected,
    select: setSelected,
    pinned,
    togglePin,
    sensitivity,
    sensitivityFor,
    simulating,
    simulate,
    error,
    dismissError: () => setError(null),
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used inside StoreProvider");
  return store;
}

/** The currently selected market, or the top-ranked one. */
export function useSelectedMarket(): ScoredMarket | null {
  const { markets, selected } = useStore();
  return useMemo(
    () => markets.find((m) => m.market_id === selected) ?? markets[0] ?? null,
    [markets, selected]
  );
}
