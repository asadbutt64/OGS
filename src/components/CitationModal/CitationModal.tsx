import React, { useState } from 'react';
import { useStore } from '../../store/store';
import { X, Copy, Check, Bookmark, FileText } from 'lucide-react';

export default function CitationModal() {
  const { isCitationModalOpen, setCitationModalOpen } = useStore();
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);

  if (!isCitationModalOpen) return null;

  const citations = [
    {
      label: "APA (7th Edition)",
      text: "Butt, A. (2026). OmniGene Studio: High-Throughput Spatial Transcriptomics and Signaling Pathway Analytics Suite (Version 1.0.0). University of Gujrat & University of Chester. https://github.com/asadbutt/omnigene-studio"
    },
    {
      label: "Harvard Style",
      text: "Butt, A., 2026. OmniGene Studio: High-Throughput Spatial Transcriptomics and Signaling Pathway Analytics Suite (Version 1.0.0). University of Gujrat & University of Chester. Available at: <https://github.com/asadbutt/omnigene-studio>."
    },
    {
      label: "Chicago Style",
      text: "Butt, Asad. \"OmniGene Studio: High-Throughput Spatial Transcriptomics and Signaling Pathway Analytics Suite (Version 1.0.0).\" University of Gujrat & University of Chester, 2026. https://github.com/asadbutt/omnigene-studio."
    },
    {
      label: "BibTeX",
      text: `@software{omnigene_studio_2026,\n  author = {Butt, Asad},\n  title = {OmniGene Studio: High-Throughput Spatial Transcriptomics and Signaling Pathway Analytics Suite},\n  year = {2026},\n  version = {1.0.0},\n  institution = {University of Gujrat \\& University of Chester},\n  url = {https://github.com/asadbutt/omnigene-studio}\n}`
    },
    {
      label: "RIS (EndNote / Zotero / Mendeley)",
      text: "TY  - COMP\nAU  - Butt, Asad\nTI  - OmniGene Studio: High-Throughput Spatial Transcriptomics and Signaling Pathway Analytics Suite\nPY  - 2026\nVR  - 1.0.0\nPB  - University of Gujrat & University of Chester\nUR  - https://github.com/asadbutt/omnigene-studio\nER  -"
    }
  ];

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedFormat(label);
    setTimeout(() => setCopiedFormat(null), 2000);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center z-50 p-4 select-none animate-in fade-in duration-150">
      
      {/* Modal Box */}
      <div className="bg-slate-900 border border-studio-border rounded-xl w-full max-w-xl shadow-2xl flex flex-col max-h-[80vh] overflow-hidden animate-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-studio-border bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <Bookmark className="w-5 h-5 text-studio-glowBlue animate-pulse" />
            <div>
              <h2 className="text-sm font-extrabold text-slate-100 tracking-tight">
                Cite OmniGene Studio
              </h2>
              <span className="text-[9px] text-studio-glowCyan font-mono uppercase tracking-wider font-bold">
                MPhil Biotechnology (UoG) & MSc Biomedical Sciences (UoC) Reference Suite
              </span>
            </div>
          </div>
          <button
            onClick={() => setCitationModalOpen(false)}
            className="text-studio-textMuted hover:text-slate-200 p-1 hover:bg-slate-800 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Citations List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-900/40 scrollbar-thin">
          <p className="text-[11px] text-slate-300 leading-normal mb-3">
            To cite this software in your biotechnology, transcriptomics, or pathway modeling research papers, please copy the reference details in your preferred bibliographic style below:
          </p>

          <div className="space-y-3.5">
            {citations.map((cite) => (
              <div 
                key={cite.label} 
                className="flex flex-col gap-1.5 p-3 rounded-lg bg-slate-950 border border-studio-border/50 hover:border-studio-glowBlue/30 transition-all group"
              >
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-bold text-studio-textMuted uppercase tracking-wider flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-studio-glowBlue" />
                    {cite.label}
                  </span>
                  <button
                    onClick={() => handleCopy(cite.text, cite.label)}
                    className="flex items-center gap-1 text-[9px] text-studio-glowCyan bg-studio-glowCyan/10 border border-studio-glowCyan/30 px-2 py-0.5 rounded hover:bg-studio-glowCyan/20 transition-all font-bold"
                  >
                    {copiedFormat === cite.label ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
                
                <pre className="text-[10px] text-slate-300 leading-relaxed bg-slate-900/60 p-2 rounded font-mono select-all overflow-x-auto border border-studio-border/20 whitespace-pre-wrap">
                  {cite.text}
                </pre>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-studio-border bg-slate-950/50 flex justify-between items-center text-[10px] text-studio-textMuted">
          <span>Developed under academic guidance and standards.</span>
          <button
            onClick={() => setCitationModalOpen(false)}
            className="px-4 py-1 rounded bg-studio-glowBlue text-white hover:bg-blue-600 font-semibold transition-all text-xs shadow-glow"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
