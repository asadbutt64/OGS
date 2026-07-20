import os
import sqlite3
import pandas as pd
import numpy as np

# Ensure datasets directory exists
os.makedirs('datasets', exist_ok=True)

# ----------------------------------------------------
# 1. GENERATE GTEX EXPRESSION DATA (.parquet)
# ----------------------------------------------------
print("Generating GTEx spatial expression dataset...")

tissues = [
    "Brain - Cortex", "Brain - Cerebellum", "Brain - Hippocampus", 
    "Brain - Amygdala", "Brain - Substantia Nigra", "Spinal Cord", 
    "Pituitary", "Thyroid", "Heart - Left Ventricle", "Heart - Atrial Appendage", 
    "Blood Vessel - Aorta", "Blood Vessel - Coronary Artery", "Lung", "Spleen", 
    "Stomach", "Pancreas", "Colon - Transverse", "Colon - Sigmoid", 
    "Small Intestine - Terminal Ileum", "Liver", "Kidney - Cortex", 
    "Kidney - Medulla", "Adrenal Gland", "Muscle - Skeletal", "Skin - Sun Exposed", 
    "Skin - Non Exposed", "Whole Blood", "Lymph Node", "Breast - Mammary Tissue", 
    "Ovary", "Testis", "Prostate", "Salivary Gland", "Esophagus - Mucosa", 
    "Esophagus - Muscularis", "Adipose - Subcutaneous", "Adipose - Visceral (Omentum)", 
    "Uterus", "Vagina", "Bladder", "Fallopian Tube", "Cervix - Ectocervix", 
    "Cervix - Endocervix", "Minor Salivary Gland", "Skeletal Muscle", 
    "Nerve - Tibial", "Artery - Tibial", "Artery - Coronary", "Heart - Ventricle",
    "Brain - Hypothalamus", "Brain - Caudate", "Brain - Putamen"
]

genes = ["TNF", "AKT1", "TP53", "EGFR", "GAPDH", "VEGFA", "MTOR", "PTEN", "STAT3", "IL6"]

# Generate synthetic biological TPM values
np.random.seed(42)
data = []

for gene in genes:
    for tissue in tissues:
        # Base housekeeping or tissue-specific profile
        if gene == "GAPDH":
            tpm = np.random.uniform(800.0, 1500.0)
        elif gene == "TNF":
            if any(x in tissue for x in ["Whole Blood", "Lymph Node", "Spleen", "Lung"]):
                tpm = np.random.uniform(50.0, 150.0)
            else:
                tpm = np.random.uniform(0.1, 8.0)
        elif gene == "IL6":
            if any(x in tissue for x in ["Whole Blood", "Lymph Node", "Spleen", "Colon"]):
                tpm = np.random.uniform(30.0, 100.0)
            else:
                tpm = np.random.uniform(0.0, 2.0)
        elif gene == "VEGFA":
            if any(x in tissue for x in ["Kidney", "Heart", "Thyroid", "Lung", "Adrenal"]):
                tpm = np.random.uniform(150.0, 350.0)
            else:
                tpm = np.random.uniform(10.0, 80.0)
        elif gene == "EGFR":
            if any(x in tissue for x in ["Skin", "Lung", "Breast", "Esophagus", "Colon"]):
                tpm = np.random.uniform(80.0, 220.0)
            else:
                tpm = np.random.uniform(5.0, 30.0)
        elif gene == "AKT1":
            tpm = np.random.uniform(40.0, 95.0)  # Ubiquitous signal transducer
        elif gene == "TP53":
            tpm = np.random.uniform(20.0, 50.0)  # Tumor suppressor
        elif gene == "PTEN":
            tpm = np.random.uniform(15.0, 45.0)  # Phosphatase
        elif gene == "MTOR":
            tpm = np.random.uniform(12.0, 35.0)  # Cell growth kinase
        elif gene == "STAT3":
            tpm = np.random.uniform(35.0, 85.0)  # Transcription factor
        else:
            tpm = np.random.uniform(1.0, 10.0)
            
        data.append({
            "gene": gene,
            "tissue": tissue,
            "nTPM": round(tpm, 2),
            "FDR": round(np.random.uniform(1e-6, 0.04), 6) # synthetic FDR p-values
        })

df = pd.DataFrame(data)
df.to_parquet('datasets/gtex_expression.parquet', index=False)
print(f"Created Parquet file with {len(df)} rows.")

# ----------------------------------------------------
# 2. GENERATE PATHWAY DATABASE (.sqlite)
# ----------------------------------------------------
print("Generating Reactome SQLite pathway database...")
db_path = 'datasets/reactome_pathways.sqlite'

if os.path.exists(db_path):
    os.remove(db_path)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Create tables
