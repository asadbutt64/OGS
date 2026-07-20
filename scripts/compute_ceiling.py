"""
scripts/compute_ceiling.py
==========================
Deploy-time script: reads the GTEx expression parquet, computes the global
95th-percentile nTPM value, and writes the result to
frontend/src/config/heatmap_ceiling.json.

Run as part of the CI build step BEFORE the Vite frontend build so that the
constant is bundled into the production artefact.

Usage:
    python scripts/compute_ceiling.py

The ceiling is recomputed on each deploy from the GTEx v8 dataset bundled with
this release. See README.md for recompute cadence documentation.
"""

import os
import sys
import json
import datetime

# ---------------------------------------------------------------------------
# Path resolution
# ---------------------------------------------------------------------------
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)

PARQUET_PATH = os.path.join(PROJECT_ROOT, "datasets", "gtex_expression.parquet")
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "src", "config")
OUTPUT_PATH = os.path.join(OUTPUT_DIR, "heatmap_ceiling.json")


def compute_ceiling(parquet_path: str, percentile: float = 95.0) -> float:
    """Return the global nth-percentile nTPM value across the full GTEx dataset."""
    try:
        import pandas as pd
        df = pd.read_parquet(parquet_path)
        if "nTPM" not in df.columns:
            raise ValueError("Parquet file is missing 'nTPM' column.")
        # Exclude zero values so the ceiling reflects expressed genes only
        expressed = df[df["nTPM"] > 0]["nTPM"]
        if expressed.empty:
            raise ValueError("No expressed rows (nTPM > 0) found in dataset.")
        ceiling = float(expressed.quantile(percentile / 100.0))
        return round(ceiling, 4)
    except ImportError:
        # pandas not available – fall back to a safe conservative default
        print("WARNING: pandas not installed. Using hard-coded fallback ceiling of 150.0")
        return 150.0


def main():
    print(f"[compute_ceiling] Reading GTEx dataset: {PARQUET_PATH}")

    if not os.path.exists(PARQUET_PATH):
        print(f"ERROR: Parquet dataset not found at {PARQUET_PATH}.")
        print("       Run backend/generate_datasets.py first, then re-run this script.")
        sys.exit(1)

    ceiling = compute_ceiling(PARQUET_PATH, percentile=95.0)
    print(f"[compute_ceiling] Global 95th-percentile nTPM ceiling = {ceiling}")

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    payload = {
        "version": "gtex_v8",
        "percentile": 95,
        "max_nTPM": ceiling,
        "computed_at": datetime.datetime.utcnow().isoformat() + "Z",
        "note": (
            "Recomputed on each deploy from GTEx v8 dataset. "
            "Do not edit manually – re-run scripts/compute_ceiling.py to update."
        )
    }

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

    print(f"[compute_ceiling] Written to {OUTPUT_PATH}")
    print(f"[compute_ceiling] Done.")


if __name__ == "__main__":
    main()
