# Market Entry War Room

## Backend Technical Specification

### 1. Project Overview

**Market Entry War Room** is a decision-support engine that ranks geographic markets for a proposed business expansion.

The core question is:

> **Given a particular business model and target customer, which markets are structurally most attractive for entry—and why?**

The system converts a natural-language business description into a structured market thesis, retrieves public demographic and economic data, scores candidate markets, performs sensitivity analysis, and returns a transparent market-entry recommendation.

This is not intended to be an LLM-generated list of "best cities."

The ranking must come from data and an explicit scoring model.

AI assists with translating business strategy into measurable criteria.

---

# 2. Example

Input:

```text
A premium fitness studio aimed at affluent professionals aged
25–44, with membership pricing around $180/month.
```

The system might interpret:

```json
{
  "target_age_min": 25,
  "target_age_max": 44,
  "income_preference": "high",
  "population_growth_importance": "high",
  "competitive_density_importance": "medium",
  "cost_sensitivity": "medium"
}
```

The model could then rank:

```text
1. Austin
2. Denver
3. Seattle
4. San Diego
5. Boston
```

The important output is not the ranking itself.

The important output is:

> **Why does Austin rank above Seattle, and what assumptions would need to change for Seattle to win?**

---

# 3. Recommended Stack

### Language

Python 3.12+

### API

FastAPI

### Data processing

- pandas
- NumPy
- scipy
- Pydantic
- httpx

### Storage

MVP:

- SQLite
- SQLAlchemy

Analytical cache:

- DuckDB optional

### AI

Provider-neutral LLM abstraction.

### Testing

- pytest
- pytest-asyncio
- respx

---

# 4. Repository Structure

```text
market-entry-war-room/
│
├── app/
│   ├── main.py
│   │
│   ├── api/
│   │   ├── markets.py
│   │   ├── scenarios.py
│   │   └── data.py
│   │
│   ├── clients/
│   │   ├── census.py
│   │   ├── fred.py
│   │   └── llm.py
│   │
│   ├── strategy/
│   │   ├── parser.py
│   │   ├── criteria.py
│   │   └── weights.py
│   │
│   ├── market_data/
│   │   ├── demographics.py
│   │   ├── economics.py
│   │   ├── competition.py
│   │   └── geography.py
│   │
│   ├── scoring/
│   │   ├── normalize.py
│   │   ├── attractiveness.py
│   │   ├── sensitivity.py
│   │   └── explanations.py
│   │
│   ├── models/
│   │   ├── business.py
│   │   ├── market.py
│   │   ├── scenario.py
│   │   └── scores.py
│   │
│   └── db/
│       ├── database.py
│       └── repositories.py
│
├── config/
│   ├── metrics.yaml
│   └── default_weights.yaml
│
├── prompts/
│   └── business_to_strategy.md
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
│
├── .env.example
├── pyproject.toml
├── README.md
└── BACKEND.md
```

---

# 5. Unit of Geography

For the MVP, use:

> **Metropolitan Statistical Areas**

rather than arbitrary city boundaries.

Why?

Because market-entry decisions usually concern a broader economic/customer market rather than municipal borders.

Examples:

```text
Los Angeles-Long Beach-Anaheim
Austin-Round Rock-Georgetown
New York-Newark-Jersey City
```

Keep geography internally identified through stable geographic codes rather than display names alone.

---

# 6. External Data

## Census ACS

Primary source for:

```text
population
age distribution
household income
educational attainment
employment
housing costs
commuting
population characteristics
```

Store the Census dataset year with every observation.

Never mix vintages without recording their source year.

---

# 7. Initial Metric Library

The first version should support approximately 10 metrics.

## Market Size

### Population

```text
Total population
```

### Target Population

Estimated population inside the target age range.

---

# Market Affluence

### Median Household Income

Useful purchasing-power proxy.

### High-Income Household Share

Example:

```text
% households earning > $100,000
```

Threshold may vary according to the business.

---

# Market Momentum

### Population Growth

```text
Current population / previous population - 1
```

Prefer multi-year CAGR later.

---

### Income Growth

```text
Current median income / previous median income - 1
```

---

# Customer Fit

### Target Age Share

```text
Population target age / Total population
```

### Education

Optional proxy:

```text
% adults with bachelor's degree+
```

Useful for certain professional/knowledge-worker businesses.

---

# Cost

### Median Gross Rent

Initial operating-cost proxy.

Important:

Residential rent is not the same as commercial rent.

