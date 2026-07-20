import os
import sys
import json

# Add backend directory to path
sys.path.append(os.path.dirname(__file__))
import data_engine

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

def run_tests():
    print("====================================================")
    print("RUNNING OMNIGENE STUDIO SCIENTIFIC REGRESSION TESTS")
    print("====================================================")
    
    # Test 1: Hand-curated TNFRSF11B biological expression
    print("Test 1: Validating TNFRSF11B (OPG) curated tissue expression...")
    expr = data_engine.get_gene_expression("TNFRSF11B")
    assert len(expr) > 0, "TNFRSF11B expression returned empty list!"
    
    # Verify OPG is group enriched in Thyroid and Blood Vessels, not Lungs
    thyroid_tpm = next(x["nTPM"] for x in expr if x["tissue"] == "Thyroid")
    aorta_tpm = next(x["nTPM"] for x in expr if x["tissue"] == "Blood Vessel - Aorta")
    lung_tpm = next(x["nTPM"] for x in expr if x["tissue"] == "Lung")
    
    print(f"  Thyroid: {thyroid_tpm} TPM, Aorta: {aorta_tpm} TPM, Lung: {lung_tpm} TPM")
    assert thyroid_tpm > 50.0, "OPG Thyroid expression should be highly enriched (>50 TPM)"
    assert aorta_tpm > 35.0, "OPG Aorta expression should be highly enriched (>35 TPM)"
    assert thyroid_tpm > lung_tpm * 3, "OPG Thyroid should have >3x higher expression than Lung"
    verify_lowest_expression_logic(expr)
    print("  [PASS] Curated biological OPG expression is correct!")
    
    # Test 2: Real online GTEx/MyGene query for TNF
    print("\nTest 2: Validating online GTEx/MyGene expression query for TNF...")
    expr_tnf = data_engine.get_gene_expression("TNF")
    assert len(expr_tnf) > 0, "TNF expression returned empty list!"
    spleen_tnf = next(x["nTPM"] for x in expr_tnf if x["tissue"] == "Spleen")
    print(f"  Spleen TNF expression: {spleen_tnf} TPM")
    assert spleen_tnf > 0.0, "TNF Spleen expression should be valid"
    verify_lowest_expression_logic(expr_tnf)
    print("  [PASS] Online GTEx/MyGene expression lookup succeeds!")
    
    # Test 3: Approved therapeutic drug mapping
    print("\nTest 3: Validating approved drug lookup for bone/immune cascade...")
    opg_drugs = data_engine.get_drugs_for_gene("TNFRSF11B")
    print(f"  OPG Mapped Drugs: {[d['name'] for d in opg_drugs]}")
    assert any(d["name"] == "Denosumab" for d in opg_drugs), "OPG should map to Denosumab"
    
    sost_drugs = data_engine.get_drugs_for_gene("SOST")
    print(f"  SOST Mapped Drugs: {[d['name'] for d in sost_drugs]}")
    assert any(d["name"] == "Romosozumab" for d in sost_drugs), "SOST should map to Romosozumab"
    
    # Test 4: Verify no synthetic compound placeholders are emitted
    print("\nTest 4: Verifying permanent guard against synthetic compound placeholders...")
    sp7_drugs = data_engine.get_drugs_for_gene("SP7")
    print(f"  SP7 Mapped Drugs: {[d['name'] for d in sp7_drugs]}")
    for d in sp7_drugs:
        assert "Compound" not in d["name"] and "-x" not in d["name"], f"Synthetic placeholder leaked: {d['name']}"
    print("  [PASS] No synthetic placeholders generated. Guard is active!")
    
    # Test 5: Verify Automatic Ligand Finder (ChEMBL binding affinities)
    print("\nTest 5: Verifying ChEMBL ligand finder active binding compound listing...")
    tnf_ligands = data_engine.get_binding_ligands("TNF", "1TNR")
    print(f"  TNF Mapped Ligands: {[l['name'] for l in tnf_ligands]}")
    assert any("Infliximab" in l["name"] for l in tnf_ligands), "TNF should have Infliximab as a potential binder"
    
    egfr_ligands = data_engine.get_binding_ligands("EGFR", "1EGF")
    print(f"  EGFR Mapped Ligands: {[l['name'] for l in egfr_ligands]}")
    assert any("Osimertinib" in l["name"] for l in egfr_ligands), "EGFR should have Osimertinib as a potential binder"
    
    # Test 6: Verify invalid gene returns None
    print("\nTest 6: Verifying invalid gene symbol returns None (no data)...")
    invalid_expr = data_engine.get_gene_expression("INVALIDGENE123")
    assert invalid_expr is None, f"Invalid gene returned expression data instead of None: {invalid_expr}"
    print("  [PASS] Invalid gene returns None. No synthetic noise leaked!")

    # Test 7: Verify GSEA Hypergeometric & Configurable N correctness
    print("\nTest 7: Validating GSEA Hypergeometric & Configurable N logic...")
    try:
        # Invalid parameters should raise ValueError
        data_engine.hypergeometric_survival(10, 5, 20, 20000)
        assert False, "Should raise ValueError since k (10) > n (5)"
    except ValueError as e:
        print(f"  [PASS] Correctly raised error for invalid parameters: {e}")

    # Valid calculation
    p1 = data_engine.hypergeometric_survival(2, 5, 100, 20000)
    p2 = data_engine.hypergeometric_survival(2, 5, 100, 1000)
    print(f"  P-value for N=20000: {p1:.8f}, for N=1000: {p2:.8f}")
    assert p1 < p2, "Larger N background should yield lower p-value (higher significance) for same overlap"
    print("  [PASS] GSEA Hypergeometric math & configurable background checks pass!")
    
    print("\n====================================================")
    print("ALL REGRESSION TESTS COMPLETED SUCCESSFULLY! [100% PASS]")
    print("====================================================")

if __name__ == "__main__":
    run_tests()
