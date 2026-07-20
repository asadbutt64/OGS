import sys
import os
import sqlite3
import pandas as pd

# Mock sys.frozen to simulate packaged binary file-resolution path
sys.frozen = True
sys.executable = r"C:\Users\AMIGO\.gemini\antigravity\scratch\omnigene-studio\dist-package\OmniGeneStudio-win32-x64\resources\app\dist-backend\backend_server.exe"

sys.path.append('backend')
import data_engine

print("Running mock data engine query for TNF...")
try:
    expr = data_engine.get_gene_expression("TNF")
    print("TNF Expression rows:", len(expr))
    path = data_engine.get_pathway_data("TNF")
    print("TNF Pathway resolved:", path is not None)
    if path:
        print("  Pathway Name:", path.get("pathway_name"))
        print("  Nodes Count:", len(path.get("nodes", [])))
        print("  Edges Count:", len(path.get("edges", [])))
except Exception as e:
    import traceback
    traceback.print_exc()
sys.stdout.flush()