Label this clearly as a proxy.

Do not present it as actual storefront occupancy cost.

---

# Competition

Competition is the hardest metric to source consistently.

For the first version:

```text
competitive_density
```

should support plug-in datasets.

The core scoring system should work even if competition data is absent.

Potential V2 sources:

```text
County Business Patterns
Google Places
Yelp
Data Axle
commercial POI datasets
```

Do not block the MVP on perfect competition data.

---

# 8. Business Strategy Model

Convert natural-language descriptions into a structured specification.

```python
class BusinessStrategy(BaseModel):

    business_name: str | None

    description: str

    category: str

    target_age_min: int | None
    target_age_max: int | None

    target_income: str | None

    price_positioning: Literal[
        "value",
        "mass_market",
        "premium",
        "luxury"
    ]

    geographic_scope: Literal[
        "metro",
        "state"
    ] = "metro"

    priorities: dict[str, float]
```

Example:

```json
{
  "category": "fitness",
  "target_age_min": 25,
  "target_age_max": 44,
  "target_income": "100000+",
  "price_positioning": "premium",
  "priorities": {
    "market_size": 0.15,
    "affluence": 0.25,
    "growth": 0.20,
    "customer_fit": 0.20,
    "competition": 0.10,
    "cost": 0.10
  }
}
```

---

# 9. Role of the LLM

The LLM converts:

```text
"Our product is a high-end skincare concept targeted at
Gen Z and younger millennial women."
```

into explicit analytical assumptions.

The LLM does **not** rank cities.

It produces:

```text
customer demographic hypothesis
income sensitivity
pricing position
likely market-entry factors
initial factor weights
```

Every generated assumption should be editable.

---

# 10. Market Metrics Model

```python
class MarketMetrics(BaseModel):

    market_id: str
    name: str
    vintage: int

    population: float | None

    target_population: float | None
    target_age_share: float | None

    median_household_income: float | None
    high_income_share: float | None

    population_growth: float | None
    income_growth: float | None

    bachelor_degree_share: float | None

    median_rent: float | None

    competitive_density: float | None
```

---

# 11. Normalization

Raw variables cannot be directly combined.

Example:

```text
Population = 2,400,000
Income = 91,000
Growth = 0.034
Rent = 2,100
```

Normalize metrics to:

```text
0–100
```

For MVP, percentile normalization is preferable to min-max because it is less sensitive to extreme outliers.

Example:

```python
percentile_rank(market.population)
```

Result:

```text
Austin population score = 78
```

---

# 12. Metric Direction

Metrics must explicitly define whether higher values are good or bad.

Example:

```yaml
population:
  direction: positive

median_household_income:
  direction: positive

population_growth:
  direction: positive

median_rent:
  direction: negative

competitive_density:
  direction: negative
```

For negative metrics:

```text
normalized score = 100 - percentile
```

---

# 13. Market Attractiveness Model

Suggested hierarchy:

```text
Market Attractiveness
│
├── Market Size
│
├── Customer Fit
│
├── Affluence
│
├── Growth
│
├── Competitive Intensity
│
└── Cost
```

Example default:

```text
Market Size           20%
Customer Fit          20%
Affluence             20%
Growth                 20%
Competitive Intensity 10%
Cost                   10%
```

Formula:

```text
Score =
Σ(normalized factor score × factor weight)
```

Weights must sum to:

```text
1.0
```

or:

```text
100%
```

---

# 14. Composite Factors

Higher-level factors can contain multiple metrics.

Example:

```text
AFFLUENCE =
0.60 × Median Household Income Score
+
0.40 × High-Income Household Share Score
```

Growth:

```text
GROWTH =
0.60 × Population Growth Score
+
0.40 × Income Growth Score
```

Customer Fit:

```text
CUSTOMER FIT =
0.70 × Target Age Share
+
0.30 × Education Match
```

These mappings belong in configuration files rather than hardcoded API handlers.

---

# 15. Configuration

Example:

```yaml
factors:

  market_size:
    weight: 0.20
    metrics:
      population: 1.0

  affluence:
    weight: 0.20
    metrics:
      median_household_income: 0.6
      high_income_share: 0.4

  growth:
    weight: 0.20
    metrics:
      population_growth: 0.6
      income_growth: 0.4

  customer_fit:
    weight: 0.20
    metrics:
      target_age_share: 0.7
      bachelor_degree_share: 0.3

  competition:
    weight: 0.10

  cost:
    weight: 0.10
```

