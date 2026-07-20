# OmniGene Studio

OmniGene Studio is an advanced desktop research workspace for spatial transcriptomics, molecular docking, and signaling cascade kinetic simulations. It translates raw genetic datasets, tissue expression levels, and structural records into interactive visual networks and physics-based models.

## Key Features
* **Spatial Expression Mapping:** Consolidates consensus tissue-specific expression datasets from GTEx v8 and the Human Protein Atlas (consensus profiles across 54 organs).
* **Signaling Pathway Topology Canvas:** Interactive node-edge visualization of signaling cascades (e.g. Apoptosis, PI3K/Akt, p53 DDR) using local curated Reactome records or live STRING database queries.
* **3D Protein Viewer & Molecular Docking:** WebGL structure rendering and pocket centroid mapping with a double-solver architecture:
  * **AutoDock Vina:** High-precision docking simulations with local binary tools.
  * **Omnigene Docking Engine (ODE):** A zero-dependency vectorized in-memory NumPy/GPU fallback solver for seamless cross-platform execution.
* **Tissue Similarity & Co-Expression:** Pearson correlation matrix heatmaps and OLS linear regressions to study tissue-profile gene-gene dynamics.
* **Pathway Flux ODE Kinetic Simulator:** System-dynamics simulations of pathway cascade signals with knockout toggles.
* **Robust Safety Controls:** Prevent data race conditions via selected-gene transaction matching, VCF uploads capped at 10MB to block DoS vectors, and real-time unresolved mapping warnings.

## Getting Started
1. Run `npm install` to setup frontend dev resources.
2. Setup the python virtual environment inside `backend/` and install requirements:
   ```bash
   cd backend
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```
3. Run the development workspace:
   ```bash
   npm run dev
   ```

## License
Licensed under the [MIT License](LICENSE).
