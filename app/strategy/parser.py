"""Natural-language description -> BusinessStrategy."""

from __future__ import annotations

from pydantic import ValidationError

from app.clients.llm import active_provider, parse_heuristic, parse_openai
from app.config import default_weights
from app.errors import InvalidWeights, LLMOutputError
from app.models.business import BusinessStrategy, ParseResponse
from app.strategy.weights import validate_weights


def parse_business(description: str) -> ParseResponse:
    """Parse a description into an editable strategy plus suggested weights."""
    defaults = dict(default_weights())
    provider = active_provider()

    if provider == "openai":
        raw = parse_openai(description)
    else:
        raw = parse_heuristic(description, defaults)

    notes = list(raw.pop("notes", []))
    priorities = raw.pop("priorities", None) or defaults

    try:
        strategy = BusinessStrategy(description=description, **raw)
    except ValidationError as exc:
        raise LLMOutputError(f"{provider} parser produced an invalid strategy: {exc}") from exc

    normalized, weight_notes = _normalize(priorities, defaults)
    notes.extend(weight_notes)
    try:
        weights = validate_weights(normalized)
    except InvalidWeights as exc:
        # A bad weight suggestion should not fail the parse; fall back and say so.
        weights = defaults
        notes.append(f"Suggested weights rejected ({exc.message}); using the configured defaults.")

    strategy.priorities = weights
    return ParseResponse(
        strategy=strategy, initial_weights=weights, provider=provider, notes=notes
    )


def _normalize(
    priorities: dict, defaults: dict[str, float]
) -> tuple[dict[str, float], list[str]]:
    """Coerce to the known factor set and rescale to sum to 1.0.

    Anything discarded is reported, so a suggestion is never dropped silently.
    """
    cleaned = {
        k: float(v)
        for k, v in priorities.items()
        if k in defaults and isinstance(v, (int, float)) and v >= 0
    }
    notes = []
    discarded = sorted(set(priorities) - set(cleaned))
    if discarded:
        notes.append(f"Ignored unrecognized or invalid priorities: {', '.join(discarded)}.")

    total = sum(cleaned.values())
    if not cleaned or total <= 0:
        notes.append("No usable priorities were suggested; using the configured default weights.")
        return dict(defaults), notes

    return {k: round(v / total, 6) for k, v in cleaned.items()}, notes