This makes the analytical framework inspectable and adjustable.

---

# 16. Missing Data

Do not treat missing data as zero.

If competition data is unavailable:

Incorrect:

```text
competition score = 0
```

Correct:

Remove competition and proportionally redistribute the remaining available weights.

Example:

Original:

```text
Size       20
Fit        20
Affluence  20
Growth     20
Competition 10
Cost       10
```

If Competition is unavailable:

```text
Size       22.22
Fit        22.22
Affluence  22.22
Growth     22.22
Cost       11.11
```

Return a warning stating that competition was excluded.

---

# 17. Sensitivity Analysis

This is one of the most important parts of the entire project.

The system should answer:

> **Is Austin genuinely the best market, or does Austin win only because of our assumptions?**

Allow factor weights to change.

Example:

```text
Scenario A — Growth Focused

Growth       35%
Affluence    20%
Market Size  15%
Customer Fit 15%
Competition  10%
Cost          5%
```

Versus:

```text
Scenario B — Conservative

Cost         25%
Competition  20%
Affluence    20%
Customer Fit 15%
Growth       10%
Market Size  10%
```

Compare resulting ranks.

---

# 18. Robustness Score

For each market, calculate how stable its rank is across multiple reasonable weight scenarios.

Example:

```text
Austin

Base rank: 1

Rank across simulations:
P10 = 1
Median = 2
P90 = 5
```

Possible robustness metric:

```text
% simulations appearing in Top 5
```

Example:

```text
Austin: 94%
Seattle: 76%
Miami: 51%
```

This is much more informative than one static ranking.

---

# 19. Monte Carlo Weight Sensitivity

Optional but highly recommended.

Take the base weights and perturb them.

For example:

```text
±25%
```

Then renormalize to 100%.

Run:

```text
1,000 simulations
```

For each market record:

```text
mean score
mean rank
rank standard deviation
Top-3 probability
Top-5 probability
```

Example output:

```json
{
  "market": "Austin",
  "base_rank": 1,
  "mean_rank": 1.84,
  "top_3_probability": 0.89,
  "top_5_probability": 0.97
}
```

This turns a basic city-ranking tool into a decision-analysis system.

---

# 20. Market Strengths and Weaknesses

Generate these deterministically.

For each market:

Sort factor scores.

Highest factors become strengths.

Lowest factors become weaknesses.

Example:

```json
{
  "strengths": [
    {
      "factor": "growth",
      "score": 94
    },
    {
      "factor": "affluence",
      "score": 88
    }
  ],

  "weaknesses": [
    {
      "factor": "cost",
      "score": 31
    }
  ]
}
```

The LLM may phrase the explanation.

It should not determine which dimensions are strengths or weaknesses.

---

# 21. Trade-Off Analysis

For the top markets, identify the principal trade-off.

Example:

```text
Austin vs. Los Angeles

Austin wins on:
+ Growth
+ Cost
+ Competitive intensity

Los Angeles wins on:
+ Market size
+ Target population
+ Affluence
```

This can be derived by comparing factor-level scores.

---

# 22. API Design

Base:

```text
/api/v1
```

## Parse business

```http
POST /strategy/parse
```

Request:

```json
{
  "description": "Premium fitness studio targeting affluent professionals aged 25-44."
}
```

Response:

```json
{
  "target_age_min": 25,
  "target_age_max": 44,
  "price_positioning": "premium",
  "initial_weights": {}
}
```

---

## List markets

```http
GET /markets
```

Optional:

```text
?state=CA
?limit=100
```

---

## Market detail

```http
GET /markets/{market_id}
```

---

## Score scenario

```http
POST /scenarios
```

Request:

```json
{
  "business_strategy": {},
  "weights": {
    "market_size": 0.20,
    "affluence": 0.25,
    "growth": 0.20,
    "customer_fit": 0.20,
    "competition": 0.05,
    "cost": 0.10
  }
}
```

Response:

```json
{
  "scenario_id": "...",
  "markets": [
    {
      "rank": 1,
      "name": "Austin-Round Rock-Georgetown",
      "score": 87.4,
      "factor_scores": {}
    }
  ]
}
```

---

## Sensitivity analysis

```http
POST /scenarios/{scenario_id}/sensitivity
```

Optional parameters:

```json
{
  "iterations": 1000,
  "weight_variation": 0.25
}
```

---

## Compare markets

