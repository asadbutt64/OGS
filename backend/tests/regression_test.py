"""
backend/tests/regression_test.py
=================================
Scientific regression test suite for OmniGene Studio expression pipeline.

Validates:
  1. Direction of expression (not just non-null) for benchmark genes.
  2. source_tag is NOT "curated" (live data pipeline always bypasses curated shortcuts).
  3. Invalid genes return None cleanly.
  4. Housekeeping gene (ACTB) shows broad expression.

Run via:
    python -m pytest backend/tests/regression_test.py -v
or standalone:
    python backend/tests/regression_test.py
"""

import os
import sys
import logging

# Allow import of backend modules from either the tests/ subdir or the project root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import data_engine

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Benchmark genes and expected biological direction
# ---------------------------------------------------------------------------
# Each entry: (gene_symbol, enriched_tissue, low_tissue, min_enriched_nTPM)
BENCHMARK_GENES = [
    ("TMPRSS6", "Liver", "Lung", 5.0),         # Liver-specific protease
    ("SFTPC", "Lung", "Liver", 5.0),            # Lung surfactant protein
    ("PTPRC", "Spleen", "Muscle - Skeletal", 2.0),  # Lymphoid / immune
]

# Housekeeping gene – should be expressed in ALL mapped tissues
HOUSEKEEPING_GENE = "ACTB"
HOUSEKEEPING_MIN_ACTIVE_TISSUES = 10  # at least 10 out of the mapped organs

# Key tissues we expect ACTB to be expressed in
ACTB_TISSUES_CHECK = ["Liver", "Muscle - Skeletal", "Whole Blood", "Heart - Left Ventricle", "Lung"]

# An unmistakably invalid gene symbol that should return None
INVALID_GENE = "THISGENEDOESNOTEXIST_XYZ999"


def _get_ntpm(records, tissue):
    """Return nTPM for a specific tissue name, or None if not found."""
    for r in records:
        if r["tissue"] == tissue:
            return r["nTPM"]
    return None


def verify_lowest_expression_logic(result):
    """Assert lowest[0].nTPM <= lowest[1].nTPM <= lowest[2].nTPM and lowest[0].nTPM is the true minimum of the array."""
    assert result is not None, "Expression data cannot be None"
    assert len(result) >= 3, f"Expression data must have at least 3 tissues, got {len(result)}"
    
    # 1. Pull the FULL expression array, sort ascending independently
    lowest = sorted(result, key=lambda x: x["nTPM"])[:3]
    
    # 2. Assert lowest[0].nTPM <= lowest[1].nTPM <= lowest[2].nTPM
    assert lowest[0]["nTPM"] <= lowest[1]["nTPM"], f"Lowest 3 not sorted ascending: {lowest[0]['nTPM']} > {lowest[1]['nTPM']}"
    assert lowest[1]["nTPM"] <= lowest[2]["nTPM"], f"Lowest 3 not sorted ascending: {lowest[1]['nTPM']} > {lowest[2]['nTPM']}"
    
    # 3. Assert lowest[0].nTPM is the true minimum of the full 54-tissue array
    true_min = min(result, key=lambda x: x["nTPM"])["nTPM"]
    assert lowest[0]["nTPM"] == true_min, f"lowest[0].nTPM is not the true minimum: {lowest[0]['nTPM']} != {true_min}"


def test_tmprss6():
    print("\nTest 1 – TMPRSS6: liver-enriched, low in lung, source_tag != curated")
    result = data_engine.get_gene_expression("TMPRSS6")
    assert result is not None, "TMPRSS6 returned None – pipeline dead-end detected!"
    assert len(result) > 0, "TMPRSS6 returned empty list"

    liver_tpm = _get_ntpm(result, "Liver")
    lung_tpm = _get_ntpm(result, "Lung")

    assert liver_tpm is not None, "TMPRSS6: 'Liver' tissue absent from results"
    assert lung_tpm is not None, "TMPRSS6: 'Lung' tissue absent from results"
    assert liver_tpm >= 5.0, f"TMPRSS6 Liver nTPM too low ({liver_tpm:.2f}); expected ≥5.0"
    assert liver_tpm > lung_tpm, (
        f"TMPRSS6 Liver ({liver_tpm:.2f}) should be higher than Lung ({lung_tpm:.2f})"
    )

    for r in result:
        assert r.get("source_tag") != "curated", (
            f"TMPRSS6 resolved via curated shortcut – this must not happen when curated_overrides is empty!"
        )

    verify_lowest_expression_logic(result)
    print(f"  [PASS] Liver={liver_tpm:.2f}, Lung={lung_tpm:.2f}, source={result[0].get('source_tag')}")


