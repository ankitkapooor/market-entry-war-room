# Market Entry War Room

Ranks US metropolitan markets for a proposed business expansion.

The ranking comes from data and an explicit scoring model, not from a language
model's opinion. The LLM only converts a business description into measurable
assumptions; a deterministic model does the ranking, and a Monte Carlo
simulation tells you whether the winner actually survives different assumptions.

## Quick start

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"

uvicorn app.main:app --reload        # http://127.0.0.1:8000
```

At startup, the app uses current persisted Census data, synchronizes it when a
Census key is configured, or loads the clearly labeled development seed when
neither is available.

### Web UI

The war room is a React app in `frontend/`. Build it once, then open it from the
same server as the API:

```bash
cd frontend && npm install && npm run build && cd ..
uvicorn app.main:app --reload
# → http://127.0.0.1:8000 (redirects to /ui/)
```

For development with hot reload:

```bash
# terminal 1
uvicorn app.main:app --reload

# terminal 2
cd frontend && npm install && npm run dev
# → http://127.0.0.1:5173/ui/
```

The UI walks through strategy interpretation, market ranking, side-by-side
comparison, and Monte Carlo sensitivity. Weight sliders re-rank markets instantly
on the client; sensitivity runs hit the API.

### API (curl)

```bash
curl -s localhost:8000/api/v1/strategy/parse -H 'content-type: application/json' \
  -d '{"description":"A premium fitness studio aimed at affluent professionals aged 25-44."}'
```

Feed the returned `strategy` into `POST /api/v1/scenarios` to get a ranking, and
the returned `scenario_id` into `POST /api/v1/scenarios/{id}/sensitivity` to find
out how stable that ranking is.

## About the data

`scripts.seed_demo` loads **placeholder numbers**, not Census data. Every value
is tagged `source: "synthetic_seed"` and the API shows that tag on every metric,
so you can always tell. The rankings it produces are structurally correct but
resting on approximations.

For real data, get a free Census API key at
<https://api.census.gov/data/key_signup.html>, put it in `.env`, and run:

```bash
python -m scripts.sync_census
```

That pulls the current configured ACS 1-year vintage (2024 by default) and 2019
for a five-year comparison, then deletes the placeholder rows it supersedes, so
the two sources can never mix. A production deployment performs this sync
automatically when its persistent volume is empty.

Set `LLM_PROVIDER=openai` with an `OPENAI_API_KEY` to use a model for parsing
instead of the built-in keyword rules. Without it the heuristic parser handles
the common cases offline.

## How scoring works

1. **Metrics** (`config/metrics.yaml`) — ten metrics, each declaring whether a
   higher value is good (`positive`) or bad (`negative`).
2. **Normalization** (`app/scoring/normalize.py`) — every metric becomes a 0-100
   percentile across the markets being compared. Percentiles rather than min-max,
   so New York's population doesn't flatten everyone else onto the floor.
   Negative-direction metrics are flipped: `100 - percentile`.
3. **Factors** (`config/default_weights.yaml`) — metrics roll up into six
   factors (market size, affluence, growth, customer fit, competition, cost).
4. **Score** — the weighted sum of factor scores. Weights must sum to 1.0.
5. **Missing data** — never scored as zero. An unavailable factor is dropped and
   its weight is redistributed proportionally across the rest, with a warning
   saying so.
6. **Sensitivity** — weights are perturbed within a band, renormalized, and the
   ranking is recomputed a thousand times. The useful output is not "Austin is
   first" but "Austin is first in 94% of plausible weightings".

Both YAML files are the analytical framework. Change them and the model changes;
no Python edits required.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/v1/strategy/parse` | Description to an editable structured strategy |
| GET | `/api/v1/markets` | List markets, optional `?state=` and `?limit=` |
| GET | `/api/v1/markets/{id}` | Every stored observation with source and vintage |
| POST | `/api/v1/scenarios` | Score and rank markets under one set of weights |
| POST | `/api/v1/scenarios/{id}/sensitivity` | Monte Carlo rank stability |
| GET | `/api/v1/scenarios/{id}/compare` | Side-by-side factors and trade-offs |
| GET | `/api/v1/data/metrics` | Metric catalog with directions and factors |
| GET | `/api/v1/health` | What data is loaded, from which source |

## Known limits

- **Competition data is absent.** No public source covers every business
  category consistently, so `competitive_density` is always missing and its
  weight is redistributed. `app/market_data/competition.py` is the seam for
  plugging in County Business Patterns, Places or a commercial POI dataset.
- **Median gross rent is residential**, used as a proxy for operating cost. It
  is not commercial rent and should not be read as storefront occupancy cost.
- **Growth is a 5-year delta**, not a CAGR. CBSA codes are reissued between
  vintages, so 16 of the 393 metros have no 2019 counterpart in the current
  2024 dataset. Their growth is recorded as missing and the
  weight is redistributed; `sync_census` reports the count on every run.
- **Metro areas only.** `geographic_scope: "state"` is rejected rather than
  silently approximated.

## Tests

```bash
pytest
```

Tests never call the Census API; `tests/fixtures/census_acs.py` holds canned
responses shaped like the real thing and `respx` intercepts the HTTP calls.

## Hosting

Use one Railway service with the root `Dockerfile` and one volume mounted at
`/app/data`. This keeps the React UI, FastAPI API, real Census snapshot and
SQLite scenario store together at the lowest operational cost. Follow
[DEPLOYMENT.md](DEPLOYMENT.md) for the exact variables and dashboard steps.
