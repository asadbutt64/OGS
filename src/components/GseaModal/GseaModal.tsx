import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../../store/store';
import { X, AlertCircle, Cpu, CheckCircle2, ListFilter, Upload } from 'lucide-react';

export default function GseaModal() {
  const {
    isGseaModalOpen,
    setGseaModalOpen,
    mutatedGenes,
    setMutatedGenes,
    gseaResults,
    fetchGseaResults
  } = useStore();

  const [inputVal, setInputVal] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Synchronize input value with store's mutated genes
  useEffect(() => {
    if (isGseaModalOpen) {
      setInputVal(mutatedGenes.join(', '));
      fetchGseaResults();
    }
  }, [isGseaModalOpen, mutatedGenes]);

  if (!isGseaModalOpen) return null;

  const handleManualRun = (e: React.FormEvent) => {
    e.preventDefault();
    const genes = inputVal
      .split(',')
      .map((g) => g.trim().toUpperCase())
      .filter((g) => g.length > 0);
    setMutatedGenes(genes);
  };

  const handleVcfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('http://127.0.0.1:8000/api/upload-vcf', {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        if (!data.mutated || data.mutated.length === 0) {
          // Empty or unresolved VCF — do NOT call setMutatedGenes, which would
          // trigger a GSEA run and surface phantom default pathway warnings.
          alert(
            `VCF "${file.name}" parsed successfully but no recognisable gene variants were found.\n\n` +
            `The file may be empty, contain only header lines, or contain variants that do not map to ` +
            `any gene in the reference knowledge base.\n\nNo mutation profile has been overlaid.`
          );
          e.target.value = '';
          return;
        }
        setMutatedGenes(data.mutated);
        setInputVal(data.mutated.join(', '));
        alert(`Successfully parsed VCF "${file.name}". Overlaid ${data.mutated.length} variant(s): ${data.mutated.slice(0, 8).join(', ')}${data.mutated.length > 8 ? '…' : ''}`);
      } else {
        alert('Failed to parse VCF file.');
      }
    } catch (err) {
      console.error('Error uploading VCF:', err);
      alert('Failed to connect to backend for VCF parsing.');
    }
  };

  const getSignificanceBadge = (p: number) => {
    if (p < 0.01) {
      return (
        <span className="bg-red-500/15 text-red-400 border border-red-500/30 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider animate-pulse">
          Highly Significant
        </span>
      );
    } else if (p < 0.05) {
      return (
        <span className="bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
          Significant
        </span>
      );
    } else {
      return (
        <span className="bg-slate-800 text-slate-400 text-[9px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider">
          Not Significant
        </span>
      );
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4 select-none">
      
      {/* Modal Dialog Box */}
      <div className="bg-slate-900 border border-studio-border rounded-xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-studio-border bg-slate-950/50">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-studio-glowCyan animate-spin-slow" />
            <div>
              <h2 className="text-base font-extrabold text-slate-100 tracking-tight">Hypergeometric GSEA Engine</h2>
              <p className="text-[10px] text-studio-textMuted tracking-wide uppercase font-semibold">Statistical Pathway Over-Representation analysis</p>
            </div>
          </div>
          <button
            onClick={() => setGseaModalOpen(false)}
            className="text-studio-textMuted hover:text-slate-200 p-1 hover:bg-slate-800 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Section 1: Mutation Input Panel */}
          <div className="glass-panel p-4 rounded-lg border border-studio-border/50 bg-slate-950/20">
            <form onSubmit={handleManualRun} className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-[10px] text-studio-textMuted font-bold uppercase tracking-wide">
                  Active Mutation Profile (HGNC symbols)
                </label>
                <span className="text-[9px] text-studio-glowBlue font-mono">
                  {mutatedGenes.length} genes overlayed
                </span>
              </div>
              <div className="flex gap-3">
                <input
                  type="text"
                  className="flex-1 bg-slate-950 border border-studio-border rounded-lg px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-studio-glowBlue placeholder-slate-700"
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  placeholder="Enter comma-separated mutated genes, e.g. AKT1, EGFR, TP53"
                />
                <button
                  type="submit"
                  className="bg-studio-glowBlue text-white hover:bg-blue-600 px-4 py-2 rounded-lg text-xs font-semibold shadow-glow transition-all flex items-center gap-1.5"
                >
                  <ListFilter className="w-3.5 h-3.5" />
                  <span>Run Analysis</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-slate-800 hover:bg-slate-700 border border-studio-border text-slate-200 px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5"
                  title="Upload Variant Call Format (.vcf) file to extract and analyze mutation lists"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload VCF</span>
                </button>
                <input
                  type="file"
                  accept=".vcf"
                  ref={fileInputRef}
                  onChange={handleVcfUpload}
                  className="hidden"
                />
              </div>
              <p className="text-[9px] text-studio-textMuted leading-relaxed">
                Tip: You can manually edit the genes above to test hypothetical mutations, or load a VCF file in the top panel to map your clinical variant profiles.
              </p>
            </form>
          </div>

          {/* Section 2: GSEA Results Table */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Ranked Pathway Enrichment</h3>
            
            {gseaResults === null ? (
              <div className="text-center py-12 border border-dashed border-studio-border rounded-lg text-studio-textMuted text-xs">
                Run analysis or input mutated genes above to calculate pathway enrichment.
              </div>
            ) : gseaResults.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-studio-border rounded-lg text-studio-textMuted text-xs flex flex-col items-center justify-center">
                <AlertCircle className="w-6 h-6 mb-2 text-amber-500 opacity-60" />
                <span>No pathway mutations detected.</span>
                <span className="text-[10px] text-studio-textMuted/60 mt-1">
                  Ensure the entered gene symbols match the pathway signaling nodes (e.g. AKT1, EGFR, TNF, TP53, IL6).
                </span>
              </div>
            ) : (
              <div className="border border-studio-border rounded-lg overflow-hidden bg-slate-950/40">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-950 text-studio-textMuted text-[10px] uppercase font-bold tracking-wider border-b border-studio-border">
                      <th className="px-4 py-3">Pathway Signaling Cascade</th>
                      <th className="px-4 py-3 text-center">Mutated Overlap</th>
                      <th className="px-4 py-3">Overlapping Genes</th>
                      <th className="px-4 py-3 text-right">p-value</th>
                      <th className="px-4 py-3 text-right">Significance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-studio-border/30">
                    {gseaResults.map((res: any, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/10 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-100">{res.pathway_name}</td>
                        <td className="px-4 py-3 text-center font-mono text-slate-200">
                          {res.k} / {res.K}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {res.overlap.map((g: string) => (
                              <span key={g} className="bg-slate-800 text-[10px] px-1.5 py-0.5 rounded text-slate-300 font-mono">
                                {g}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-medium text-studio-glowCyan">
                          {res.p_value.toFixed(6)}
                        </td>
                        <td className="px-4 py-3 text-right">{getSignificanceBadge(res.p_value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-studio-border bg-slate-950/50 flex justify-end">
          <button
            onClick={() => setGseaModalOpen(false)}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg text-xs font-semibold transition-colors"
          >
            Close Dashboard
          </button>
        </div>

      </div>
      
    </div>
  );
}