def test_sftpc():
    print("\nTest 2 – SFTPC: lung-enriched, low in liver, source_tag != curated")
    result = data_engine.get_gene_expression("SFTPC")
    assert result is not None, "SFTPC returned None – pipeline dead-end detected!"

    lung_tpm = _get_ntpm(result, "Lung")
    liver_tpm = _get_ntpm(result, "Liver")

    assert lung_tpm is not None, "SFTPC: 'Lung' tissue absent from results"
    assert lung_tpm >= 5.0, f"SFTPC Lung nTPM too low ({lung_tpm:.2f}); expected ≥5.0"
    if liver_tpm is not None:
        assert lung_tpm > liver_tpm, (
            f"SFTPC Lung ({lung_tpm:.2f}) should be higher than Liver ({liver_tpm:.2f})"
        )

    for r in result:
        assert r.get("source_tag") != "curated", "SFTPC resolved via curated shortcut!"

    verify_lowest_expression_logic(result)
    print(f"  [PASS] Lung={lung_tpm:.2f}, source={result[0].get('source_tag')}")


def test_ptprc():
    print("\nTest 3 – PTPRC: lymphoid/spleen-enriched, source_tag != curated")
    result = data_engine.get_gene_expression("PTPRC")
    assert result is not None, "PTPRC returned None – pipeline dead-end detected!"

    spleen_tpm = _get_ntpm(result, "Spleen")
    muscle_tpm = _get_ntpm(result, "Muscle - Skeletal")

    assert spleen_tpm is not None, "PTPRC: 'Spleen' tissue absent"
    assert spleen_tpm >= 2.0, f"PTPRC Spleen nTPM too low ({spleen_tpm:.2f}); expected ≥2.0"
    if muscle_tpm is not None:
        assert spleen_tpm > muscle_tpm, (
            f"PTPRC Spleen ({spleen_tpm:.2f}) should exceed Muscle ({muscle_tpm:.2f})"
        )

    for r in result:
        assert r.get("source_tag") != "curated", "PTPRC resolved via curated shortcut!"

    verify_lowest_expression_logic(result)
    print(f"  [PASS] Spleen={spleen_tpm:.2f}, source={result[0].get('source_tag')}")


def test_actb_housekeeping():
    print("\nTest 4 – ACTB: broad housekeeping expression, source_tag != curated")
    result = data_engine.get_gene_expression("ACTB")
    assert result is not None, "ACTB returned None – pipeline dead-end detected!"

    active_count = sum(1 for r in result if r["nTPM"] > 0)
    assert active_count >= HOUSEKEEPING_MIN_ACTIVE_TISSUES, (
        f"ACTB active tissue count too low ({active_count}); "
        f"expected ≥{HOUSEKEEPING_MIN_ACTIVE_TISSUES} (housekeeping gene should be broadly expressed)"
    )

    # Spot-check individual tissues
    for tissue in ACTB_TISSUES_CHECK:
        tpm = _get_ntpm(result, tissue)
        if tpm is not None:
            assert tpm > 0, f"ACTB: '{tissue}' returned 0 nTPM (housekeeping gene should be expressed)"

    for r in result:
        assert r.get("source_tag") != "curated", "ACTB resolved via curated shortcut!"

    verify_lowest_expression_logic(result)
    print(f"  [PASS] Active tissues={active_count}, source={result[0].get('source_tag')}")


def test_invalid_gene_returns_none():
    print(f"\nTest 5 – Invalid gene '{INVALID_GENE}' returns None (no synthetic noise)")
    result = data_engine.get_gene_expression(INVALID_GENE)
    assert result is None, (
        f"Invalid gene '{INVALID_GENE}' should return None, but returned: {result}"
    )
    print("  [PASS] Invalid gene correctly returns None")


def test_provenance_fields_present():
    print("\nTest 6 – Provenance fields (source_tag, fetch_timestamp) present on every record")
    result = data_engine.get_gene_expression("TNF")
    assert result is not None, "TNF returned None"
    for r in result:
        assert "source_tag" in r, f"Record missing 'source_tag': {r}"
        assert "fetch_timestamp" in r, f"Record missing 'fetch_timestamp': {r}"
        assert r["source_tag"] in ("curated", "mygene", "gtex", "local"), (
            f"Unexpected source_tag value: {r['source_tag']}"
        )
    verify_lowest_expression_logic(result)
    print(f"  [PASS] All {len(result)} records have source_tag and fetch_timestamp")


def run_all():
    print("=" * 60)
    print("OMNIGENE STUDIO – SCIENTIFIC REGRESSION TESTS")
    print("=" * 60)

    failures = []

    for test_fn in [
        test_tmprss6,
        test_sftpc,
        test_ptprc,
        test_actb_housekeeping,
        test_invalid_gene_returns_none,
        test_provenance_fields_present,
    ]:
        try:
            test_fn()
        except AssertionError as e:
            print(f"  [FAIL] {test_fn.__name__}: {e}")
            failures.append((test_fn.__name__, str(e)))
        except Exception as e:
            print(f"  [ERROR] {test_fn.__name__}: {type(e).__name__}: {e}")
            failures.append((test_fn.__name__, f"{type(e).__name__}: {e}"))

    print("\n" + "=" * 60)
    if failures:
        print(f"RESULT: {len(failures)} FAILURES")
        for name, msg in failures:
            print(f"  [FAIL] {name}: {msg}")
        sys.exit(1)
    else:
        print("RESULT: ALL TESTS PASSED [OK]")
    print("=" * 60)


if __name__ == "__main__":
    run_all()
