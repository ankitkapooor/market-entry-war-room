from app.rate_limit import SlidingWindowRateLimiter


def test_rate_limiter_rejects_requests_above_the_limit():
    limiter = SlidingWindowRateLimiter()

    assert limiter.allow("visitor", 2) == (True, 0)
    assert limiter.allow("visitor", 2) == (True, 0)
    allowed, retry_after = limiter.allow("visitor", 2)

    assert allowed is False
    assert retry_after > 0


def test_rate_limiter_keeps_buckets_independent():
    limiter = SlidingWindowRateLimiter()

    assert limiter.allow("visitor-a", 1) == (True, 0)
    assert limiter.allow("visitor-b", 1) == (True, 0)
