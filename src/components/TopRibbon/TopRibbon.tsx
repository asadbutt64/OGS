import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../../store/store';
import { Search, Sliders, Download, Upload, RefreshCw, AlertCircle } from 'lucide-react';
import { exportPdfReport } from '../../utils/ReportExporter';

export default function TopRibbon() {
  const {
    selectedGene,
    expressionThreshold,
    fdrThreshold,
    scaleType,
    searchResults,
    searchQuery,
    isLoading,
    error,
    setExpressionThreshold,
    setFdrThreshold,
    setScaleType,
    setSearchQuery,
    fetchSearchResults,
    fetchGeneData,
    setMutatedGenes,
    expressionData,
    loadSession,
    setActiveTab,
    setGseaModalOpen,
    setHelpModalOpen,
    setCitationModalOpen,
    setPrintingReportOpen,
    setKineticModalOpen,
    fetchGseaResults,
    triggerAnatomyExport,
    triggerPathwayExport,
    triggerExpressionExport,
    dbVersion,
    pathwayData,
    setSelectedNode
  } = useStore();

  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sessionInputRef = useRef<HTMLInputElement>(null);

  // Handle autocomplete search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSearchResults(searchQuery);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery, fetchSearchResults]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchSubmit = (gene: string) => {
    setSearchQuery(gene);
    setShowDropdown(false);
    fetchGeneData(gene);
  };

  const handleVcfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so the same file can be re-uploaded after clearing
    e.target.value = '';

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
          // Empty or unresolved VCF — do NOT call setMutatedGenes (which would
          // trigger a GSEA run and potentially surface phantom default warnings).
          alert(
            `VCF "${file.name}" parsed successfully but no recognisable gene variants were found.\n\n` +
            `The file may be empty, contain only header lines, or variants that do not map to ` +
            `any gene in the reference knowledge base.\n\n` +
            `No pathway mutations have been overlaid.`
          );
          return;
        }
        setMutatedGenes(data.mutated);
        alert(`VCF "${file.name}" parsed successfully.\nFlagged ${data.mutated.length} variant(s): ${data.mutated.slice(0, 8).join(', ')}${data.mutated.length > 8 ? '…' : ''}`);
      } else {
        alert('Failed to parse VCF file. The server returned an error.');
      }
    } catch (err) {
      console.error('Error uploading VCF:', err);
      alert('Failed to connect to backend for VCF parsing.');
    }
  };

  const handleExportCSV = () => {
    if (expressionData.length === 0) return;
    const headers = 'Gene,Tissue,nTPM,FDR\n';
    const rows = expressionData
      .map(row => `${row.gene},"${row.tissue}",${row.nTPM},${row.FDR}`)
      .join('\n');
    
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedGene}_expression_matrix.csv`;
    a.click();
  };

  const handleExportSession = () => {
    const state = useStore.getState();
    const session = {
      selectedGene: state.selectedGene,
      expressionThreshold: state.expressionThreshold,
      fdrThreshold: state.fdrThreshold,
      scaleType: state.scaleType,
      activeTissueFilter: state.activeTissueFilter,
      mutatedGenes: state.mutatedGenes,
      expressionData: state.expressionData,
      pathwayData: state.pathwayData,
    };
    
    const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedGene}_workspace.omni`;
    a.click();
  };

  const handleExportPdf = () => {
    setPrintingReportOpen(true);
  };

  const handleOpenDocking = () => {
    if (pathwayData && pathwayData.nodes) {
      // Find the node matching the selectedGene
      const node = pathwayData.nodes.find(n => n.id.toUpperCase() === selectedGene.toUpperCase());
      if (node) {
        setSelectedNode(node);
      } else {
        // Fallback: select the first node
        setSelectedNode(pathwayData.nodes[0]);
      }
      alert(`Selected protein target ${node ? node.id : pathwayData.nodes[0].id}. You can run molecular docking using the 3D viewer & ligand finder in the details sidebar.`);
    } else {
      alert("Please search for a gene first to load the pathway topology map.");
    }
  };

  const handleImportSession = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const session = JSON.parse(event.target?.result as string);
        loadSession(session);
        alert('Session workspace successfully restored.');
      } catch (err) {
        alert('Failed to parse workspace state. Ensure it is a valid .omni file.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <header className="glass-panel w-full px-6 pt-2 pb-4 flex flex-col gap-4 border-b border-studio-border relative z-50">
      
      {/* Top Menu Ribbon Bar (Phase 1 & 2) */}
      <div className="flex items-center gap-6 border-b border-studio-border/30 pb-2 text-[11px] font-medium text-studio-textMuted select-none">
        {/* File Dropdown */}
        <div className="relative group cursor-pointer hover:text-slate-100 transition-colors py-1">
          File
          <div className="absolute top-full left-0 hidden group-hover:block bg-slate-900 border border-studio-border rounded-lg py-1 shadow-2xl min-w-[160px] z-50 backdrop-blur-md">
            <button className="w-full text-left px-4 py-2 hover:bg-studio-glowBlue/20 text-slate-200 transition-colors" onClick={handleExportSession}>Save Workspace (.omni)</button>
            <button className="w-full text-left px-4 py-2 hover:bg-studio-glowBlue/20 text-slate-200 transition-colors" onClick={() => sessionInputRef.current?.click()}>Load Workspace (.omni)</button>
            <button className="w-full text-left px-4 py-2 hover:bg-studio-glowBlue/20 text-slate-200 transition-colors border-t border-studio-border/50" onClick={handleExportCSV}>Export CSV Matrix</button>
          </div>
        </div>

        {/* Analysis Dropdown */}
        <div className="relative group cursor-pointer hover:text-slate-100 transition-colors py-1">
          Analysis
          <div className="absolute top-full left-0 hidden group-hover:block bg-slate-900 border border-studio-border rounded-lg py-1 shadow-2xl min-w-[200px] z-50 backdrop-blur-md">
            <button className="w-full text-left px-4 py-2 hover:bg-studio-glowBlue/20 text-slate-200 transition-colors" onClick={() => { fetchGseaResults(); setGseaModalOpen(true); }}>Hypergeometric GSEA</button>
            <button className="w-full text-left px-4 py-2 hover:bg-studio-glowBlue/20 text-slate-200 transition-colors" onClick={() => setActiveTab('coexpression')}>Co-Expression Correlation</button>
            <button className="w-full text-left px-4 py-2 hover:bg-studio-glowBlue/20 text-slate-200 transition-colors border-t border-studio-border/30" onClick={() => setKineticModalOpen(true)}>Pathway Kinetic Modeling</button>
            <button className="w-full text-left px-4 py-2 hover:bg-studio-glowBlue/20 text-slate-200 transition-colors border-t border-studio-border/30 font-semibold" onClick={handleOpenDocking}>Molecular Docking (3D)</button>
          </div>
        </div>

        {/* Exports Dropdown (Phase 6) */}
        <div className="relative group cursor-pointer hover:text-slate-100 transition-colors py-1">
          Exports
          <div className="absolute top-full left-0 hidden group-hover:block bg-slate-900 border border-studio-border rounded-lg py-1 shadow-2xl min-w-[200px] z-50 backdrop-blur-md">
            <button className="w-full text-left px-4 py-2 hover:bg-studio-glowBlue/20 text-slate-200 transition-colors" onClick={triggerAnatomyExport}>Export Anatomy Map (SVG)</button>
            <button className="w-full text-left px-4 py-2 hover:bg-studio-glowBlue/20 text-slate-200 transition-colors" onClick={triggerPathwayExport}>Export Pathway Map (PNG)</button>
            <button className="w-full text-left px-4 py-2 hover:bg-studio-glowBlue/20 text-slate-200 transition-colors border-t border-studio-border/50" onClick={triggerExpressionExport}>Export Expression Plot (PNG)</button>
            <button className="w-full text-left px-4 py-2 hover:bg-studio-glowBlue/20 text-slate-200 transition-colors border-t border-studio-border/50 font-semibold" onClick={handleExportPdf}>Export PDF Research Report</button>
          </div>
        </div>

        {/* Databases Cross-References Dropdown */}
        <div className="relative group cursor-pointer hover:text-slate-100 transition-colors py-1">
          Databases
          <div className="absolute top-full left-0 hidden group-hover:block bg-slate-900 border border-studio-border rounded-lg py-1 shadow-2xl min-w-[240px] z-50 backdrop-blur-md">
            <div className="px-4 py-1.5 text-[9px] text-studio-textMuted uppercase font-bold tracking-wider border-b border-studio-border/30">Cross-References ({selectedGene})</div>
            <a href={`https://www.ncbi.nlm.nih.gov/gene/?term=${selectedGene}`} target="_blank" rel="noopener noreferrer" className="block px-4 py-2 hover:bg-studio-glowBlue/20 text-slate-200 transition-colors font-mono">NCBI Gene Portal</a>
            <a href={`https://useast.ensembl.org/Multi/Search/Results?q=${selectedGene}`} target="_blank" rel="noopener noreferrer" className="block px-4 py-2 hover:bg-studio-glowBlue/20 text-slate-200 transition-colors font-mono">Ensembl Genome Browser</a>
            <a href={`https://www.uniprot.org/uniprotkb?query=${selectedGene}`} target="_blank" rel="noopener noreferrer" className="block px-4 py-2 hover:bg-studio-glowBlue/20 text-slate-200 transition-colors font-mono">UniProt Knowledgebase</a>
            <a href={`https://www.proteinatlas.org/search/${selectedGene}`} target="_blank" rel="noopener noreferrer" className="block px-4 py-2 hover:bg-studio-glowBlue/20 text-slate-200 transition-colors font-mono">Human Protein Atlas (HPA)</a>
            <a href={`https://reactome.org/content/query?q=${selectedGene}&species=Homo+sapiens`} target="_blank" rel="noopener noreferrer" className="block px-4 py-2 hover:bg-studio-glowBlue/20 text-slate-200 transition-colors font-mono">Reactome Pathway DB</a>
            <a href={`https://genome.ucsc.edu/cgi-bin/hgTracks?db=hg38&position=${selectedGene}`} target="_blank" rel="noopener noreferrer" className="block px-4 py-2 hover:bg-studio-glowBlue/20 text-slate-200 transition-colors font-mono">UCSC Genome Browser</a>
            <a href={`https://string-db.org/newstring_cgi/show_network_section.pl?identifier=${selectedGene}`} target="_blank" rel="noopener noreferrer" className="block px-4 py-2 hover:bg-studio-glowBlue/20 text-slate-200 transition-colors font-mono">STRING DB Interactions</a>
          </div>
        </div>

        {/* Help Dropdown */}
        <div className="relative group cursor-pointer hover:text-slate-100 transition-colors py-1">
          Help
          <div className="absolute top-full left-0 hidden group-hover:block bg-slate-900 border border-studio-border rounded-lg py-1 shadow-2xl min-w-[180px] z-50 backdrop-blur-md">
            <button className="w-full text-left px-4 py-2 hover:bg-studio-glowBlue/20 text-slate-200 transition-colors" onClick={() => setHelpModalOpen(true)}>User Guide & Science Help</button>
            <button className="w-full text-left px-4 py-2 hover:bg-studio-glowBlue/20 text-slate-200 transition-colors border-t border-studio-border/30" onClick={() => setCitationModalOpen(true)}>Cite OmniGene Studio</button>
            <button className="w-full text-left px-4 py-2 hover:bg-studio-glowBlue/20 text-slate-200 transition-colors border-t border-studio-border/30" onClick={() => alert("OmniGene Studio v1.0.0\nHigh-Performance Spatial Transcriptomics & Pathway analytics suite.")}>About Studio</button>
            <a href="https://reactome.org/" target="_blank" rel="noopener noreferrer" className="block px-4 py-2 hover:bg-studio-glowBlue/20 text-slate-200 transition-colors">Documentation</a>
          </div>
        </div>

        {/* Database Version & Live Status Tracker */}
        <div className="ml-auto flex items-center gap-3">
          <div className="text-[9px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full font-mono uppercase tracking-wider">
            {dbVersion}
          </div>
          <div className="flex items-center gap-1.5 text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-mono uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
            Scientific Backend: Connected (127.0.0.1:8000)
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        
        {/* Brand Logo & Name */}
        <div className="flex items-center gap-3 select-none">
          {/* OGS icon mark */}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="38" height="38" aria-label="OmniGene Studio icon" className="flex-shrink-0">
            <rect width="48" height="48" rx="10" fill="#0d1f1a"/>
            <text
              x="50%" y="54%"
              dominantBaseline="middle"
              textAnchor="middle"
              fontFamily="'Segoe UI', system-ui, sans-serif"
              fontWeight="800"
              fontSize="16"
              letterSpacing="0.5"
              fill="#3ddc84"
            >OGS</text>
          </svg>

          {/* Wordmark */}
          <div>
            <h1 className="text-[15px] font-extrabold tracking-widest leading-none flex items-baseline gap-0">
              <span className="text-slate-100">OMNI&nbsp;</span>
              <span style={{ color: '#3ddc84' }}>GENE&nbsp;</span>
              <span className="text-slate-100">STUDIO</span>
            </h1>
            <p className="text-[9.5px] text-studio-textMuted tracking-widest uppercase font-semibold mt-0.5">V1.0</p>
          </div>
        </div>

      {/* Autocomplete Search Bar */}
      <div className="relative w-80" ref={dropdownRef}>
        <div className="relative">
          <input
            type="text"
            className="w-full pl-10 pr-10 py-2 rounded-lg glass-input text-sm"
            placeholder="Search Gene (e.g., TNF, AKT1, EGFR)..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchResults.length > 0) {
                handleSearchSubmit(searchResults[0]);
              }
            }}
          />
          <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-studio-textMuted" />
          {isLoading && (
            <RefreshCw className="absolute right-3 top-2.5 w-4 h-4 text-studio-glowBlue animate-spin" />
          )}
        </div>

        {/* Autocomplete Suggestion Dropdown */}
        {showDropdown && searchResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900/95 border border-studio-border rounded-lg shadow-2xl overflow-hidden backdrop-blur-md">
            {searchResults.map((gene) => (
              <button
                key={gene}
                className="w-full text-left px-4 py-2 hover:bg-studio-glowBlue/20 text-sm transition-colors text-slate-200 font-mono flex justify-between items-center"
                onClick={() => handleSearchSubmit(gene)}
              >
                <span>{gene}</span>
                <span className="text-[10px] text-studio-textMuted bg-slate-800 px-1.5 py-0.5 rounded">HGNC</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Global Settings & Threshold Controls */}
      <div className="flex items-center gap-6 flex-wrap">
        
        {/* Scale Toggle */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-studio-textMuted font-semibold uppercase tracking-wider">Scale:</span>
          <div className="flex bg-slate-950/80 p-0.5 rounded-lg border border-studio-border">
            <button
              className={`px-3 py-1 text-xs rounded-md transition-all font-medium ${scaleType === 'linear' ? 'bg-studio-glowBlue text-white shadow-glow' : 'text-studio-textMuted hover:text-slate-200'}`}
              onClick={() => setScaleType('linear')}
            >
              Linear
            </button>
            <button
              className={`px-3 py-1 text-xs rounded-md transition-all font-medium ${scaleType === 'log2' ? 'bg-studio-glowBlue text-white shadow-glow' : 'text-studio-textMuted hover:text-slate-200'}`}
              onClick={() => setScaleType('log2')}
            >
              Log2
            </button>
          </div>
        </div>

        {/* Expression Threshold Slider */}
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <span className="text-[10px] text-studio-textMuted font-bold uppercase tracking-wider">Exp Threshold</span>
            <span className="text-xs font-mono text-studio-glowBlue">{expressionThreshold.toFixed(1)} nTPM</span>
          </div>
          <input
            type="range"
            min="0"
            max="150"
            step="1"
            className="w-28 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-studio-glowBlue"
            value={expressionThreshold}
            onChange={(e) => setExpressionThreshold(Number(e.target.value))}
          />
        </div>

        {/* FDR Threshold Slider */}
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <span className="text-[10px] text-studio-textMuted font-bold uppercase tracking-wider">FDR Filter</span>
            <span className="text-xs font-mono text-studio-glowCyan">&lt; {fdrThreshold.toFixed(3)}</span>
          </div>
          <input
            type="range"
            min="0.001"
            max="0.05"
            step="0.001"
            className="w-28 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-studio-glowCyan"
            value={fdrThreshold}
            onChange={(e) => setFdrThreshold(Number(e.target.value))}
          />
        </div>

      </div>

      {/* Action / Export Buttons */}
      <div className="flex items-center gap-2">
        {/* Upload VCF */}
        <button
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-studio-border text-xs text-studio-textMuted hover:text-slate-100 hover:border-slate-500 transition-all font-medium"
          onClick={() => fileInputRef.current?.click()}
          title="Upload Variant Call Format (.vcf) file to overlay mutations on pathway nodes"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Overlay VCF</span>
        </button>
        <input
          type="file"
          accept=".vcf"
          ref={fileInputRef}
          onChange={handleVcfUpload}
          className="hidden"
        />

        {/* Export Data */}
        <div className="h-6 w-[1px] bg-studio-border mx-1"></div>

        <button
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-studio-border text-xs text-studio-textMuted hover:text-slate-100 hover:border-slate-500 transition-all font-medium"
          onClick={handleExportCSV}
          disabled={expressionData.length === 0}
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export CSV</span>
        </button>

        {/* Session state workspace .omni */}
        <button
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-studio-glowBlue/10 border border-studio-glowBlue/30 text-xs text-studio-glowBlue hover:bg-studio-glowBlue/20 hover:border-studio-glowBlue/60 transition-all font-semibold"
          onClick={handleExportSession}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Save Workspace (.omni)</span>
        </button>

        <button
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-studio-border text-xs text-studio-textMuted hover:text-slate-100 hover:border-slate-500 transition-all font-medium"
          onClick={() => sessionInputRef.current?.click()}
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Load Workspace</span>
        </button>
        <input
          type="file"
          accept=".omni"
          ref={sessionInputRef}
          onChange={handleImportSession}
          className="hidden"
        />
      </div>

      </div>

      {/* Error Bar */}
      {error && (
        <div className="absolute top-full left-0 right-0 bg-red-950/90 border-b border-red-500/50 py-1.5 px-6 flex items-center gap-2 text-xs text-red-200 z-40 backdrop-blur-md">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

    </header>
  );
}
