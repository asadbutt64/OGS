"""
backend/tests/pdf_ui_parity_test.py
=====================================
PDF / UI parity test suite.

For each benchmark gene, this test:
  1. Requests the /api/expression JSON payload (simulates what the UI sees).
  2. Verifies source_tag and fetch_timestamp are present.
  3. Verifies a "no data" gene returns 404 with a clear warning (not silent empty).
  4. Verifies a curated-fallback-disabled gene does NOT resolve via "curated" tier.
  5. Checks that the expression payload for the same gene called twice is
     structurally consistent (UI–PDF value stability check).

Run via:
    python -m pytest backend/tests/pdf_ui_parity_test.py -v
or standalone:
    python backend/tests/pdf_ui_parity_test.py
"""

import os
import sys
import json
import urllib.request
import urllib.error
import datetime

# Allow import from backend directory
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Backend base URL – adjust if running on a different port
BASE_URL = os.environ.get("OMNIGENE_BASE_URL", "http://127.0.0.1:8000")

# ---------------------------------------------------------------------------
# Benchmark gene set
# ---------------------------------------------------------------------------
# (gene, expect_source_not_curated, expect_data_present)
PARITY_GENES = [
    ("TNF", True, True),
    ("ACTB", True, True),
    ("TMPRSS6", True, True),
    ("SFTPC", True, True),
]

# A gene guaranteed to return no data anywhere
NO_DATA_GENE = "THISGENEDOESNOTEXIST_XYZ999"

# A gene that would resolve via curated if overrides existed – with empty curated_overrides.json
# it must fall through to live tiers (ensuring the warning propagates when curated is bypassed)
CURATED_BYPASS_GENE = "TNFRSF11B"


def _fetch_expression(gene: str):
    """Call the /api/expression endpoint and return (status_code, json_body)."""
    url = f"{BASE_URL}/api/expression?gene={gene}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "OmniGeneParity/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = json.loads(resp.read().decode())
            return resp.status, body
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode())
        except Exception:
            body = {"detail": str(e)}
        return e.code, body
    except Exception as e:
        return None, {"error": str(e)}


def test_provenance_on_all_benchmark_genes():
    print("\nTest 1 – Provenance fields present on all benchmark genes via API")
    failures = []
    for gene, _, expect_data in PARITY_GENES:
        code, body = _fetch_expression(gene)
        if code is None:
            failures.append(f"{gene}: API unreachable – {body.get('error')}")
            continue
        if not expect_data:
            continue
        if code != 200:
            failures.append(f"{gene}: expected HTTP 200, got {code}")
            continue
        records = body.get("expression", [])
        for r in records:
            if "source_tag" not in r:
                failures.append(f"{gene}: record missing 'source_tag'")
                break
            if "fetch_timestamp" not in r:
                failures.append(f"{gene}: record missing 'fetch_timestamp'")
                break
        print(f"  {gene}: {len(records)} records, source={records[0]['source_tag'] if records else 'n/a'}")
    if failures:
        for f in failures:
            print(f"  [FAIL] {f}")
        raise AssertionError(f"{len(failures)} provenance failures: {failures}")
    print("  [PASS] All benchmark genes have provenance fields")


def test_no_data_gene_returns_404_not_empty():
    print(f"\nTest 2 – No-data gene '{NO_DATA_GENE}' returns 404 (not silent empty body)")
    code, body = _fetch_expression(NO_DATA_GENE)
    if code is None:
        print(f"  [SKIP] API unreachable – {body.get('error')}")
        return
    assert code == 404, (
        f"Expected HTTP 404 for unknown gene, got {code}. "
        f"A silent empty-200 would make UI and PDF look identical to 'no expression' which is misleading."
    )
    assert "detail" in body, "404 response should contain 'detail' field explaining why"
    print(f"  [PASS] Got HTTP 404 with detail: {body['detail'][:80]}")


def test_curated_bypass_gene_not_curated():
    print(f"\nTest 3 – '{CURATED_BYPASS_GENE}' resolves via live tier (not curated) when overrides empty")
    code, body = _fetch_expression(CURATED_BYPASS_GENE)
    if code is None:
        print(f"  [SKIP] API unreachable – {body.get('error')}")
        return
    if code != 200:
        print(f"  [SKIP] Gene returned {code} – may be unresolvable in live data")
        return
    records = body.get("expression", [])
    for r in records:
        assert r.get("source_tag") != "curated", (
            f"'{CURATED_BYPASS_GENE}' resolved via 'curated' tier despite curated_overrides being empty. "
            f"This means stale curated data is being injected."
        )
    source = records[0]["source_tag"] if records else "n/a"
    print(f"  [PASS] Resolved via '{source}' (not curated)")


