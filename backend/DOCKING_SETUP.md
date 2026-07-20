# Real AutoDock Vina setup

The `/api/docking` endpoint runs AutoDock Vina locally. It does not return
estimated or fallback docking data.

The project is configured with AutoDock Vina 1.2.7 at
`backend/tools/vina/vina.exe`. Open Babel is installed from the pinned
`openbabel-wheel` requirement and is found automatically in the backend
environment. For another deployment, either install the same requirement and
Vina binary or configure full executable paths before launching OmniGene Studio:

```powershell
$env:OMNIGENE_VINA_BINARY = 'C:\\tools\\vina\\vina.exe'
$env:OMNIGENE_OBABEL_BINARY = 'C:\\Program Files\\OpenBabel-3.1.1\\obabel.exe'
```

For packaged Windows builds, place the executables at
`backend/tools/vina/vina.exe` and `backend/tools/obabel/obabel.exe` before
building the backend, and include those directories as application resources.

Each run prepares the submitted SDF and selected PDB, docks with an
exhaustiveness of 16 in a 24 Å cube centered on the co-crystallized ligand,
and reports the Vina-generated pose energies and geometry-derived contacts.
