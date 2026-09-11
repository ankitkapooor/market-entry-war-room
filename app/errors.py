"""Application errors and their HTTP status mapping (spec section 26)."""

from __future__ import annotations


class WarRoomError(Exception):
    """Base for every error this application raises deliberately."""

    status_code = 400

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class MissingCensusKey(WarRoomError):
    status_code = 503


class CensusAPIError(WarRoomError):
    status_code = 502


class ExternalTimeout(WarRoomError):
    status_code = 504


class InvalidWeights(WarRoomError):
    status_code = 422


class UnknownMarket(WarRoomError):
    status_code = 404


class UnknownMetric(WarRoomError):
    status_code = 404


class NoMarketsAvailable(WarRoomError):
    status_code = 503


class UnsupportedGeography(WarRoomError):
    status_code = 400


class LLMOutputError(WarRoomError):
    status_code = 502
