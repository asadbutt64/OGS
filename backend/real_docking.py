"""Production AutoDock Vina runner used by the docking API.

This module deliberately has no synthetic scoring or pose generation.  A result
is returned only after Vina has completed successfully and every displayed
energy is parsed from Vina's output file.
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any


class DockingUnavailable(RuntimeError):
    """Raised when a real local docking toolchain has not been installed."""


def _binary(name: str, env_name: str, backend_dir: Path) -> str:
    configured = os.environ.get(env_name)
    bundled = backend_dir / "tools" / name / (f"{name}.exe" if os.name == "nt" else name)
    venv_tool = backend_dir / ".venv" / "Scripts" / (f"{name}.exe" if os.name == "nt" else name)
    candidate = configured or (str(bundled) if bundled.exists() else None) or (str(venv_tool) if venv_tool.exists() else None) or shutil.which(name)
    if not candidate:
        raise DockingUnavailable(
            f"{name} was not found. Install AutoDock Vina and Open Babel, or set {env_name}. "
            "No simulated docking result was generated."
        )
    return candidate


def _run(command: list[str], cwd: Path, label: str) -> str:
    try:
        result = subprocess.run(command, cwd=cwd, capture_output=True, text=True, timeout=900)
    except FileNotFoundError as exc:
        raise DockingUnavailable(f"Could not start {label}: {exc}") from exc
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"{label} exceeded the 15 minute docking limit.") from exc
    if result.returncode:
        detail = (result.stderr or result.stdout).strip()[-1500:]
        raise RuntimeError(f"{label} failed: {detail}")
    return result.stdout


def _vina_energies(pdbqt: Path) -> list[float]:
    energies: list[float] = []
    for line in pdbqt.read_text(encoding="utf-8", errors="ignore").splitlines():
        match = re.search(r"REMARK VINA RESULT:\s+(-?\d+(?:\.\d+)?)", line)
        if match:
            energies.append(float(match.group(1)))
    if not energies:
        raise RuntimeError("Vina completed but did not write any scored poses.")
    return energies


def _split_sdf(text: str) -> list[str]:
    return [block.strip() + "\n$$$$\n" for block in text.split("$$$$") if block.strip()]


def _atom_coordinates(sdf: str) -> list[tuple[float, float, float, str]]:
    lines = sdf.splitlines()
    if len(lines) < 4:
        return []
    try:
        atom_count = int(lines[3][:3])
    except ValueError:
        return []
    atoms = []
    for line in lines[4:4 + atom_count]:
        try:
            atoms.append((float(line[:10]), float(line[10:20]), float(line[20:30]), line[31:34].strip().upper()))
        except ValueError:
            continue
    return atoms


def _receptor_atoms(pdb: str) -> list[tuple[float, float, float, str, str]]:
    atoms = []
    for line in pdb.splitlines():
        if not line.startswith(("ATOM  ", "HETATM")):
            continue
        try:
            element = (line[76:78].strip() or line[12:16].strip()[0]).upper()
            if element == "H":
                continue
            atoms.append((float(line[30:38]), float(line[38:46]), float(line[46:54]), element,
                          f"{line[17:20].strip()}-{line[22:26].strip()}"))
        except (ValueError, IndexError):
            continue
    return atoms


def _prepare_ligand_sdf(source_sdf: str, output_path: Path) -> None:
    """Create a reproducible, protonated 3D ligand conformer with RDKit."""
    try:
        from rdkit import Chem
        from rdkit.Chem import AllChem
    except ImportError as exc:
        raise DockingUnavailable("RDKit is required for ligand 3D preparation. Install backend requirements first.") from exc
    molecule = Chem.MolFromMolBlock(source_sdf, sanitize=True, removeHs=False)
    if molecule is None:
        raise ValueError("RDKit could not parse the submitted SDF ligand.")
    molecule = Chem.AddHs(molecule, addCoords=True)
    parameters = AllChem.ETKDGv3()
    parameters.randomSeed = 0x0D0C
    parameters.useSmallRingTorsions = True
    if AllChem.EmbedMolecule(molecule, parameters) != 0:
        raise ValueError("RDKit could not generate a 3D conformer for this ligand.")
    try:
        AllChem.MMFFOptimizeMolecule(molecule, maxIters=500)
    except Exception:
        AllChem.UFFOptimizeMolecule(molecule, maxIters=500)
    writer = Chem.SDWriter(str(output_path))
    writer.write(molecule)
    writer.close()


def _contacts(sdf: str, receptor_pdb: str) -> list[dict[str, Any]]:
    # Geometry is calculated from the actual Vina pose and receptor coordinates.
    receptor = _receptor_atoms(receptor_pdb)
    hits: dict[str, tuple[float, str]] = {}
    for x, y, z, element in _atom_coordinates(sdf):
        for rx, ry, rz, receptor_element, residue in receptor:
            distance = ((x-rx)**2 + (y-ry)**2 + (z-rz)**2) ** 0.5
            if distance > 4.0:
                continue
            # A distance/element-only check cannot establish donor/acceptor
            # chemistry, protonation or angle; report only what is measured.
            interaction = "Close contact"
            old = hits.get(residue)
            if old is None or distance < old[0]:
                hits[residue] = (distance, interaction)
    return [
        {"residue": residue, "distance": round(distance, 2), "type": interaction}
        for residue, (distance, interaction) in sorted(hits.items(), key=lambda item: item[1][0])[:12]
    ]


def dock(*, receptor_pdb: str, ligand_sdf: str, center: list[float], exhaustiveness: int = 16,
         num_modes: int = 9) -> dict[str, Any]:
    """Run a local Vina job and return only measurements produced by that job."""
    backend_dir = Path(__file__).resolve().parent
    vina = _binary("vina", "OMNIGENE_VINA_BINARY", backend_dir)
    obabel = _binary("obabel", "OMNIGENE_OBABEL_BINARY", backend_dir)
    with tempfile.TemporaryDirectory(prefix="omnigene_vina_") as temporary:
        work = Path(temporary)
        receptor = work / "receptor.pdb"
        ligand = work / "ligand.sdf"
        receptor_pdbqt = work / "receptor.pdbqt"
        ligand_pdbqt = work / "ligand.pdbqt"
        output_pdbqt = work / "poses.pdbqt"
        output_sdf = work / "poses.sdf"
        receptor.write_text(receptor_pdb, encoding="utf-8")
        _prepare_ligand_sdf(ligand_sdf, ligand)

        _run([obabel, str(receptor), "-O", str(receptor_pdbqt), "-xr"], work, "receptor preparation")
        _run([obabel, str(ligand), "-O", str(ligand_pdbqt), "-p", "7.4"], work, "ligand preparation")
        _run([vina, "--receptor", str(receptor_pdbqt), "--ligand", str(ligand_pdbqt),
              "--center_x", str(center[0]), "--center_y", str(center[1]), "--center_z", str(center[2]),
              "--size_x", "24", "--size_y", "24", "--size_z", "24", "--exhaustiveness", str(exhaustiveness),
              "--num_modes", str(num_modes), "--energy_range", "3", "--out", str(output_pdbqt)], work, "AutoDock Vina")
        energies = _vina_energies(output_pdbqt)
        _run([obabel, str(output_pdbqt), "-O", str(output_sdf)], work, "pose conversion")
        structures = _split_sdf(output_sdf.read_text(encoding="utf-8", errors="ignore"))
        if not structures:
            raise RuntimeError("The docked poses could not be converted to SDF.")
        poses = []
        for index, (energy, structure) in enumerate(zip(energies, structures), start=1):
            poses.append({"index": index, "free_energy": energy, "docked_sdf": structure,
                          "contacts": _contacts(structure, receptor_pdb), "vina_rank": index})
        return {"binding_energy": poses[0]["free_energy"], "poses": poses,
                "docked_sdf": poses[0]["docked_sdf"], "engine": "AutoDock Vina",
                "engine_version": _run([vina, "--version"], work, "Vina version check").strip()}