cursor.execute("""
CREATE TABLE IF NOT EXISTS pathways (
    gene TEXT,
    pathway_name TEXT
)
""")

cursor.execute("""
CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    name TEXT,
    type TEXT,
    description TEXT,
    pdb_id TEXT,
    citations TEXT
)
""")

cursor.execute("""
CREATE TABLE IF NOT EXISTS edges (
    source TEXT,
    target TEXT,
    relation TEXT
)
""")

# Insert pathway mapping
pathways_data = [
    ("TNF", "TNFR1 Apoptosis Pathway"),
    ("IL6", "IL-6 Signaling Cascade"),
    ("AKT1", "PI3K/Akt Signaling Pathway"),
    ("EGFR", "PI3K/Akt Signaling Pathway"),
    ("PTEN", "PI3K/Akt Signaling Pathway"),
    ("MTOR", "PI3K/Akt Signaling Pathway"),
    ("TP53", "p53 DNA Damage Response"),
    ("VEGFA", "VEGFR Vascular Permeability")
]
cursor.executemany("INSERT INTO pathways VALUES (?, ?)", pathways_data)

# Insert pathway nodes
nodes_data = [
    # TNFR1 Apoptosis Pathway
    ("TNF", "TNF-alpha", "Ligand", "Pro-inflammatory cytokine that binds to TNFR1 to trigger downstream cell death cascades.", "1TNF", "Locksley et al., Cell 2001 (PMID: 11250731)"),
    ("TNFR1", "TNFR1", "Receptor", "Tumor Necrosis Factor Receptor 1, recruits TRADD upon ligand binding.", "1EXT", "Banner et al., Cell 1993 (PMID: 8402904)"),
    ("TRADD", "TRADD", "Adaptor", "TNFRSF1A Associated via Death Domain. Recruits FADD.", "1YVI", "Hsu et al., Cell 1995 (PMID: 7781061)"),
    ("FADD", "FADD", "Adaptor", "Fas Associated via Death Domain. Recruits and oligomerizes pro-Caspase-8.", "1EDF", "Chinnaiyan et al., Cell 1995 (PMID: 7538907)"),
    ("Caspase-8", "Caspase-8", "Kinase/Protease", "Initiator caspase that cleaves and activates effector caspases.", "1QTN", "Muzio et al., Cell 1996 (PMID: 8646774)"),
    ("Caspase-3", "Caspase-3", "Kinase/Protease", "Executioner caspase responsible for proteolytic cleavage of cellular substrates leading to apoptosis.", "1PAU", "Nicholson et al., Nature 1995 (PMID: 7617036)"),
    ("Apoptosis", "Apoptosis", "Phenotype", "Programmed cell death outcome marked by membrane blebbing and DNA fragmentation.", "", "Kerr et al., Br J Cancer 1972 (PMID: 4557708)"),

    # PI3K/Akt Signaling Pathway
    ("EGF", "EGF", "Ligand", "Epidermal Growth Factor, binds to EGFR to stimulate cell proliferation.", "1JL9", "Carpenter et al., Ann Rev Biochem 1979 (PMID: 387389)"),
    ("EGFR", "EGFR", "Receptor", "Epidermal Growth Factor Receptor, homodimerizes and autophosphorylates upon EGF binding.", "1IVO", "Ullrich et al., Nature 1984 (PMID: 6088989)"),
    ("PI3K", "PI3K", "Kinase", "Phosphoinositide 3-Kinase, phosphorylates PIP2 to generate secondary messenger PIP3.", "1E7V", "Cantley et al., Science 2002 (PMID: 12040186)"),
    ("PIP3", "PIP3", "Transcription Factor", "Phosphatidylinositol (3,4,5)-trisphosphate, recruits AKT to plasma membrane.", "", "Toker et al., Cell 1997 (PMID: 9346232)"),
    ("PTEN", "PTEN", "Kinase/Protease", "Phosphatase and Tensin Homolog, dephosphorylates PIP3 to PIP2, acting as a tumor suppressor.", "1D5R", "Steck et al., Nat Genet 1997 (PMID: 9090379)"),
    ("AKT1", "Akt", "Kinase", "Akt serine/threonine kinase, activated by PDK1 phosphorylation at the plasma membrane.", "3QKK", "Alessi et al., EMBO J 1996 (PMID: 8895509)"),
    ("MTOR", "mTOR", "Kinase", "Mechanistic Target of Rapamycin Kinase, regulates cell growth, protein synthesis, and metabolism.", "4FV1", "Sabatini et al., Cell 1994 (PMID: 7954794)"),
    ("Survival", "Cell Survival", "Phenotype", "Cellular endpoint prompting survival, growth, and inhibition of apoptosis pathways.", "", "Datta et al., Genes Dev 1999 (PMID: 10580000)"),

    # p53 DNA Damage Response
    ("DNA_Damage", "DNA Damage", "Ligand", "Double strand breaks or genomic stress triggering cellular responses.", "", "Sancar et al., Annu Rev Biochem 2004 (PMID: 15189136)"),
    ("ATM_ATR", "ATM / ATR", "Kinase", "Sensors of DNA double/single strand breaks, phosphorylating p53.", "5W81", "Shiloh et al., Nat Rev Cancer 2003 (PMID: 14654765)"),
    ("TP53", "p53", "Transcription Factor", "Tumor suppressor protein regulating cell cycle arrest, DNA repair, and cell death.", "1OLG", "Lane et al., Nature 1979 (PMID: 379482)"),
    ("MDM2", "MDM2", "Adaptor", "E3 ubiquitin-protein ligase that targets p53 for proteasomal degradation.", "1YCR", "Oliner et al., Nature 1992 (PMID: 1614532)"),
    ("p21", "p21 (CDKN1A)", "Transcription Factor", "Cyclin-dependent kinase inhibitor causing G1/S cell cycle arrest.", "1AXC", "Harper et al., Cell 1993 (PMID: 7902901)"),
    ("BAX", "BAX", "Transcription Factor", "Pro-apoptotic Bcl-2 family member that permeabilizes mitochondrial membrane.", "1F16", "Oltvai et al., Cell 1993 (PMID: 8358788)"),
    ("Cell_Cycle_Arrest", "Cell Cycle Arrest", "Phenotype", "Halting of cell division to allow DNA damage repair.", "", "Hartwell et al., Science 1989 (PMID: 2683079)"),

    # IL-6 Signaling Cascade
    ("IL6", "IL-6", "Ligand", "Interleukin 6 cytokine, binds to IL-6R to mediate inflammatory response.", "1ALU", "Kishimoto et al., Blood 2005 (PMID: 15827137)"),
    ("IL6R", "IL-6R", "Receptor", "Interleukin 6 Receptor, recruits GP130 signal transducer.", "1P9M", "Taga et al., Cell 1989 (PMID: 2548731)"),
    ("GP130", "GP130", "Receptor", "Glycoprotein 130 transducer, activates JAK kinases.", "1I1R", "Hibi et al., Cell 1990 (PMID: 2261642)"),
    ("JAK1", "JAK1", "Kinase", "Janus Kinase 1, phosphorylates GP130 and STAT3.", "3EYG", "Ihle et al., Sem Immunology 1995 (PMID: 7578278)"),
    ("STAT3", "STAT3", "Transcription Factor", "Signal Transducer and Activator of Transcription 3. Dimerizes and translocates to nucleus.", "1BG1", "Darnell et al., Science 1997 (PMID: 9171787)"),
    ("Inflammation", "Inflammation", "Phenotype", "Systemic immune and inflammatory gene transcription output.", "", "Medzhitov et al., Nature 2008 (PMID: 18650913)"),
]

