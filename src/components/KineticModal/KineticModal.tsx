import React, { useState, useEffect } from 'react';
import { useStore } from '../../store/store';
import { X, Play, ShieldAlert, Sparkles, Activity, RefreshCw } from 'lucide-react';
import Plot from 'react-plotly.js';

const API_BASE = 'http://127.0.0.1:8000/api';

export default function KineticModal() {
  const store = useStore();
  const {
    isKineticModalOpen,
    setKineticModalOpen,
    selectedGene,
    pathwayData,
    mutatedGenes
  } = store;

  const [stimulus, setStimulus] = useState(10.0);
  const [duration, setDuration] = useState(120);
  const [selectedKOs, setSelectedKOs] = useState<string[]>([]);
  const [hasMutation, setHasMutation] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // Results
  const [simResults, setSimResults] = useState<any>(store.kineticResults);

  // Auto-detect if target gene is mutated in patient profile
  useEffect(() => {
    if (isKineticModalOpen) {
      setHasMutation(mutatedGenes.includes(selectedGene.toUpperCase()));
      if (store.kineticResults) {
        setSimResults(store.kineticResults);
      }
    }
  }, [isKineticModalOpen, selectedGene, mutatedGenes, store.kineticResults]);

  if (!isKineticModalOpen) return null;

  const runSimulation = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/kinetic-simulation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gene: selectedGene,
          stimulus: stimulus,
          duration: duration,
          knockout_nodes: selectedKOs,
          has_mutation: hasMutation
        })
      });

      if (res.ok) {
        const data = await res.json();
        setSimResults(data);
        store.setKineticResults(data);
      }
    } catch (e) {
      console.error('Kinetic simulation failed:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKOToggle = (nodeId: string) => {
    setSelectedKOs(prev => 
      prev.includes(nodeId) ? prev.filter(id => id !== nodeId) : [...prev, nodeId]
    );
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4 select-none">
      
      {/* Modal Wrapper */}
      <div className="glass-panel border border-studio-border/80 w-full max-w-4xl h-[85vh] rounded-2xl flex flex-col overflow-hidden shadow-2xl">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-studio-border bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <Activity className="w-5 h-5 text-studio-glowBlue animate-pulse" />
            <div>
              <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider">Pathway Flux Kinetic Simulator</h2>
              <p className="text-[10px] text-studio-textMuted">ODE system modeling signal propagation rates and nuclear translocation fluxes.</p>
            </div>
          </div>
          <button 
            onClick={() => setKineticModalOpen(false)}
            className="p-1 rounded-lg hover:bg-slate-800 text-studio-textMuted hover:text-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Layout */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          
          {/* Left panel: Controls */}
          <div className="w-full md:w-80 border-r border-studio-border bg-slate-900/20 p-5 flex flex-col gap-4 overflow-y-auto">
            
            {/* Stimulus slider */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-slate-300 font-bold uppercase tracking-wide">Extracellular Ligand Dose</span>
                <span className="font-mono text-studio-glowBlue font-bold">{stimulus.toFixed(1)} ng/ml</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="50" 
                step="0.5" 
                value={stimulus} 
                onChange={(e) => setStimulus(parseFloat(e.target.value))}
                className="w-full h-1 bg-slate-850 rounded appearance-none accent-studio-glowBlue cursor-pointer"
              />
            </div>

            {/* Time course slider */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-slate-300 font-bold uppercase tracking-wide">Simulation Duration</span>
                <span className="font-mono text-studio-glowCyan font-bold">{duration} min</span>
              </div>
              <input 
                type="range" 
                min="30" 
                max="180" 
                step="10" 
                value={duration} 
                onChange={(e) => setDuration(parseInt(e.target.value))}
                className="w-full h-1 bg-slate-855 rounded appearance-none accent-studio-glowCyan cursor-pointer"
              />
            </div>

            {/* Mutational active status */}
            <div className="flex flex-col gap-1 bg-slate-950/40 border border-studio-border/60 p-3 rounded-lg">
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-slate-200 font-semibold flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  Hyper-active Mutation
                </span>
                <input 
                  type="checkbox" 
                  checked={hasMutation} 
                  onChange={(e) => setHasMutation(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-studio-glowBlue focus:ring-0 cursor-pointer"
                />
              </div>
              <p className="text-[8.5px] text-studio-textMuted mt-1">
                Simulates slower kinase decay rates, yielding sustained cytoplasmic phosphorylation and nuclear accumulation.
              </p>
            </div>

            {/* Node Knockouts checklist */}
            <div className="flex-1 flex flex-col gap-1.5">
              <span className="text-[10px] text-slate-300 font-bold uppercase tracking-wide">Inhibitors / Node Knockouts</span>
              <div className="flex-1 border border-studio-border/60 bg-slate-950/40 rounded-lg p-2.5 overflow-y-auto flex flex-col gap-1.5 max-h-48 md:max-h-none">
                {pathwayData?.nodes && pathwayData.nodes.length > 0 ? (
                  pathwayData.nodes.map((node: any) => (
                    <label key={node.id} className="flex items-center gap-2 text-[10px] text-slate-300 hover:text-slate-100 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={selectedKOs.includes(node.id)}
                        onChange={() => handleKOToggle(node.id)}
                        className="rounded border-slate-700 bg-slate-900 text-studio-glowBlue focus:ring-0"
                      />
                      <span className="font-medium">{node.name}</span>
                    </label>
                  ))
                ) : (
                  <span className="text-[9px] text-studio-textMuted italic">No pathway loaded.</span>
                )}
              </div>
            </div>

            {/* Solver button */}
            <button
              onClick={runSimulation}
              disabled={isLoading || !pathwayData || (store.kineticResults && !!store.kineticResults.error)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-studio-glowBlue text-white font-bold text-xs shadow-glow hover:bg-studio-glowBlue/90 disabled:opacity-50 transition-all uppercase tracking-wider"
            >
              {isLoading ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current" />
              )}
              <span>Run ODE Simulation</span>
            </button>

          </div>

          {/* Right panel: Plots & Results */}
          <div className="flex-1 bg-slate-950/40 p-6 flex flex-col min-w-0">
            
            {store.kineticResults && store.kineticResults.error ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-studio-textMuted border border-dashed border-red-500/30 bg-red-950/10 rounded-2xl p-6">
                <ShieldAlert className="w-10 h-10 text-red-500 mb-3" />
                <h3 className="text-xs font-bold text-red-400 uppercase tracking-wide">Simulation Unavailable</h3>
                <p className="text-[10px] text-red-300 mt-1 max-w-sm">
                  {store.kineticResults.error}
                </p>
              </div>
            ) : simResults ? (
              <div className="flex-1 flex flex-col min-h-0">
                
                {/* Result summary banner */}
                <div className="flex justify-between items-start mb-4 border-b border-studio-border/30 pb-3">
                  <div>
                    <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wide">Simulation Results</h3>
                    <p className="text-[9.5px] text-studio-textMuted mt-0.5">
                      Target Gene: <strong className="text-slate-300 font-mono">{selectedGene}</strong> | Time course solved via Euler method.
                    </p>
                  </div>
                  {hasMutation && (
                    <div className="flex items-center gap-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded text-[9.5px] font-bold">
                      <ShieldAlert className="w-3.5 h-3.5" />
                      Oncogenic Hyper-activation Active
                    </div>
                  )}
                </div>

                {/* Plotly line chart */}
                <div className="flex-1 min-h-0 border border-studio-border rounded-xl bg-slate-900/30 p-2 relative">
                  {(() => {
                    const isIronPathway = simResults.pathway_type?.includes('BMP') || simResults.pathway_type?.includes('SMAD');
                    const rName = isIronPathway ? 'Active BMP Receptor (R)' : 'Receptor Active (TNFR1)';
                    const kName = isIronPathway ? 'Cytoplasmic p-SMAD (S)' : 'Kinase Active (IKK)';
                    const iName = isIronPathway ? 'Nuclear SMAD4 (Sn)' : 'Inhibitor (IkB-alpha)';
                    const nName = isIronPathway ? 'Hepcidin mRNA (HAMP)' : 'Nuclear Effector (NF-kB)';
                    
                    return (
                      <Plot
                        data={[
                          {
                            x: simResults.time,
                            y: simResults.receptor,
                            mode: 'lines',
                            name: rName,
                            line: { color: '#06B6D4', width: 2 }
                          },
                          {
                            x: simResults.time,
                            y: simResults.kinase,
                            mode: 'lines',
                            name: kName,
                            line: { color: '#8B5CF6', width: 2 }
                          },
                          {
                            x: simResults.time,
                            y: simResults.inhibitor,
                            mode: 'lines',
                            name: iName,
                            line: { color: '#EF4444', width: 2 }
                          },
                          {
                            x: simResults.time,
                            y: simResults.nf_nuc,
                            mode: 'lines',
                            name: nName,
                            line: { color: '#10B981', width: 3 }
                          }
                        ]}
                        layout={{
                          paper_bgcolor: 'rgba(0,0,0,0)',
                          plot_bgcolor: 'rgba(0,0,0,0)',
                          autosize: true,
                          font: {
                            color: '#94A3B8',
                            family: 'Inter, sans-serif',
                            size: 9
                          },
                          margin: { l: 45, r: 15, t: 15, b: 30 },
                          xaxis: {
                            title: { text: 'Time (minutes)', font: { size: 9, color: '#64748B' } },
                            gridcolor: 'rgba(255, 255, 255, 0.03)',
                            zeroline: false
                          },
                          yaxis: {
                            title: { text: 'Relative Concentration', font: { size: 9, color: '#64748B' } },
                            gridcolor: 'rgba(255, 255, 255, 0.03)',
                            zeroline: false
                          },
                          legend: {
                            font: { size: 8, color: '#94A3B8' },
                            orientation: 'h',
                            x: 0,
                            y: -0.2
                          },
                          hoverlabel: {
                            bgcolor: '#0B0F19',
                            bordercolor: '#2A3142',
                            font: { color: '#F8FAFC', family: 'Fira Code, monospace', size: 10 }
                          }}
                        }
                        config={{
                          responsive: true,
                          displayModeBar: false
                        }}
                        className="w-full h-full"
                      />
                    );
                  })()}
                </div>

                {/* Analytical conclusions */}
                <div className="mt-4 p-3 bg-slate-900/60 border border-studio-border/60 rounded-xl text-[9px] text-slate-300 leading-relaxed overflow-y-auto max-h-48 scrollbar-thin">
                  <span className="font-bold text-slate-100 uppercase tracking-wider block mb-1">Pharmacokinetic Insights</span>
                  {(() => {
                    const isIronPathway = simResults.pathway_type?.includes('BMP') || simResults.pathway_type?.includes('SMAD');
                    if (selectedKOs.length > 0) {
                      return (
                        <p>
                          Knockout of <strong className="text-slate-200">{selectedKOs.join(', ')}</strong> breaks signaling transmission. Activation levels are reduced to baseline, preventing phosphorylation-mediated R-SMAD/IKK degradation or transcription. Target gene mRNA levels remain suppressed at baseline levels, validating the therapeutic node target.
                        </p>
                      );
                    }
                    if (isIronPathway) {
                      return (
                        <p>
                          BMP6 ligand binding activates receptors rapidly within 15 min. Phosphorylated R-SMADs translocate into the nucleus together with SMAD4, peaking around 30 minutes, which transcriptionally stimulates hepcidin expression peaking at 60 minutes. Knockout or deficiency disrupts this iron-regulation pathway.
                        </p>
                      );
                    }
                    if (hasMutation) {
                      return (
                        <p>
                          Hyper-activating mutation in the cascade delays target kinase inactivation. Nuclear translocation rates show sustained high amplitudes compared to the transient pulse of normal cells. This represents chronic transcription factor binding, which could drive uncontrolled cellular growth in neoplastic models.
                        </p>
                      );
                    }
                    return (
                      <p>
                        Normal stimulus curves show receptor binding peaking around 15 minutes, activating signaling kinases. Degraded inhibitor molecules allow a transient nuclear translocation pulse that peaks at 30 minutes, triggering feedback loop synthesis. This represents a normal, self-limiting biological response.
                      </p>
                    );
                  })()}
                  
                  <p className="text-[8px] text-slate-400 mt-2 font-mono italic">
                    *Simulation rate constants (k_decay, k_rec_act, etc.) are hand-calibrated for dynamic stability and are illustrative, not derived from empirical kinetic measurements.*
                  </p>

                  {simResults.pathway_type?.includes('TNF') && (
                    <p className="text-[8.5px] text-slate-500 mt-1.5 leading-relaxed border-t border-studio-border/30 pt-1.5 font-sans">
                      <strong>TNF branch clarification:</strong> The topology diagram in Section 2 represents the apoptotic downstream branch (TRADD→FADD→Caspase-8→Caspase-3) of TNFR1 signaling, while this ODE simulation models the pro-survival NF-κB transcription branch (RIPK1→MAP3K7→CHUK/IKBKB→NFKBIA→RELA/NFKB1).
                    </p>
                  )}
                </div>

              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-studio-textMuted border border-dashed border-studio-border rounded-2xl p-6">
                <Activity className="w-10 h-10 text-studio-textMuted/40 mb-3 animate-pulse" />
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wide">No Simulation History</h3>
                <p className="text-[10px] text-studio-textMuted mt-1 max-w-sm">
                  Configure the parameters in the left panel and click <strong>Run ODE Simulation</strong> to solve signaling cascade rate dynamics.
                </p>
              </div>
            )}

          </div>

        </div>

      </div>

    </div>
  );
}
