# Deploying Market Entry War Room on Railway

The recommended portfolio deployment is one Railway service with one persistent volume. A multi-stage Docker build compiles React and installs the Python runtime; FastAPI serves both the UI and API. SQLite, scenarios, cached strategy interpretations and the Census snapshot share the volume. No separate frontend, worker, Redis or managed database is needed.

If Narrative vs. Numbers is already on the same Railway Hobby workspace, this project does not add another subscription fee. Both projects draw from the same included $5 monthly usage, and the account is billed only for usage above it. Actual cost depends on measured memory, CPU, egress and volume storage.

## Create the project

1. In [Railway](https://railway.com/), select **New Project → Deploy from GitHub repo**.
2. Choose `ankitkapooor/market-entry-war-room`.
3. Open the service's **Variables** page and add the values below. Copy both keys from the local `.env`; never add their values to GitHub.

   ```text
   APP_ENVIRONMENT=production
   CENSUS_API_KEY=<copy the existing value from local .env>
   LLM_PROVIDER=openai
   OPENAI_API_KEY=<copy the existing value from local .env>
   LLM_MODEL=gpt-4o-mini
   DATABASE_URL=sqlite:////app/data/app.db
   CENSUS_VINTAGE=2024
   CENSUS_PRIOR_VINTAGE=2019
   SENSITIVITY_ITERATIONS=1000
   STRATEGY_REQUESTS_PER_HOUR=10
   STRATEGY_DAILY_LIMIT=100
   STRATEGY_CACHE_HOURS=168
   STRATEGY_CACHE_MAX_SAVED=1000
   SCENARIO_REQUESTS_PER_HOUR=30
   SENSITIVITY_REQUESTS_PER_HOUR=10
   SCENARIO_RETENTION_DAYS=7
   SCENARIO_MAX_SAVED=100
   ```

   Do not define `PORT`; Railway injects it.

4. Create a volume, attach it to this service, and set its mount path to `/app/data`. The Hobby plan currently provisions a 5 GB volume by default, which is much more than this database needs.
5. Keep exactly **one replica** because SQLite is local to the attached volume. If resource-limit controls are available, start with **512 MB RAM and 1 shared vCPU**. Singapore is a sensible region for a portfolio owner in India.
6. Under **Settings → Healthcheck**, enter `/health`. Leave the default 300-second timeout: the first boot downloads two Census vintages before becoming ready.
7. Under **Settings → Networking**, choose **Generate Domain**. Railway automatically detects the root `Dockerfile`; no custom build or start command is needed.
8. Redeploy after the variables and volume are attached.

On the first deployment to an empty volume, startup downloads ACS 2024 and 2019. Later restarts reuse that snapshot. Production startup fails rather than silently showing synthetic markets or heuristic AI output when either key is missing.

## Verify it

Replace `YOUR_DOMAIN` below:

```bash
curl --fail https://YOUR_DOMAIN/health
curl --fail https://YOUR_DOMAIN/api/v1/health
curl --fail https://YOUR_DOMAIN/api/v1/markets?limit=2
curl --fail -X POST https://YOUR_DOMAIN/api/v1/strategy/parse \
  -H 'Content-Type: application/json' \
  -d '{"description":"A premium fitness studio for affluent professionals aged 25 to 44."}'
```

The deployment health response should report Census vintage `2024`. The API health response should show roughly 393 markets, source `US Census ACS`, and LLM provider `openai`. Then open `https://YOUR_DOMAIN`; `/` redirects to the complete UI at `/ui/`.

## Cost and maintenance

- The OpenAI call only interprets the short business description. Identical descriptions are reused for seven days, new calls are limited per visitor and per day, and the cache retains at most 1,000 entries.
- Stored scenarios are automatically limited to the newest 100 and seven days, preventing an unattended demo from filling its volume.
- Sensitivity simulations are capped at 5,000 iterations and serialized to protect a 512 MB instance.
- Create Railway and OpenAI billing alerts. Application limits reduce exposure but do not replace provider-level budgets.
- When the 2025 ACS 1-year release is publicly available, update `CENSUS_VINTAGE` and choose an explicit available prior ACS 1-year vintage for the comparison, then redeploy. A missing configured vintage triggers one new sync.
