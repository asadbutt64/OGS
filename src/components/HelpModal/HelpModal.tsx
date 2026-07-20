import React, { useState } from 'react';
import { useStore } from '../../store/store';
import { X, ChevronLeft, ChevronRight, HelpCircle, BookOpen, BarChart2, Cpu, Zap } from 'lucide-react';

export default function HelpModal() {
  const { isHelpModalOpen, setHelpModalOpen } = useStore();
  const [currentSlide, setCurrentSlide] = useState(0);

  if (!isHelpModalOpen) return null;

  const slides = [
    {
      title: "OmniGene Studio Layout Guide",
      icon: <HelpCircle className="w-8 h-8 text-studio-glowBlue" />,
      content: (
        <div className="space-y-4 text-xs text-slate-300">
          <p>
            Welcome to <strong>OmniGene Studio</strong>! The application interface is structured in a **4-Zone Grid** designed for high-throughput spatial transcriptomics and pathway analysis:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong className="text-slate-100">Zone 1: Top Ribbon (Controls)</strong> — Autocomplete gene search, linear/log2 scale toggles, FDR filters, VCF mutation overlays, and export menus.
            </li>
            <li>
              <strong className="text-slate-100">Zone 2: Left Panel (Anatomy Mapper)</strong> — Vector-based anatomical 2D human model coloring organs based on their relative nTPM median expression levels.
            </li>
            <li>
              <strong className="text-slate-100">Zone 3: Bottom Panel (Expression & Analytics)</strong> — Spatial bar charts, OLS co-expression scatter plots, and custom multi-gene heatmap matrices.
            </li>
            <li>
              <strong className="text-slate-100">Zone 4: Right Panel (Pathway Canvas)</strong> — Custom React Flow topology graphs mapping protein signaling cascades, live PubMed citations, 3D structures, and CRISPR design tools.
            </li>
          </ul>
        </div>
      )
    },
    {
      title: "Hypergeometric GSEA (Gene Set Enrichment Analysis)",
      icon: <Cpu className="w-8 h-8 text-studio-glowCyan animate-pulse" />,
      content: (
        <div className="space-y-4 text-xs text-slate-300">
          <p>
            The **Hypergeometric Over-Representation Test** is used to determine whether a subset of mutated genes (e.g. from an uploaded VCF file) is statistically enriched in a specific biological pathway:
          </p>
          <div className="bg-slate-950 p-3 rounded-lg border border-studio-border/50 text-center py-4 my-2">
            <p className="text-[14px] font-mono text-studio-glowCyan">
              P(X &ge; k) = &sum;<sub>i=k</sub><sup>min(n, K)</sup> [ C(K, i) &times; C(N-K, n-i) ] / C(N, n)
            </p>
          </div>
          <ul className="list-disc pl-5 space-y-1.5">
            <li><strong className="text-slate-100">N (120+)</strong>: Total unique gene population in our background signaling network database.</li>
            <li><strong className="text-slate-100">K</strong>: Total number of genes belonging to the target Reactome pathway.</li>
            <li><strong className="text-slate-100">n</strong>: Total number of mutated genes identified in your sample profile.</li>
            <li><strong className="text-slate-100">k</strong>: Count of overlapping mutated genes mapped directly onto this pathway.</li>
          </ul>
          <p className="italic text-[10px] text-studio-textMuted">
            * p-values &lt; 0.05 are flagged as **Significant**, and p-values &lt; 0.01 as **Highly Significant** (indicated by red pulsing badges).
          </p>
        </div>
      )
    },
    {
      title: "Pearson Co-Expression & OLS Regression",
      icon: <BarChart2 className="w-8 h-8 text-studio-glowBlue" />,
      content: (
        <div className="space-y-4 text-xs text-slate-300">
          <p>
            The co-expression panel aligns spatial median tissue expressions for two genes (e.g. Gene A vs Gene B) to analyze biological coordination:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong className="text-slate-100">Pearson Correlation (r)</strong>: Measures the linear relationship between expressions. Values range from -1 (anti-correlated) to +1 (perfectly synchronized).
            </li>
            <li>
              <strong className="text-slate-100">Ordinary Least Squares (OLS)</strong>: Solves the linear equation:
              <span className="block font-mono text-center text-studio-glowBlue my-1 bg-slate-950/50 p-1.5 rounded">y = mx + c</span>
              where <span className="text-slate-100 font-mono">m</span> represents the slope coefficient (rate of expression change) and <span className="text-slate-100 font-mono">c</span> is the y-intercept.
            </li>
          </ul>
          <p>
            High co-expression levels indicate candidate partner subunits or co-regulated feedback networks (e.g. AKT1 and MTOR).
          </p>
        </div>
      )
    },
    {
      title: "CRISPR SpCas9 Exon Target Guide Design",
      icon: <BookOpen className="w-8 h-8 text-emerald-400" />,
      content: (
        <div className="space-y-4 text-xs text-slate-300">
          <p>
            The **CRISPR Exon Designer** assists in gene-editing target sequences by scanning target genes for SpCas9 PAM sites:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong className="text-slate-100">PAM Motif (Protospacer Adjacent Motif)</strong>: SpCas9 requires the motif sequence <strong className="text-amber-500 font-mono">5'-NGG-3'</strong> immediately adjacent to the 3' end of the 20nt target guide sequence.
            </li>
            <li>
              <strong className="text-slate-100">GC Content</strong>: Target sequences with GC% between <strong className="text-emerald-400">40% and 60%</strong> are preferred. Low GC reduces binding strength; high GC can cause off-target binding.
            </li>
            <li>
              <strong className="text-slate-100">Efficiency Score</strong>: Heuristically calculated based on GC content, exon position, and predicted off-target mismatch parameters.
            </li>
          </ul>
        </div>
      )
    },
    {
      title: "Databases, Session Backups, & Exports",
      icon: <Zap className="w-8 h-8 text-amber-400" />,
      content: (
        <div className="space-y-4 text-xs text-slate-300">
          <p>
            OmniGene Studio provides advanced scientific export and linking tools:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong className="text-slate-100">Databases Menu</strong>: Connects active genes directly to online browsers like NCBI Gene, Ensembl, UniProt, Human Protein Atlas, and STRING DB.
            </li>
            <li>
              <strong className="text-slate-100">Export Vectors (.svg) & PNGs</strong>: Download publication-grade vector SVGs of the anatomy mapper or high-resolution PNG copies of the pathway canvas and Plotly charts.
            </li>
            <li>
              <strong className="text-slate-100">Workspace Sessions (.omni)</strong>: Save your active thresholds, filters, search parameters, and gene states, and load them back later.
            </li>
          </ul>
        </div>
      )
    }
  ];

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    }
  };

  const handleBack = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center z-50 p-4 select-none">
      
      {/* Modal Card */}
      <div className="bg-slate-900 border border-studio-border rounded-xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-studio-border bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            {slides[currentSlide].icon}
            <div>
              <h2 className="text-base font-extrabold text-slate-100 tracking-tight">
                {slides[currentSlide].title}
              </h2>
              <span className="text-[9px] text-studio-glowBlue font-mono uppercase tracking-wider font-bold">
                Slide {currentSlide + 1} of {slides.length} — User Manual & Scientific Reference
              </span>
            </div>
          </div>
          <button
            onClick={() => setHelpModalOpen(false)}
            className="text-studio-textMuted hover:text-slate-200 p-1 hover:bg-slate-800 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Slide Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-900/40">
          {slides[currentSlide].content}
        </div>

        {/* Footer Navigation */}
        <div className="px-6 py-4 border-t border-studio-border bg-slate-950/50 flex justify-between items-center">
          <button
            onClick={handleBack}
            disabled={currentSlide === 0}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${currentSlide === 0 ? 'border-studio-border/30 text-studio-textMuted/40 cursor-not-allowed' : 'border-studio-border text-slate-200 hover:bg-slate-800'}`}
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Back</span>
          </button>

          <div className="flex gap-1.5">
            {slides.map((_, idx) => (
              <span
                key={idx}
                className={`w-2 h-2 rounded-full transition-all ${currentSlide === idx ? 'bg-studio-glowBlue scale-110 shadow-glow' : 'bg-slate-800'}`}
              />
            ))}
          </div>

          {currentSlide < slides.length - 1 ? (
            <button
              onClick={handleNext}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-studio-glowBlue text-white hover:bg-blue-600 shadow-glow transition-all"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => setHelpModalOpen(false)}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 text-slate-950 hover:bg-emerald-400 shadow-glow transition-all"
            >
              <span>Got it!</span>
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
