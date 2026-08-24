"""
Tests for the hallucination verifier (Day 7).

Runs with pytest OR standalone: `python tests/test_verifier.py`.
Proves the verifier accepts grounded figures (including negative/signed ones) and rejects any
fabricated rupee amount.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.agent.verifier import verify  # noqa: E402


def test_accepts_grounded_figures():
    allowed = {100.00, 2.00, 0.36, 97.64}
    r = verify("Gross Rs.100.00 minus MDR Rs.2.00 and GST Rs.0.36 gives net Rs.97.64.", allowed)
    assert r.ok, r.offending


def test_accepts_negative_net_by_magnitude():
    # a correct chargeback explanation states a negative net; magnitude must be allowed
    allowed = {1691.00, 39.91, 33.82, 6.09}
    r = verify("Chargeback of Rs.1691.00 leaves a net of Rs.-39.91, matching Razorpay.", allowed)
    assert r.ok, r.offending


def test_rejects_fabricated_amount():
    allowed = {100.00, 2.00}
    r = verify("The unexplained gap is Rs.999.99 which needs review.", allowed)
    assert not r.ok
    assert 999.99 in [abs(x) for x in r.offending]


def test_ignores_percentages_and_counts():
    allowed = {2860.00, 10.30}
    # 1.8% and "2 digits" must not be treated as rupee figures
    r = verify("The MDR is about 1.8% (Rs.10.30) across 2 digits of precision.", allowed)
    assert r.ok, r.offending


if __name__ == "__main__":
    passed = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"PASS {name}")
            passed += 1
    print(f"\n{passed} tests passed.")