```http
GET /scenarios/{scenario_id}/compare?markets=AUSTIN,SEATTLE,DENVER
```

Return:

```text
overall rank
factor scores
metric values
strengths
weaknesses
principal trade-offs
```

---

# 23. Data Ingestion

Create an ingestion command:

```bash
python -m scripts.sync_census
```

This should:

1. retrieve the selected Census variables;
2. retrieve relevant metro geographies;
3. normalize field names;
4. record dataset vintage;
5. persist observations locally.

Do not require Census API calls every time someone ranks markets.

---

# 24. Cache/Data Model

Suggested relational structure:

```text
markets
-------
id
name
state_codes

observations
------------
market_id
metric
value
vintage
source

scenarios
---------
id
description
created_at

scenario_weights
----------------
scenario_id
factor
weight

scenario_results
----------------
scenario_id
market_id
score
rank
```

---

# 25. Environment Variables

```env
CENSUS_API_KEY=

LLM_PROVIDER=openai
OPENAI_API_KEY=

DATABASE_URL=sqlite:///./data/app.db

DEFAULT_CENSUS_VINTAGE=2024

DEFAULT_GEOGRAPHY=metro

SENSITIVITY_ITERATIONS=1000
```

---

# 26. Error Handling

Explicitly handle:

```text
Invalid Census API key
Unsupported geography
Missing metric
Missing historical vintage
No markets returned
Invalid weights
Weights not summing to 1
LLM structured-output error
External API timeout
```

---

# 27. Source Transparency

Every metric returned through the API should expose metadata.

Example:

```json
{
  "metric": "median_household_income",
  "value": 98742,
  "source": "US Census ACS",
  "vintage": 2024
}
```

Users should be able to determine where every number came from.

---

# 28. Tests

Unit tests:

```text
Weight validation
Metric direction
Percentile normalization
Composite factor calculation
Overall scoring
Missing-data weight redistribution
Market ranking
Sensitivity simulation
Strength/weakness generation
Trade-off analysis
```

Integration tests:

```text
Census retrieval
Census variable mapping
Database ingestion
Business-description parsing
End-to-end market ranking
```

Use fixtures for routine tests instead of calling Census repeatedly.

---

# 29. MVP Definition

The MVP is complete when the backend can:

1. accept a natural-language business description;
2. translate it into structured target-market criteria;
3. retrieve/store Census metro data;
4. calculate 8–10 market metrics;
5. normalize metrics across markets;
6. calculate weighted attractiveness scores;
7. rank at least 50 US metropolitan markets;
8. explain strengths and weaknesses;
9. change rankings when assumptions change;
10. perform sensitivity analysis;
11. expose all results through REST endpoints.

---

# 30. Explicit Non-Goals

Do not build during V1:

```text
User authentication
CRM integrations
International markets
Street-level site selection
Store-level revenue forecasting
Real-estate listings
Google Maps integration
Agent swarms
Vector databases
Automated web scraping
Perfect competitor intelligence
```

The project is about **market selection**, not individual site selection.

---

# 31. Future Extensions

### Competitive-density integration

Add business-establishment data by category.

### Demand estimation

Estimate serviceable target population rather than simple demographic fit.

### Unit economics

Calculate:

```text
estimated customers × ARPU
-
occupancy
-
labor
-
marketing
```

for each market.

### Cannibalization

Model proximity to existing locations.

### Expansion sequencing

Instead of:

> Where should we enter?

answer:

> In what order should we enter five markets?

### Clustering

Identify structurally similar metros.

### Scenario library

Provide strategies such as:

```text
Growth at all costs
Premium positioning
Capital efficient
Low competition
Large-market-first
```

---

# 32. Core Design Principle

The architecture should preserve the following separation:

```text
WHAT BUSINESS ARE WE BUILDING?
            ↓
       LLM parsing

WHAT MAKES A MARKET ATTRACTIVE?
            ↓
 Explicit strategy assumptions

WHAT DOES THE DATA SAY?
            ↓
     Census + other data

WHICH MARKET WINS?
            ↓
 Deterministic scoring model

DOES IT STILL WIN IF OUR
ASSUMPTIONS ARE WRONG?
            ↓
     Sensitivity analysis
```

The central idea behind Market Entry War Room is not that software can rank cities.

A spreadsheet can rank cities.

The value comes from making the assumptions behind a market-entry decision **explicit, measurable, adjustable, and falsifiable**.

The backend should therefore optimize for transparency and sensitivity analysis rather than false precision.