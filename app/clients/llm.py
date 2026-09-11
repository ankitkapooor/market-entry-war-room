"""Provider-neutral business-description parsing.

Both providers return the same dict shape. The LLM never ranks markets; it only
proposes assumptions, and every field it produces is overridable by the caller
(spec section 9).
"""

from __future__ import annotations

import json
import re

import httpx

from app.config import ROOT, settings
from app.errors import LLMOutputError, ExternalTimeout

PROMPT_PATH = ROOT / "prompts" / "business_to_strategy.md"

PRICE_KEYWORDS = {
    "luxury": ["luxury", "ultra-premium", "bespoke", "couture", "exclusive"],
    "premium": ["premium", "high-end", "upscale", "affluent", "boutique", "artisanal"],
    "value": ["budget", "discount", "affordable", "low-cost", "value-oriented", "no-frills"],
}

CATEGORY_KEYWORDS = {
    "fitness": ["fitness", "gym", "studio", "pilates", "yoga", "crossfit"],
    "skincare": ["skincare", "cosmetics", "beauty", "salon", "spa"],
    "food_beverage": ["restaurant", "cafe", "coffee", "bakery", "brewery", "bar", "juice"],
    "retail": ["retail", "store", "boutique", "apparel", "clothing", "shop"],
    "childcare": ["childcare", "daycare", "preschool", "nursery", "tutoring"],
    "healthcare": ["clinic", "dental", "medical", "urgent care", "therapy", "wellness"],
    "pet": ["pet", "dog", "veterinary", "grooming"],
    "coworking": ["coworking", "co-working", "office space", "workspace"],
}

# Weight tilts per price position. Applied to the config defaults, then renormalized.
PRICE_TILTS = {
    "luxury": {"affluence": 1.8, "cost": 0.7, "market_size": 0.8},
    "premium": {"affluence": 1.4, "customer_fit": 1.1, "cost": 0.8},
    "mass_market": {},
    "value": {"cost": 1.8, "affluence": 0.6, "market_size": 1.2},
}

INCOME_FLOOR_BY_POSITION = {
    "luxury": "200000+",
    "premium": "100000+",
    "mass_market": None,
    "value": None,
}


def _extract_age_range(text: str) -> tuple[int | None, int | None]:
    """Find '25-44', 'aged 25 to 44', 'under 35', 'over 50', or a generation name."""
    match = re.search(r"\b(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})\b", text)
    if match:
        lo, hi = int(match.group(1)), int(match.group(2))
        if 0 <= lo < hi <= 99:
            return lo, hi

    match = re.search(r"\b(?:under|below)\s+(\d{1,2})\b", text)
    if match:
        return 18, int(match.group(1))

    match = re.search(r"\b(?:over|above)\s+(\d{1,2})\b", text)
    if match:
        return int(match.group(1)), 99

    if "gen z" in text:
        return 18, 27
    if "millennial" in text:
        return 28, 43
    if "gen x" in text:
        return 44, 59
    if "boomer" in text or "retiree" in text or "senior" in text:
        return 60, 99
    return None, None


def _tilted_weights(position: str, defaults: dict[str, float]) -> dict[str, float]:
    tilts = PRICE_TILTS.get(position, {})
    tilted = {k: v * tilts.get(k, 1.0) for k, v in defaults.items()}
    total = sum(tilted.values())
    return {k: round(v / total, 4) for k, v in tilted.items()}


def parse_heuristic(description: str, defaults: dict[str, float]) -> dict:
    """Keyword and regex parsing. The default provider, and the fallback."""
    text = description.lower()
    notes: list[str] = []

    position = "mass_market"
    for candidate, words in PRICE_KEYWORDS.items():
        if any(word in text for word in words):
            position = candidate
            break
    if position == "mass_market":
        notes.append("No price signal found; assumed mass_market positioning.")

    category = "general"
    for candidate, words in CATEGORY_KEYWORDS.items():
        if any(word in text for word in words):
            category = candidate
            break
    if category == "general":
        notes.append("No recognizable category keyword; category set to 'general'.")

    age_min, age_max = _extract_age_range(text)
    if age_min is None:
        notes.append("No age range stated; target age defaults to the adult population (18+).")

    income = INCOME_FLOOR_BY_POSITION[position]
    price_match = re.search(r"\$\s?([\d,]+)", description)
    if price_match and income is None:
        notes.append("A price point was mentioned but no income floor was inferred.")
    if income:
        notes.append(f"Income floor of {income} inferred from {position} positioning.")

    return {
        "business_name": None,
        "category": category,
        "target_age_min": age_min,
        "target_age_max": age_max,
        "target_income": income,
        "price_positioning": position,
        "priorities": _tilted_weights(position, defaults),
        "notes": notes,
    }


def parse_openai(description: str, timeout: float = 40.0) -> dict:
    """Structured-output call. Only used when OPENAI_API_KEY is set."""
    prompt = PROMPT_PATH.read_text().replace("{description}", description)
    payload = {
        "model": "gpt-4o-mini",
        "messages": [{"role": "user", "content": prompt}],
        "response_format": {"type": "json_object"},
        "temperature": 0,
    }
    try:
        response = httpx.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {settings.openai_api_key}"},
            json=payload,
            timeout=timeout,
        )
    except httpx.TimeoutException as exc:
        raise ExternalTimeout("LLM provider timed out") from exc

    if response.status_code != 200:
        raise LLMOutputError(f"LLM provider returned {response.status_code}: {response.text[:200]}")

    try:
        content = response.json()["choices"][0]["message"]["content"]
        parsed = json.loads(content)
    except (KeyError, IndexError, ValueError) as exc:
        raise LLMOutputError(f"LLM returned unparseable structured output: {exc}") from exc

    if not isinstance(parsed, dict):
        raise LLMOutputError("LLM returned JSON that is not an object")
    return parsed


def active_provider() -> str:
    """'openai' only when both selected and keyed; otherwise 'heuristic'."""
    if settings.llm_provider == "openai" and settings.openai_api_key:
        return "openai"
    return "heuristic"
