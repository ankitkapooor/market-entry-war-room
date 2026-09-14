"""Small in-process safeguards for the single-replica portfolio deployment."""

from collections import defaultdict, deque
from threading import BoundedSemaphore, Lock
from time import monotonic


class SlidingWindowRateLimiter:
    def __init__(self) -> None:
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def allow(self, key: str, limit: int, window_seconds: int = 3600) -> tuple[bool, int]:
        if limit <= 0:
            return True, 0

        now = monotonic()
        cutoff = now - window_seconds
        with self._lock:
            events = self._events[key]
            while events and events[0] <= cutoff:
                events.popleft()
            if len(events) >= limit:
                retry_after = max(1, int(events[0] + window_seconds - now) + 1)
                return False, retry_after
            events.append(now)
            return True, 0

    def reset(self) -> None:
        with self._lock:
            self._events.clear()


request_limiter = SlidingWindowRateLimiter()
strategy_gate = BoundedSemaphore(1)
sensitivity_gate = BoundedSemaphore(1)
