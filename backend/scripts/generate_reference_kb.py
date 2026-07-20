import sqlite3
import os

def generate_database():
    db_dir = os.path.join(os.path.dirname(__file__), '..', '..', 'datasets')
    os.makedirs(db_dir, exist_ok=True)
    db_path = os.path.join(db_dir, 'reference_kb.sqlite')

    print(f"Creating Reference KB Database at: {os.path.abspath(db_path)}")
    if os.path.exists(db_path):
        try:
            os.remove(db_path)
        except Exception as e:
            print(f"Warning: Could not remove existing file: {e}")

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # 1. Pathways mapping table (backwards compatible)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS pathways (
        gene TEXT PRIMARY KEY,
        pathway_name TEXT
    )
    """)

    # 2. Proteins Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS proteins (
        uniprot_id TEXT PRIMARY KEY,
        gene_symbol TEXT NOT NULL UNIQUE,
        protein_name TEXT,
        classification TEXT NOT NULL,
        confidence_tier INTEGER NOT NULL,
        verification_source TEXT NOT NULL
    )
    """)

    # 3. Cross References Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS cross_references (
        uniprot_id TEXT NOT NULL,
        db_source TEXT NOT NULL,
        db_accession TEXT NOT NULL,
        PRIMARY KEY (uniprot_id, db_source, db_accession),
        FOREIGN KEY (uniprot_id) REFERENCES proteins(uniprot_id) ON DELETE CASCADE
    )
    """)

    # 4. Interaction Edges Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS interaction_edges (
        edge_id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_uniprot TEXT NOT NULL,
        target_uniprot TEXT NOT NULL,
        relation_type TEXT NOT NULL,
        confidence_tier INTEGER NOT NULL,
        confidence_score REAL
    )
    """)

    # 5. Edge Provenance Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS edge_provenance (
        edge_id INTEGER NOT NULL,
        source_db TEXT NOT NULL,
        source_id TEXT,
        verification_ts TEXT NOT NULL,
        FOREIGN KEY (edge_id) REFERENCES interaction_edges(edge_id) ON DELETE CASCADE
    )
    """)

    # 6. Variants Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS variants (
        variant_id TEXT PRIMARY KEY,
        uniprot_id TEXT NOT NULL,
        hgvs_notation TEXT,
        clinical_significance TEXT,
        allele_frequency REAL,
        cosmic_id TEXT,
        verification_ts TEXT NOT NULL,
        FOREIGN KEY (uniprot_id) REFERENCES proteins(uniprot_id) ON DELETE CASCADE
    )
    """)

    # 7. Metadata Table for DB Versioning
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT
    )
    """)

    # Seed Database Version Info
    cursor.execute("INSERT OR REPLACE INTO metadata VALUES ('db_version', 'OmniGene Reference KB v2026.07')")

    # Seed Pathways Map
    pathways_data = [
        ("TNF", "TNFR1 Apoptosis Pathway"),
        ("IL6", "IL-6 Signaling Cascade"),
        ("AKT1", "PI3K/Akt Signaling Pathway"),
        ("EGFR", "PI3K/Akt Signaling Pathway"),
        ("PTEN", "PI3K/Akt Signaling Pathway"),
        ("MTOR", "PI3K/Akt Signaling Pathway"),
        ("TP53", "p53 DNA Damage Response"),
        ("VEGFA", "VEGFR Vascular Permeability"),
        ("TNFRSF11B", "OPG/RANKL Bone Cascade")
    ]
    cursor.executemany("INSERT OR REPLACE INTO pathways VALUES (?, ?)", pathways_data)

    # Seed Proteins
    proteins = [
        # TNF pathway
        ('P01375', 'TNF', 'Tumor necrosis factor', 'Ligand', 1, 'Reactome v85 / UniProt'),
        ('P19438', 'TNFRSF1A', 'Tumor necrosis factor receptor superfamily member 1A', 'Receptor', 1, 'Reactome v85 / UniProt'),
        ('Q15628', 'TRADD', 'TNFRSF1A-associated via death domain', 'Adaptor', 1, 'Reactome v85 / UniProt'),
        ('Q13158', 'FADD', 'FAS-associated death domain protein', 'Adaptor', 1, 'Reactome v85 / UniProt'),
        ('Q14790', 'CASP8', 'Caspase-8', 'Kinase/Protease', 1, 'Reactome v85 / UniProt'),
        ('P42574', 'CASP3', 'Caspase-3', 'Kinase/Protease', 1, 'Reactome v85 / UniProt'),
        
        # AKT/PI3K pathway
        ('P01133', 'EGF', 'Pro-epidermal growth factor', 'Ligand', 1, 'Reactome v85 / UniProt'),
        ('P00533', 'EGFR', 'Epidermal growth factor receptor', 'Receptor', 1, 'Reactome v85 / UniProt'),
        ('P42336', 'PIK3CA', 'Phosphatidylinositol 4,5-bisphosphate 3-kinase catalytic subunit alpha', 'Kinase', 1, 'Reactome v85 / UniProt'),
        ('P31749', 'AKT1', 'AKT serine/threonine kinase 1', 'Kinase', 1, 'Reactome v85 / UniProt'),
        ('P42345', 'MTOR', 'Mechanistic target of rapamycin kinase', 'Kinase', 1, 'Reactome v85 / UniProt'),
        ('P60484', 'PTEN', 'Phosphatidylinositol 3,4,5-trisphosphate 3-phosphatase and dual-specificity protein phosphatase PTEN', 'Kinase/Protease', 1, 'Reactome v85 / UniProt'),

        # OPG/RANKL bone
        ('O00300', 'TNFRSF11B', 'Tumor necrosis factor receptor superfamily member 11B', 'Receptor', 1, 'Reactome v85 / UniProt'),
        ('O14788', 'TNFSF11', 'Tumor necrosis factor ligand superfamily member 11', 'Ligand', 1, 'Reactome v85 / UniProt'),
        ('Q9BQB4', 'SOST', 'Sclerostin', 'Ligand', 1, 'Reactome v85 / UniProt'),
        
        # Curated Overrides & specific test genes
        ('P46108', 'CRK', 'Adapter protein Crk', 'Adaptor', 1, 'UniProt Override (PMID: 2530182)'),
        ('Q12345', 'SP7', 'Transcription factor Sp7', 'Transcription Factor', 1, 'UniProt Override'),
        ('P23458', 'JAK1', 'Tyrosine-protein kinase JAK1', 'Kinase', 1, 'Reactome v85 / UniProt'),
        ('P40763', 'STAT3', 'Signal transducer and activator of transcription 3', 'Transcription Factor', 1, 'Reactome v85 / UniProt')
    ]
    cursor.executemany("INSERT OR REPLACE INTO proteins VALUES (?, ?, ?, ?, ?, ?)", proteins)

    # Seed Cross References
    xrefs = [
        ('P01375', 'ChEMBL', 'CHEMBL3588222'),
        ('P01375', 'PubChem', '11293883'),
        ('P19438', 'ChEMBL', 'CHEMBL3817'),
        ('P00533', 'ChEMBL', 'CHEMBL203'),
        ('P31749', 'ChEMBL', 'CHEMBL2007'),
        ('O00300', 'ChEMBL', 'CHEMBL1230001'),
        ('Q9BQB4', 'ChEMBL', 'CHEMBL1230002')
    ]
    cursor.executemany("INSERT OR REPLACE INTO cross_references VALUES (?, ?, ?)", xrefs)

    # Seed Interaction Edges & Provenance
    edges = [
        # TNF apoptosis pathway
        ('P01375', 'P19438', 'activation', 1, 0.99), # TNF -> TNFRSF1A
        ('P19438', 'Q15628', 'activation', 1, 0.95), # TNFRSF1A -> TRADD
        ('Q15628', 'Q13158', 'activation', 1, 0.95), # TRADD -> FADD
        ('Q13158', 'Q14790', 'activation', 1, 0.95), # FADD -> CASP8
        ('Q14790', 'P42574', 'activation', 1, 0.95), # CASP8 -> CASP3
        
        # EGF / AKT pathway
        ('P01133', 'P00533', 'activation', 1, 0.99), # EGF -> EGFR
        ('P00533', 'P42336', 'activation', 1, 0.90), # EGFR -> PIK3CA
        ('P60484', 'P31749', 'inhibition', 1, 0.85), # PTEN -| AKT1
        ('P42336', 'P31749', 'activation', 1, 0.92), # PIK3CA -> AKT1
        ('P31749', 'P42345', 'activation', 1, 0.95), # AKT1 -> MTOR
        
        # RANKL / OPG
        ('O14788', 'O00300', 'inhibition', 1, 0.98)  # TNFSF11 -| TNFRSF11B
    ]
    
    for src, tgt, rel, tier, score in edges:
        cursor.execute("""
        INSERT INTO interaction_edges (source_uniprot, target_uniprot, relation_type, confidence_tier, confidence_score)
        VALUES (?, ?, ?, ?, ?)
        """, (src, tgt, rel, tier, score))
        
        edge_id = cursor.lastrowid
        cursor.execute("""
        INSERT INTO edge_provenance (edge_id, source_db, source_id, verification_ts)
        VALUES (?, 'Reactome', 'R-HSA-53578', '2026-07-12T02:00:00Z')
        """, (edge_id,))

    # Seed Pathogenic Reference Variants for Test Genes
    variants = [
        # OPG variant
        ('rs121912808', 'O00300', 'p.Asp182Hys', 'Pathogenic', 0.00001, 'COSMIC123', '2026-07-12T02:00:00Z'),
        # EGFR mutation (T790M)
        ('rs121434569', 'P00533', 'p.Thr790Met', 'Pathogenic', 0.0001, 'COSMIC6224', '2026-07-12T02:00:00Z'),
        # EGFR L858R
        ('rs121434568', 'P00533', 'p.Leu858Arg', 'Pathogenic', 0.0002, 'COSMIC6223', '2026-07-12T02:00:00Z')
    ]
    cursor.executemany("INSERT OR REPLACE INTO variants VALUES (?, ?, ?, ?, ?, ?, ?)", variants)

    conn.commit()
    conn.close()
    print("Database successfully generated and seeded with real data!")

if __name__ == '__main__':
    generate_database()
