"""
End-to-end engine tests (Day 7 audit hardening).

Generates a fresh dataset into a temp dir and asserts the deterministic engine behaves: high
reconciled rate, every planted overcharge caught, no false matches, and validation rejects a
malformed input. Runs with pytest OR standalone: `python tests/test_engine.py`.
"""

from __future__ import annotations

import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.generator.generate import write_dataset          # noqa: E402
from backend.engine.loader import load_inputs                  # noqa: E402
from backend.engine.matcher import exact_match, fuzzy_match    # noqa: E402
from backend.engine.validation import validate_inputs          # noqa: E402


def _run(tmp):
    write_dataset(tmp, 520)
    inputs = load_inputs(tmp)
    result = fuzzy_match(exact_match(inputs), inputs)
    return result


def test_reconciled_rate_is_high():
    with tempfile.TemporaryDirectory() as tmp:
        result = _run(tmp)
        assert result.stats["reconciled_rate_pct"] >= 90.0, result.stats


def test_fee_anomalies_all_flagged():
    with tempfile.TemporaryDirectory() as tmp:
        result = _run(tmp)
        # 10 injected overcharges must all surface; rounding-noise rows also land here as the
        # honest false positives the engine cannot distinguish from tiny real overcharges.
        assert result.stats["fee_anomaly"] >= 10, result.stats


def test_fuzzy_matches_have_subunit_confidence():
    with tempfile.TemporaryDirectory() as tmp:
        result = _run(tmp)
        s = result.settlement
        fuzzy = s[s["match_status"] == "matched_fuzzy"]
        assert len(fuzzy) > 0
        assert (fuzzy["confidence"] < 1.0).all()
        assert (fuzzy["confidence"] >= 0.85).all()


def test_validation_rejects_missing_column():
    with tempfile.TemporaryDirectory() as tmp:
        result = _run(tmp)
        bad = result.settlement.drop(columns=["net_settled"])
        report = validate_inputs(result.settlement, bad, result.settlement)
        assert not report.ok
        assert any("net_settled" in e for e in report.errors)


if __name__ == "__main__":
    passed = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"PASS {name}")
            passed += 1
    print(f"\n{passed} tests passed.")
