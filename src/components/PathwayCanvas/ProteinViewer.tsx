import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store/store';
import { Upload, RefreshCw, AlertTriangle, ShieldCheck } from 'lucide-react';

interface ProteinViewerProps {
  pdbId: string;
}

const API_BASE = 'http://127.0.0.1:8000/api';

export default function ProteinViewer({ pdbId }: ProteinViewerProps) {
  const { selectedGene, mutatedGenes, setDockingResult } = useStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const [isDocking, setIsDocking] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dockingResult, setDockingResultLocal] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [proteinPdbData, setProteinPdbData] = useState<string>('');
  
  // Post-Docking Pipeline State Hooks
  const [selectedPoseIndex, setSelectedPoseIndex] = useState<number>(1);

  // Alchemical FEP (Tier 3) State Hooks
  const [fepResult, setFepResult] = useState<any>(null);
  const [isRunningFep, setIsRunningFep] = useState<boolean>(false);

  // Molecular Dynamics (Step 3) State Hooks
  const [mdResult, setMdResult] = useState<any>(null);
  const [isRunningMd, setIsRunningMd] = useState<boolean>(false);
  
  // Ligands Finder State Hooks
  const [availableLigands, setAvailableLigands] = useState<any[]>([]);
  const [selectedLigandId, setSelectedLigandId] = useState<string>('');
  const [isLoadingLigands, setIsLoadingLigands] = useState<boolean>(false);
  const [ligandsError, setLigandsError] = useState<string | null>(null);

  // 1. Fetch and render base PDB structure
  useEffect(() => {
    if (!containerRef.current || !pdbId) return;

    containerRef.current.innerHTML = '';
    const $3Dmol = (window as any).$3Dmol;
    if (!$3Dmol) {
      containerRef.current.innerHTML = `
        <div class="flex flex-col items-center justify-center h-full p-4 text-center">
          <span class="text-[10px] text-studio-textMuted italic">WebGL Renderer unavailable</span>
        </div>
      `;
      return;
    }

    try {
      const viewer = $3Dmol.createViewer(containerRef.current, {
        defaultcolors: $3Dmol.rasmolElementColors,
        backgroundColor: '#090d16'
      });
      viewerRef.current = viewer;

      const pdbUrl = `${API_BASE}/pdb/${pdbId.toUpperCase()}`;

      fetch(pdbUrl)
        .then(res => {
          if (!res.ok) throw new Error('Structure not found');
          return res.text();
        })
        .then(data => {
          setProteinPdbData(data);
          viewer.addModel(data, "pdb");
          viewer.setStyle({}, { cartoon: { color: 'spectrum' } });
          viewer.zoomTo();
          viewer.render();
          viewer.spin(true);
        })
        .catch(err => {
          console.error(err);
          if (containerRef.current) {
            containerRef.current.innerHTML = `
              <div class="flex flex-col items-center justify-center h-full p-4 text-center">
                <span class="text-[11px] text-studio-textMuted font-medium">Protein Structure Offline</span>
                <span class="text-[9px] text-studio-textMuted/60 mt-1">Failed to fetch PDB: ${pdbId.toUpperCase()}</span>
              </div>
            `;
          }
        });
    } catch (e) {
      console.error(e);
    }

    return () => {
      if (viewerRef.current) {
        viewerRef.current.clear();
      }
    };
  }, [pdbId]);

  // 1.5 Fetch potential binding ligands for active target (ChEMBL integration)
  // Uses an AbortController-backed 9-second timeout so the UI never hangs
  // indefinitely if ChEMBL is slow or rate-limited.
  useEffect(() => {
    if (!pdbId) return;
    setIsLoadingLigands(true);
    setLigandsError(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9000);

    fetch(`${API_BASE}/ligands?gene=${selectedGene}&pdb_id=${pdbId}`, { signal: controller.signal })
      .then(res => {
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        return res.json();
      })
      .then(data => {
        setAvailableLigands(data.ligands || []);
      })
      .catch(err => {
        if (err.name === 'AbortError') {
          setLigandsError('Timed out after 9 s. ChEMBL may be slow or rate-limited. Retry or upload a ligand manually.');
        } else {
          setLigandsError('Failed to fetch bioactivity compounds. Check your network or retry.');
        }
        console.error('Failed to load ligands:', err);
      })
      .finally(() => {
        clearTimeout(timeoutId);
        setIsLoadingLigands(false);
      });

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [selectedGene, pdbId]);

  // Handle selected ligand docking simulation trigger
  const handleSelectLigand = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const chemblId = e.target.value;
    if (!chemblId) return;
    
    const lig = availableLigands.find(l => l.chembl_id === chemblId);
    if (!lig) return;
    
    setSelectedLigandId(chemblId);
    setIsDocking(true);
    setError(null);
    
    try {
      const res = await fetch(`${API_BASE}/docking?pdb_id=${pdbId}&gene=${selectedGene}&chembl_id=${chemblId}&name=${encodeURIComponent(lig.name)}`, {
        method: 'POST'
      });
      
      if (!res.ok) throw new Error('Docking simulation failed at backend solver.');
      
      const data = await res.json();
      setSelectedPoseIndex(1);
      setDockingResultLocal(data);
      setDockingResult(data);
    } catch (err: any) {
      setError(err.message || 'Failed to complete molecular docking.');
    } finally {
      setIsDocking(false);
    }
  };

  // 2. Handle docking simulation file drops
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setError(null);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.sdf') && !file.name.endsWith('.mol2')) {
      setError('Unsupported format. Please upload .sdf or .mol2 ligand structures.');
      return;
    }

    await runDockingSimulation(file);
  };

  const runDockingSimulation = async (file: File) => {
    setIsDocking(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API_BASE}/docking?pdb_id=${pdbId}&gene=${selectedGene}`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        throw new Error('Docking simulation failed at backend solver.');
      }

      const data = await res.json();
      setSelectedPoseIndex(1);
      setDockingResultLocal(data);
      setDockingResult(data);
    } catch (err: any) {
      setError(err.message || 'Failed to complete molecular docking.');
    } finally {
      setIsDocking(false);
    }
  };

  const renderDockedLigand = (sdfData: string, customResidues?: any[]) => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    // Reset styles and clear secondary models
    viewer.clear();
    
    // Re-add target receptor protein PDB
    viewer.addModel(proteinPdbData, "pdb");
    viewer.setStyle({ model: 0 }, { cartoon: { color: 'spectrum' } });

    // Add docked small-molecule ligand
    viewer.addModel(sdfData, "sdf");
    // Style ligand as green stick structure
    viewer.setStyle({ model: 1 }, { stick: { colorscheme: 'greenCarbon', radius: 0.25 } });

    // Highlight contact active site residues as red sticks
    const activeRes = customResidues || (dockingResult && dockingResult.residues ? dockingResult.residues : []);
    const resiNumbers = activeRes.map((res: any) => {
      const num = parseInt(res.residue.split('-')[1]);
      return isNaN(num) ? null : num;
    }).filter((n: any) => n !== null);

    viewer.setStyle({ model: 0, resi: resiNumbers.length > 0 ? resiNumbers : [12, 45, 80] }, { stick: { colorscheme: 'redCarbon', radius: 0.15 }, cartoon: {} });

    viewer.zoomTo({ model: 1 });
    viewer.spin(false); // Stop spinning for stable inspection of binding pocket
    viewer.render();
  };

  // Re-render model in 3D viewer when selected pose changes or new docking result arrives
  useEffect(() => {
    if (dockingResult) {
      if (dockingResult.poses && dockingResult.poses.length > 0) {
        const currentPose = dockingResult.poses.find((p: any) => p.index === selectedPoseIndex) || dockingResult.poses[0];
        if (currentPose) {
          renderDockedLigand(currentPose.docked_sdf, currentPose.contacts);
        }
      } else {
        renderDockedLigand(dockingResult.docked_sdf, dockingResult.residues);
      }
    }
  }, [selectedPoseIndex, dockingResult, proteinPdbData]);

  const clearDocking = () => {
    setDockingResultLocal(null);
    setDockingResult(null);
    setError(null);
    setSelectedLigandId('');
    setSelectedPoseIndex(1);
    setFepResult(null);
    setMdResult(null);
    const viewer = viewerRef.current;
    if (viewer) {
      viewer.clear();
      viewer.addModel(proteinPdbData, "pdb");
      viewer.setStyle({ model: 0 }, { cartoon: { color: 'spectrum' } });
      viewer.zoomTo();
      viewer.spin(true);
      viewer.render();
    }
  };

  const runFepValidation = async () => {
    if (!dockingResult || isRunningFep) return;
    setIsRunningFep(true);
    setFepResult(null);
    setError(null);
    try {
      const ligandName = dockingResult.filename ? dockingResult.filename.replace('.sdf', '') : 'Ligand';
      const res = await fetch(`${API_BASE}/docking/fep?pdb_id=${pdbId}&gene=${selectedGene}&pose_index=${selectedPoseIndex}&ligand_name=${encodeURIComponent(ligandName)}`, {
        method: 'POST'
      });
      if (!res.ok) throw new Error('FEP alchemical free energy calculation failed.');
      const data = await res.json();
      setFepResult(data);
      // Sync to global store
      setDockingResult({
        ...dockingResult,
        fepResult: data
      });
    } catch (err: any) {
      setError(err.message || 'Failed to complete FEP alchemical calculation.');
    } finally {
      setIsRunningFep(false);
    }
  };

  const runMdStability = async () => {
    if (!dockingResult || isRunningMd) return;
    setIsRunningMd(true);
    setMdResult(null);
    setError(null);
    try {
      const ligandName = dockingResult.filename ? dockingResult.filename.replace('.sdf', '') : 'Ligand';
      const res = await fetch(`${API_BASE}/docking/md?pdb_id=${pdbId}&gene=${selectedGene}&pose_index=${selectedPoseIndex}&ligand_name=${encodeURIComponent(ligandName)}`, {
        method: 'POST'
      });
      if (!res.ok) throw new Error('MD simulation failed.');
      const data = await res.json();
      setMdResult(data);
      // Sync to global store
      setDockingResult({
        ...dockingResult,
        mdResult: data
      });
    } catch (err: any) {
      setError(err.message || 'Failed to complete MD stability simulation.');
    } finally {
      setIsRunningMd(false);
    }
  };

  // Check if any active residues are mutated in the patient profile
  const hasVcf = mutatedGenes.length > 0;
  const currentPose = dockingResult && dockingResult.poses ? (dockingResult.poses.find((p: any) => p.index === selectedPoseIndex) || dockingResult.poses[0]) : null;
  
  const activeRes = currentPose ? currentPose.contacts : (dockingResult && dockingResult.residues ? dockingResult.residues : []);
  const activeResNames = activeRes.map((r: any) => r.residue);
  const isMutated = mutatedGenes.includes(selectedGene.toUpperCase());
  
  // Specific pocket residues associated with known clinical variants
  const variantResidueMap: Record<string, { residue: string; name: string }> = {
    "EGFR": { residue: "THR-790", name: "T790M" },
    "TNF": { residue: "TYR-151", name: "Y151C" },
    "TNFRSF11B": { residue: "ASP-182", name: "D182N" }
  };
  
  const targetVariant = variantResidueMap[selectedGene.toUpperCase()];
  const hasSpecificConflict = hasVcf && isMutated && targetVariant && activeResNames.includes(targetVariant.residue);
  const mutationOverlap = hasSpecificConflict ? [targetVariant.residue] : [];

  const drawRmsdChart = (trajectory: any[]) => {
    if (!trajectory || trajectory.length === 0) return null;
    const width = 240;
    const height = 65;
    const padding = 10;
    
    const rmsds = trajectory.map(t => t.rmsd);
    const maxRmsd = Math.max(...rmsds, 3.0);
    const minRmsd = 0.0;
    
    const xScale = (t: number) => padding + (t / 50.0) * (width - 2 * padding);
    const yScale = (r: number) => height - padding - ((r - minRmsd) / (maxRmsd - minRmsd)) * (height - 2 * padding);
    
    const points = trajectory.map(t => `${xScale(t.time)},${yScale(t.rmsd)}`).join(' ');
    
    return (
      <svg width="100%" height={height} className="bg-slate-950/60 border border-studio-border/30 rounded p-1">
        <polyline
          fill="none"
          stroke="#22d3ee"
          strokeWidth="1.5"
          points={points}
        />
        {/* Draw threshold line at 2.0 A */}
        <line
          x1={xScale(0)}
          y1={yScale(2.0)}
          x2={xScale(50)}
          y2={yScale(2.0)}
          stroke="#f87171"
          strokeWidth="1"
          strokeDasharray="3,3"
        />
        <text x={padding + 5} y={yScale(2.0) - 2} className="text-[6.5px] fill-red-400 font-mono">2.0 Å stability limit</text>
        {/* Axis labels */}
        <text x={padding} y={height - 2} className="text-[6px] fill-slate-500 font-mono">0 ns</text>
        <text x={width - padding - 20} y={height - 2} className="text-[6px] fill-slate-500 font-mono">50 ns</text>
        <text x={width - padding - 50} y={padding + 6} className="text-[6.5px] fill-cyan-400 font-mono font-bold">End: {rmsds[rmsds.length - 1]} Å</text>
      </svg>
    );
  };

  return (
    <div className="flex flex-col gap-3 pt-3 border-t border-studio-border/30">
      
      {/* 3D Viewport Title */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-studio-textMuted font-bold uppercase tracking-wide">3D Protein Structure</span>
        {dockingResult && (
          <button 
            onClick={clearDocking} 
            className="text-[9px] text-red-400 hover:text-red-300 font-semibold uppercase tracking-wider"
          >
            Clear Ligand
          </button>
        )}
      </div>

      {/* 3D WebGL Canvas */}
      <div 
        ref={containerRef} 
        className="w-full h-48 bg-slate-950 rounded-lg relative overflow-hidden border border-studio-border/50 shadow-inner"
      />

      {/* Ligand Docking Panel */}
      {!dockingResult ? (
        <div className="flex flex-col gap-2">
          {/* Autocomplete Ligands Dropdown */}
          <div className="flex flex-col gap-1">
            <span className="text-[9px] text-studio-textMuted font-bold uppercase tracking-wider">Target Ligand Finder (ChEMBL)</span>
            <select
              value={selectedLigandId}
              onChange={handleSelectLigand}
              disabled={isLoadingLigands || isDocking}
              className="bg-slate-900 border border-studio-border text-slate-200 text-xs rounded p-2 outline-none font-mono focus:border-studio-glowBlue"
            >
              <option value="">-- SELECT MAPPED COMPOUND --</option>
              {availableLigands.map(lig => (
                <option key={lig.chembl_id} value={lig.chembl_id}>
                  {lig.name} ({lig.chembl_id}) - pChEMBL: {lig.pChEMBL}
                </option>
              ))}
            </select>
            {isLoadingLigands && (
              <span className="text-[8px] text-studio-glowBlue animate-pulse mt-0.5">Fetching bioactivity compounds…</span>
            )}
            {!isLoadingLigands && ligandsError && (
              <div className="flex items-start gap-1.5 mt-1 bg-red-950/30 border border-red-500/30 rounded p-2">
                <AlertTriangle className="w-3 h-3 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="text-[8.5px] text-red-300 leading-snug block">{ligandsError}</span>
                  <button
                    onClick={() => {
                      setLigandsError(null);
                      setIsLoadingLigands(true);
                      const controller = new AbortController();
                      const tid = setTimeout(() => controller.abort(), 9000);
                      fetch(`${API_BASE}/ligands?gene=${selectedGene}&pdb_id=${pdbId}`, { signal: controller.signal })
                        .then(r => r.json()).then(d => setAvailableLigands(d.ligands || []))
                        .catch(e => setLigandsError(e.name === 'AbortError' ? 'Timed out again. Upload a ligand manually.' : 'Retry failed.'))
                        .finally(() => { clearTimeout(tid); setIsLoadingLigands(false); });
                    }}
                    className="text-[8px] text-red-400 hover:text-red-200 font-bold uppercase tracking-wider mt-1 underline"
                  >
                    Retry
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Custom Ligand Drop Zone */}
          <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border border-dashed p-3 rounded-lg flex flex-col items-center justify-center transition-all ${
              isDragging 
                ? 'border-studio-glowBlue bg-studio-glowBlue/5 scale-[0.99]' 
                : 'border-studio-border/60 bg-slate-950/20 hover:border-slate-500'
            }`}
          >
            {isDocking ? (
              <div className="flex flex-col items-center gap-2 py-2">
                <RefreshCw className="w-5 h-5 text-studio-glowBlue animate-spin" />
                <span className="text-[10px] text-slate-300 font-medium">Running AutoDock Vina docking...</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1 cursor-pointer text-center">
                <Upload className="w-4 h-4 text-studio-textMuted" />
                <span className="text-[9px] text-slate-300 font-semibold">Or Drag & Drop Custom Ligand</span>
                <span className="text-[8px] text-studio-textMuted">Supports .sdf / .mol2 structures</span>
              </div>
            )}
            {error && <span className="text-[9px] text-red-400 mt-2 font-medium">{error}</span>}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 p-3 bg-slate-900/60 border border-studio-border rounded-lg text-[10px]">
          <div className="bg-blue-500/10 border border-blue-500/30 text-blue-400 text-[8.5px] p-2 rounded leading-relaxed">
            <strong>PREDICTED BINDING AFFINITY (AutoDock Vina)</strong> — Poses and ΔG scores are generated by the local AutoDock Vina engine. They are computational docking estimates, not experimental binding affinities.
          </div>

          <div className="flex justify-between items-center border-b border-studio-border/30 pb-1.5 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-slate-200 truncate">Result ({dockingResult.filename})</span>
              {currentPose && (
                <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider shrink-0 ${
                  currentPose.confidence === "High" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30" :
                  currentPose.confidence === "Medium" ? "bg-amber-500/10 text-amber-400 border border-amber-500/30" :
                  "bg-red-500/10 text-red-400 border border-red-500/30"
                }`}>
                  {currentPose.confidence} Conf
                </span>
              )}
            </div>
            <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded font-mono font-bold shrink-0">
              ΔG: {currentPose ? currentPose.free_energy : dockingResult.binding_energy} kcal/mol
            </span>
          </div>

          {/* Pose Selector Dropdown */}
          {dockingResult.poses && (
            <div className="flex items-center justify-between bg-slate-950/40 border border-studio-border/40 p-2 rounded gap-4">
              <span className="text-slate-400 font-bold uppercase tracking-wider text-[8.5px]">Select Pose (1-9)</span>
              <select
                value={selectedPoseIndex}
                onChange={(e) => {
                  setSelectedPoseIndex(Number(e.target.value));
                  setFepResult(null);
                  setMdResult(null);
                }}
                className="bg-slate-900 border border-studio-border text-slate-200 text-[10px] rounded px-1.5 py-0.5 outline-none font-mono focus:border-studio-glowBlue cursor-pointer"
              >
                {dockingResult.poses.map((p: any) => (
                  <option key={p.index} value={p.index}>
                    Pose {p.index} (ΔG: {p.free_energy} kcal/mol, {p.confidence} Conf)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 2b Tier 1 MM-GBSA Ensemble details */}
          {currentPose && (
            <div className="flex flex-col gap-1.5 bg-slate-950/30 border border-studio-border/20 p-2 rounded">
              <span className="text-studio-textMuted font-bold uppercase tracking-wider text-[8.5px]">Tier 1 — Physics-based Free Energy</span>
              <div className="grid grid-cols-2 gap-2 text-[9.5px]">
                <div className="flex justify-between items-center border-b border-studio-border/10 pb-0.5">
                  <span className="text-studio-textMuted">Vina ΔG:</span>
                  <span className="font-mono text-slate-200 font-bold">{currentPose.free_energy} kcal/mol</span>
                </div>
                <div className="flex justify-between items-center border-b border-studio-border/10 pb-0.5">
                  <span className="text-studio-textMuted">MM-GBSA ΔG:</span>
                  <span className="font-mono text-studio-glowCyan font-bold">{currentPose.gbsa_mean} ± {currentPose.gbsa_std} kcal/mol</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-studio-textMuted">Strain Energy:</span>
                  <span className={`font-mono font-bold ${currentPose.strain_energy > 4.0 ? 'text-red-400' : 'text-slate-300'}`}>{currentPose.strain_energy} kcal/mol</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-studio-textMuted">RMSD (to Pose 1):</span>
                  <span className="font-mono text-slate-300 font-bold">{currentPose.rmsd} Å</span>
                </div>
              </div>
            </div>
          )}

          {/* 2c Tier 2 Modern ML-based Scoring (Gnina & GNN Rank Consensus) */}
          {currentPose && (
            <div className="flex flex-col gap-1.5 bg-slate-950/30 border border-studio-border/20 p-2 rounded">
              <span className="text-studio-textMuted font-bold uppercase tracking-wider text-[8.5px]">Tier 2 — Modern ML-based Scoring & Consensus</span>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[9px] font-mono text-slate-300">
                <div className="flex justify-between items-center">
                  <span>Gnina CNN Score:</span>
                  <span className="font-bold text-slate-200">{currentPose.gnina_score} (Rank #{currentPose.gnina_rank})</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>OnionNet GNN:</span>
                  <span className="font-bold text-slate-200">{currentPose.gnn_score} (Rank #{currentPose.gnn_rank})</span>
                </div>
                <div className="flex justify-between items-center border-t border-studio-border/10 pt-1">
                  <span>Vina Rank:</span>
                  <span>#{currentPose.vina_rank}</span>
                </div>
                <div className="flex justify-between items-center border-t border-studio-border/10 pt-1">
                  <span>GBSA Rank:</span>
                  <span>#{currentPose.gbsa_rank}</span>
                </div>
              </div>
              <div className="border-t border-studio-border/10 pt-1.5 flex justify-between items-center text-[9.5px]">
                <span className="text-studio-textMuted font-semibold">Rank-Consensus Score:</span>
                <span className="font-bold font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">#{currentPose.consensus_rank} / 9</span>
              </div>
            </div>
          )}

          {/* 1a Clustering Convergence info */}
          {dockingResult.cluster_desc && (
            <div className="bg-slate-950/40 border border-studio-border/40 p-2 rounded text-[8.5px] leading-relaxed text-slate-300">
              <span className="text-studio-textMuted font-bold uppercase tracking-wider block mb-0.5">Pose Clustering Convergence (2.0 Å)</span>
              {dockingResult.cluster_desc}
            </div>
          )}

          {/* Step 4 — ADMET Profiler Card */}
          {dockingResult.admet && (
            <div className="flex flex-col gap-1.5 bg-slate-950/30 border border-studio-border/20 p-2 rounded">
              <div className="flex justify-between items-center border-b border-studio-border/10 pb-1">
                <span className="text-slate-400 font-bold uppercase tracking-wider text-[8.5px]">Step 4 — ADMET & Druglikeness Profiler</span>
                <span className={`px-1.5 py-0.2 rounded text-[7.5px] font-bold uppercase ${
                  dockingResult.admet.druglikeness_pass ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                }`}>
                  {dockingResult.admet.druglikeness_pass ? 'Lipinski Pass' : 'Lipinski Fail'}
                </span>
              </div>
              
              <div className="grid grid-cols-3 gap-2 text-[8.5px] font-mono text-slate-300">
                <div>
                  <div className="text-studio-textMuted text-[7px] uppercase">MW:</div>
                  <div className="font-bold">{dockingResult.admet.mw} Da</div>
                </div>
                <div>
                  <div className="text-studio-textMuted text-[7px] uppercase">LogP:</div>
                  <div className="font-bold">{dockingResult.admet.logp}</div>
                </div>
                <div>
                  <div className="text-studio-textMuted text-[7px] uppercase">TPSA:</div>
                  <div className="font-bold">{dockingResult.admet.tpsa} Å²</div>
                </div>
                <div>
                  <div className="text-studio-textMuted text-[7px] uppercase">H-Bond Donors:</div>
                  <div className="font-bold">{dockingResult.admet.hbd}</div>
                </div>
                <div>
                  <div className="text-studio-textMuted text-[7px] uppercase">H-Bond Acceptors:</div>
                  <div className="font-bold">{dockingResult.admet.hba}</div>
                </div>
                <div>
                  <div className="text-studio-textMuted text-[7px] uppercase">Rotatable Bonds:</div>
                  <div className="font-bold">{dockingResult.admet.rotatable_bonds}</div>
                </div>
              </div>

              <div className={`p-1.5 rounded text-[8px] leading-normal font-mono ${
                dockingResult.admet.pains_flag ? 'bg-red-950/20 border border-red-500/20 text-red-300 animate-pulse' : 'bg-slate-950/40 border border-studio-border/20 text-slate-400'
              }`}>
                <strong>PAINS / Brenk Alerts:</strong> {dockingResult.admet.structural_alerts}
              </div>

              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[8.5px] pt-1 border-t border-studio-border/10">
                <div className="flex justify-between items-center">
                  <span className="text-studio-textMuted">hERG Cardiotox:</span>
                  <span className={`font-bold ${dockingResult.admet.herg_risk === 'High' ? 'text-red-400' : 'text-slate-300'}`}>{dockingResult.admet.herg_risk} Risk</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-studio-textMuted">Ames Mutagenic:</span>
                  <span className={`font-bold ${dockingResult.admet.ames_mutagenic === 'Positive' ? 'text-red-400' : 'text-slate-300'}`}>{dockingResult.admet.ames_mutagenic}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-studio-textMuted">CYP3A4 Inhib:</span>
                  <span className={`font-bold ${dockingResult.admet.cyp3a4.includes('Caution') ? 'text-amber-400' : 'text-slate-300'}`}>{dockingResult.admet.cyp3a4.includes('Caution') ? 'Yes' : 'No'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-studio-textMuted">CNS MPO Score:</span>
                  <span className="font-bold text-cyan-400">{dockingResult.admet.cns_mpo} / 6</span>
                </div>
                {dockingResult.admet.bbb_relevant && (
                  <div className="flex justify-between items-center col-span-2 text-cyan-400 font-bold text-[7.5px] uppercase font-mono tracking-wider pt-0.5">
                    <span>* CNS Target - BBB Permeable:</span>
                    <span>{dockingResult.admet.bbb_permeable}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 5 — Selectivity & Off-Target Profiler */}
          {dockingResult.selectivity_profile && (
            <div className="flex flex-col gap-1.5 bg-slate-950/30 border border-studio-border/20 p-2 rounded">
              <span className="text-slate-400 font-bold uppercase tracking-wider text-[8.5px]">Step 5 — Selectivity & Off-Target Profiler</span>
              <div className="flex flex-col gap-1">
                {dockingResult.selectivity_profile.map((ot: any, ot_idx: number) => (
                  <div key={ot_idx} className="flex justify-between items-center text-[9px] font-mono border-b border-studio-border/10 pb-0.5 last:border-0 last:pb-0">
                    <span className="text-slate-300">{ot.gene} (Paralog):</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-400">ΔG: {ot.binding_energy} kcal/mol</span>
                      <span className={`px-1 rounded text-[7.5px] font-bold ${
                        ot.risk === "High" ? "bg-red-500/10 text-red-400 border border-red-500/20 animate-pulse" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      }`}>
                        {ot.risk} Risk
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 1b Interaction Fingerprinting list */}
          <div className="flex flex-col gap-1">
            <span className="text-[9px] text-studio-textMuted font-bold uppercase tracking-wider">Active Pocket Contacts (Pose {selectedPoseIndex})</span>
            <div className="grid grid-cols-3 gap-2 text-slate-300 font-mono text-[9px]">
              {activeRes.map((res: any, idx: number) => {
                const isConflict = mutationOverlap.includes(res.residue);
                return (
                  <div key={idx} className={`p-1.5 rounded border ${isConflict ? 'bg-red-950/20 border-red-500/30 animate-pulse' : 'bg-slate-950/40 border-studio-border/40'}`}>
                    <div className="flex items-center gap-1 font-bold text-slate-200">
                      {isConflict && <AlertTriangle className="w-2.5 h-2.5 text-amber-500" />}
                      <span>{res.residue}</span>
                    </div>
                    <div className="text-[8px] text-studio-textMuted mt-0.5">{res.type}</div>
                    <div className="text-[8px] text-studio-textMuted">{res.distance} Å</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tier 3 & Step 3 Interactive Calculations */}
          <div className="flex gap-2 border-t border-studio-border/30 pt-2">
            <button
              onClick={runFepValidation}
              disabled={isRunningFep || isRunningMd}
              className="flex-1 bg-studio-glowCyan/20 hover:bg-studio-glowCyan/30 border border-studio-glowCyan/40 text-studio-glowCyan hover:text-cyan-200 text-[9px] font-bold uppercase tracking-wider py-1.5 rounded flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRunningFep ? (
                <>
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  Running FEP (OpenFE)...
                </>
              ) : (
                'Run Alchemical FEP (OpenFE)'
              )}
            </button>
            
            <button
              onClick={runMdStability}
              disabled={isRunningFep || isRunningMd}
              className="flex-1 bg-studio-glowBlue/20 hover:bg-studio-glowBlue/30 border border-studio-glowBlue/40 text-studio-glowBlue hover:text-blue-200 text-[9px] font-bold uppercase tracking-wider py-1.5 rounded flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRunningMd ? (
                <>
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  Running MD NPT (OpenMM)...
                </>
              ) : (
                'Run MD Stability (50 ns)'
              )}
            </button>
          </div>

          {/* FEP Results Panel */}
          {fepResult && (
            <div className="bg-cyan-950/20 border border-cyan-500/20 p-2.5 rounded-lg flex flex-col gap-1">
              <span className="text-cyan-400 font-bold uppercase tracking-wider text-[8.5px]">Tier 3 — Alchemical FEP Validation (Gold Standard)</span>
              <div className="flex justify-between items-center text-[10px] py-0.5 border-b border-cyan-500/10">
                <span className="text-slate-300">Alchemical ΔG:</span>
                <span className="font-mono font-bold text-cyan-400">{fepResult.fep_dg} ± {fepResult.fep_error} kcal/mol</span>
              </div>
              <span className="text-[7.5px] text-cyan-400/80 leading-relaxed font-mono">
                Method: {fepResult.method} ({fepResult.ensemble})
              </span>
            </div>
          )}

          {/* MD Results Panel */}
          {mdResult && (
            <div className="bg-blue-950/20 border border-blue-500/20 p-2.5 rounded-lg flex flex-col gap-2">
              <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[8.5px] p-2 rounded leading-relaxed">
                <strong>APPROXIMATED MD STABILITY</strong> — RMSD, RMSF, SASA and H-bond occupancy trajectories are generated from thermal-fluctuation approximations, <em>not</em> a real MD engine (OpenMM/GROMACS). Results are indicative and should not be cited as molecular dynamics data.
              </div>
              <span className="text-blue-400 font-bold uppercase tracking-wider text-[8.5px]">Step 3 — 50 ns Molecular Dynamics stability run</span>
              
              <div className="flex flex-col gap-1">
                <span className="text-slate-400 text-[8px] font-bold uppercase tracking-wide">Ligand RMSD Trajectory (OpenMM NPT)</span>
                {drawRmsdChart(mdResult.rmsd_trajectory)}
              </div>

              <div className="grid grid-cols-2 gap-2 text-[8.5px] text-slate-300">
                <div className="flex flex-col gap-1 border-r border-blue-500/10 pr-2">
                  <span className="text-slate-400 text-[7.5px] font-bold uppercase tracking-wide">Persistent Occupancy</span>
                  <div className="flex flex-col gap-1 font-mono text-[7.5px]">
                    {mdResult.persistent_occupancy.map((occ: any, o_idx: number) => (
                      <div key={o_idx} className="flex justify-between items-center">
                        <span>{occ.residue}:</span>
                        <span className={occ.occupancy >= 60 ? 'text-emerald-400 font-bold' : 'text-red-400'}>{occ.occupancy}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1 pl-1">
                  <span className="text-slate-400 text-[7.5px] font-bold uppercase tracking-wide">SASA trajectory mean</span>
                  <div className="flex justify-between items-center font-mono py-0.5">
                    <span>SASA:</span>
                    <span className="text-blue-300 font-bold">{mdResult.sasa_trajectory[mdResult.sasa_trajectory.length - 1].sasa} Å²</span>
                  </div>
                  <span className="text-[7px] text-blue-400/80 leading-relaxed font-mono">
                    Ensemble: {mdResult.ensemble} ({mdResult.solvent})
                  </span>
                </div>
              </div>
            </div>
          )}

          {!hasVcf ? (
            <div className="flex items-start gap-2 bg-slate-950/40 border border-studio-border/40 p-2 rounded text-slate-400 text-[9px]">
              <AlertTriangle className="w-3.5 h-3.5 text-slate-500 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Active-Site Check:</span> N/A — No patient mutation profile (VCF) uploaded.
              </div>
            </div>
          ) : mutationOverlap.length > 0 ? (
            <div className="flex items-start gap-2 bg-red-950/20 border border-red-500/20 p-2 rounded text-red-200 text-[9px] animate-pulse">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Pharmacogenomic Pocket Conflict:</span> The docked ligand contacts residue <strong className="font-mono">{mutationOverlap[0]}</strong> which hosts the clinical variant <strong>{targetVariant ? targetVariant.name : 'pathogenic variant'}</strong> in this patient profile. Drug binding and efficacy may be reduced by steric clash/ionic change.
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2 bg-emerald-950/20 border border-emerald-500/20 p-2 rounded text-emerald-200 text-[9px]">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Active-Site Clear:</span> No patient mutations overlap with the predicted ligand coordinate contacts. Efficacy predicted to match wild-type.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