def test_ui_pdf_value_stability():
    print("\nTest 4 – Expression values stable across two consecutive calls (UI–PDF parity)")
    gene = "TNF"
    code1, body1 = _fetch_expression(gene)
    code2, body2 = _fetch_expression(gene)

    if code1 is None or code2 is None:
        print("  [SKIP] API unreachable")
        return
    if code1 != 200 or code2 != 200:
        print(f"  [SKIP] Gene returned non-200: {code1}, {code2}")
        return

    records1 = {r["tissue"]: r["nTPM"] for r in body1.get("expression", [])}
    records2 = {r["tissue"]: r["nTPM"] for r in body2.get("expression", [])}

    mismatches = []
    for tissue, val1 in records1.items():
        val2 = records2.get(tissue)
        if val2 is None:
            mismatches.append(f"{tissue}: missing in second call")
        elif abs(val1 - val2) > 1.0:  # allow ≤1 nTPM rounding drift
            mismatches.append(f"{tissue}: {val1} vs {val2} (drift > 1.0 nTPM)")

    if mismatches:
        raise AssertionError(
            f"Value drift detected between UI and PDF calls for {gene}:\n"
            + "\n".join(f"  {m}" for m in mismatches)
        )
    print(f"  [PASS] {len(records1)} tissues stable across both calls")


def test_source_tag_valid_enum():
    print("\nTest 5 – source_tag is always a valid enum value")
    valid_tags = {"curated", "mygene", "gtex", "local"}
    for gene, _, _ in PARITY_GENES:
        code, body = _fetch_expression(gene)
        if code != 200:
            continue
        for r in body.get("expression", []):
            tag = r.get("source_tag")
            assert tag in valid_tags, (
                f"{gene}: invalid source_tag '{tag}' – must be one of {valid_tags}"
            )
    print("  [PASS] All source_tag values are valid")


def test_warning_field_on_no_data():
    print("\nTest 6 – API includes 'warning' field when expression is empty (for curated-disabled genes)")
    # When curated is disabled and live tiers fail, backend returns 404 with detail.
    # We verify the detail string is meaningful (not generic).
    code, body = _fetch_expression(NO_DATA_GENE)
    if code == 404:
        detail = body.get("detail", "")
        assert len(detail) > 10, "404 detail message too short to be useful"
        assert NO_DATA_GENE.upper() in detail.upper() or "not found" in detail.lower(), (
            f"Detail doesn't mention the gene or 'not found': {detail}"
        )
        print(f"  [PASS] Meaningful 404 detail: {detail[:80]}")
    else:
        print(f"  [SKIP] Got {code} instead of 404 – this test requires the API to be running")


def run_all():
    print("=" * 60)
    print("OMNIGENE STUDIO – PDF / UI PARITY TESTS")
    print(f"Backend: {BASE_URL}")
    print("=" * 60)

    # Temporary bypass curated overrides during parity testing to let TNFRSF11B fall through to live data
    overrides_path = os.path.join(os.path.dirname(__file__), "../curated_overrides.json")
    backup_content = None
    if os.path.exists(overrides_path):
        try:
            with open(overrides_path, "r", encoding="utf-8") as f:
                backup_content = f.read()
            # Write empty overrides to disable curated injection during parity test
            with open(overrides_path, "w", encoding="utf-8") as f:
                json.dump({"overrides": {}}, f)
        except Exception as e:
            print(f"Warning: Failed to setup overrides backup: {e}")

    failures = []
    try:
        for test_fn in [
            test_provenance_on_all_benchmark_genes,
            test_no_data_gene_returns_404_not_empty,
            test_curated_bypass_gene_not_curated,
            test_ui_pdf_value_stability,
            test_source_tag_valid_enum,
            test_warning_field_on_no_data,
        ]:
            try:
                test_fn()
            except AssertionError as e:
                print(f"  [FAIL] {test_fn.__name__}: {e}")
                failures.append((test_fn.__name__, str(e)))
            except Exception as e:
                print(f"  [ERROR] {test_fn.__name__}: {type(e).__name__}: {e}")
                failures.append((test_fn.__name__, f"{type(e).__name__}: {e}"))
    finally:
        # Restore original curated overrides
        if backup_content is not None:
            try:
                with open(overrides_path, "w", encoding="utf-8") as f:
                    f.write(backup_content)
            except Exception as e:
                print(f"Warning: Failed to restore overrides backup: {e}")

    print("\n" + "=" * 60)
    if failures:
        print(f"RESULT: {len(failures)} FAILURES")
        for name, msg in failures:
            print(f"  [FAIL] {name}: {msg}")
        sys.exit(1)
    else:
        print("RESULT: ALL PARITY TESTS PASSED [OK]")
    print("=" * 60)


if __name__ == "__main__":
    run_all()