cursor.executemany("INSERT INTO nodes VALUES (?, ?, ?, ?, ?, ?)", nodes_data)

# Insert pathway edges
edges_data = [
    # TNFR1 Apoptosis Pathway
    ("TNF", "TNFR1", "activation"),
    ("TNFR1", "TRADD", "activation"),
    ("TRADD", "FADD", "activation"),
    ("FADD", "Caspase-8", "activation"),
    ("Caspase-8", "Caspase-3", "activation"),
    ("Caspase-3", "Apoptosis", "activation"),

    # PI3K/Akt Signaling Pathway
    ("EGF", "EGFR", "activation"),
    ("EGFR", "PI3K", "activation"),
    ("PI3K", "PIP3", "activation"),
    ("PTEN", "PIP3", "inhibition"),
    ("PIP3", "AKT1", "activation"),
    ("AKT1", "MTOR", "activation"),
    ("MTOR", "Survival", "activation"),

    # p53 DNA Damage Response
    ("DNA_Damage", "ATM_ATR", "activation"),
    ("ATM_ATR", "TP53", "activation"),
    ("MDM2", "TP53", "inhibition"),
    ("TP53", "MDM2", "activation"), # Feedback loop
    ("TP53", "p21", "activation"),
    ("TP53", "BAX", "activation"),
    ("p21", "Cell_Cycle_Arrest", "activation"),
    ("BAX", "Apoptosis", "activation"),

    # IL-6 Signaling Cascade
    ("IL6", "IL6R", "activation"),
    ("IL6R", "GP130", "activation"),
    ("GP130", "JAK1", "activation"),
    ("JAK1", "STAT3", "activation"),
    ("STAT3", "Inflammation", "activation"),
]

cursor.executemany("INSERT INTO edges VALUES (?, ?, ?)", edges_data)

conn.commit()
conn.close()

print("Reactome SQLite database successfully created.")
print("Mock data generation completed successfully!")
