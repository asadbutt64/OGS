import unittest
import os
import sqlite3
import sys

# Add backend directory to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

import data_engine

class TestReferenceKB(unittest.TestCase):
    def setUp(self):
        self.db_path = os.path.join(data_engine.BASE_DIR, 'datasets', 'reference_kb.sqlite')

    def test_database_existence_and_version(self):
        self.assertTrue(os.path.exists(self.db_path), "Reference KB database file does not exist!")
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Test tables schemas
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [row[0] for row in cursor.fetchall()]
        
        required_tables = ['proteins', 'cross_references', 'interaction_edges', 'edge_provenance', 'variants', 'metadata', 'pathways']
        for table in required_tables:
            self.assertIn(table, tables, f"Required table '{table}' is missing from Reference KB database!")
            
        # Test version info
        cursor.execute("SELECT value FROM metadata WHERE key='db_version'")
        row = cursor.fetchone()
        self.assertIsNotNone(row, "db_version metadata key is missing!")
        self.assertEqual(row[0], "OmniGene Reference KB v2026.07", "Incorrect db_version string!")
        conn.close()

    def test_local_pathway_query_tnf(self):
        pathway_data = data_engine.get_pathway_data("TNF")
        self.assertIsNotNone(pathway_data, "TNF local pathway lookup returned None!")
        self.assertEqual(pathway_data["pathway_name"], "TNFR1 Apoptosis Pathway")
        
        # Check nodes
        nodes = pathway_data["nodes"]
        self.assertTrue(len(nodes) >= 6, "Incorrect number of nodes resolved for TNF pathway!")
        tnf_node = next((n for n in nodes if n["id"] == "TNF"), None)
        self.assertIsNotNone(tnf_node, "TNF node not found in pathway data!")
        self.assertEqual(tnf_node["type"], "Ligand")
        self.assertIn("Reactome", tnf_node["citations"])

        # Check edges and confidence tiers
        edges = pathway_data["edges"]
        self.assertTrue(len(edges) >= 5, "Incorrect number of edges resolved for TNF pathway!")
        for edge in edges:
            self.assertIn("confidence_tier", edge, "Edge does not have a confidence_tier field!")
            self.assertEqual(edge["confidence_tier"], 1, "Local Reactome edge must be Tier 1 (Curated)!")

    def test_fallback_online_string_edge_downgrade(self):
        # Query a gene symbol not in local database to trigger STRING online fallback
        pathway_data = data_engine.get_pathway_data("SOX2")
        if pathway_data:
            self.assertEqual(pathway_data["pathway_name"], "SOX2 Interaction Network (STRING)")
            edges = pathway_data["edges"]
            for edge in edges:
                self.assertEqual(edge["confidence_tier"], 3, "STRING-only interaction edges must be downgraded to Tier 3!")

    def test_local_protein_type_classification(self):
        # CRK should be Adaptor
        crk_type = data_engine.guess_node_type("CRK")
        self.assertEqual(crk_type, "Adaptor", "CRK classification failed to resolve as Adaptor from local proteins database!")

        # SP7 should be Transcription Factor
        sp7_type = data_engine.guess_node_type("SP7")
        self.assertEqual(sp7_type, "Transcription Factor", "SP7 classification failed to resolve as Transcription Factor!")

        # OPG/TNFRSF11B should be Receptor
        opg_type = data_engine.guess_node_type("TNFRSF11B")
        self.assertEqual(opg_type, "Receptor", "OPG/TNFRSF11B failed to resolve as Receptor!")

    def test_vcf_variant_matching(self):
        # We can simulate parsing a VCF line containing rs121912808 (OPG variant) or rs121434569 (EGFR variant)
        ref_db = os.path.join(data_engine.BASE_DIR, 'datasets', 'reference_kb.sqlite')
        conn = sqlite3.connect(ref_db)
        cursor = conn.cursor()
        
        # OPG variant coordinate search
        cursor.execute("""
            SELECT p.gene_symbol, v.hgvs_notation, v.clinical_significance
            FROM variants v
            JOIN proteins p ON v.uniprot_id = p.uniprot_id
            WHERE v.variant_id = 'rs121912808'
        """)
        row = cursor.fetchone()
        self.assertIsNotNone(row, "rs121912808 variant not found in local reference KB!")
        self.assertEqual(row[0], "TNFRSF11B", "Incorrect gene associated with variant rs121912808!")
        self.assertEqual(row[2], "Pathogenic", "Incorrect pathogenicity classification!")
        conn.close()

if __name__ == '__main__':
    unittest.main()
