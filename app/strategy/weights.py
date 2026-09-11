"""Factor weight validation and normalization (spec sections 13 and 16)."""

from __future__ import annotations

from app.config import default_weights
from app.errors import InvalidWeights

TOLERANCE = 1e-3


def validate_weights(weights: dict[str, float]) -> dict[str, float]:
    """Reject unknown factors, negatives, and sums that are not 1.0."""
    if not weights:
        raise InvalidWeights("weights must not be empty")

    known = set(default_weights())
    unknown = sorted(set(weights) - known)
    if unknown:
        raise InvalidWeights(
            f"Unknown factor(s): {', '.join(unknown)}. Known factors: {', '.join(sorted(known))}"
        )

    negative = sorted(k for k, v in weights.items() if v < 0)
    if negative:
        raise InvalidWeights(f"Weights must be non-negative; got negative for: {', '.join(negative)}")

    total = sum(weights.values())
    if total <= 0:
        raise InvalidWeights("Weights must sum to 1.0; got a total of 0")
    if abs(total - 1.0) > TOLERANCE:
        raise InvalidWeights(f"Weights must sum to 1.0 (+/- {TOLERANCE}); got {total:.4f}")

    return dict(weights)


def redistribute(weights: dict[str, float], available: set[str]) -> tuple[dict[str, float], list[str]]:
    """Drop unavailable factors and renormalize the rest proportionally.

    Missing data is never scored as zero. Returns the surviving weights and a
    warning per dropped factor.
    """
    dropped = sorted(set(weights) - available)
    kept = {k: v for k, v in weights.items() if k in available and v > 0}

    if not kept:
        raise InvalidWeights(
            "Every weighted factor is unavailable; nothing can be scored. "
            f"Dropped: {', '.join(dropped) or 'none'}"
        )

    total = sum(kept.values())
    normalized = {k: v / total for k, v in kept.items()}

    warnings = [
        f"Factor '{factor}' was excluded because no market had data for it; "
        "its weight was redistributed proportionally across the remaining factors."
        for factor in dropped
        if weights.get(factor, 0) > 0
    ]
    return normalized, warnings


def resolve_weights(requested: dict[str, float] | None) -> dict[str, float]:
    """Requested weights if given (validated), otherwise the config defaults."""
    if requested is None:
        return dict(default_weights())
    return validate_weights(requested)
