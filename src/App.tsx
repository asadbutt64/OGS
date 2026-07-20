import React, { useEffect, useState } from 'react';
import { useStore } from './store/store';
import TopRibbon from './components/TopRibbon/TopRibbon';
import AnatomyMapper from './components/AnatomyMapper/AnatomyMapper';
import PathwayCanvas from './components/PathwayCanvas/PathwayCanvas';
import ExpressionPlot from './components/ExpressionPlot/ExpressionPlot';
import GseaModal from './components/GseaModal/GseaModal';
import HelpModal from './components/HelpModal/HelpModal';
import CitationModal from './components/CitationModal/CitationModal';
import PrintableReport from './components/PrintableReport/PrintableReport';
import KineticModal from './components/KineticModal/KineticModal';

export default function App() {
  const { fetchGeneData, selectedGene, isPrintingReportOpen } = useStore();

  // Resizable layout state (Option 3 - dragging / size customization)
  const [leftWidthPercent, setLeftWidthPercent] = useState(33.33); // default: 1/3
  const [topHeightPercent, setTopHeightPercent] = useState(66.67); // default: 2/3
  const [isResizingWidth, setIsResizingWidth] = useState(false);
  const [isResizingHeight, setIsResizingHeight] = useState(false);

  // Initialize workspace with TNF gene on startup
  useEffect(() => {
    fetchGeneData(selectedGene);
  }, []);

  // Track resizing movement
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const workspace = document.getElementById('workspace-main');
      if (!workspace) return;
      const rect = workspace.getBoundingClientRect();

      if (isResizingWidth) {
        // Calculate width ratio relative to workspace container
        const newLeftWidth = ((e.clientX - rect.left) / rect.width) * 100;
        // Clamp bounds to prevent panel collapsing entirely
        setLeftWidthPercent(Math.max(15, Math.min(80, newLeftWidth)));
      }

      if (isResizingHeight) {
        // Calculate height ratio relative to workspace container
        const newTopHeight = ((e.clientY - rect.top) / rect.height) * 100;
        // Clamp bounds to prevent panel collapsing entirely
        setTopHeightPercent(Math.max(20, Math.min(80, newTopHeight)));
      }
    };

    const handleMouseUp = () => {
      setIsResizingWidth(false);
      setIsResizingHeight(false);
    };

    if (isResizingWidth || isResizingHeight) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingWidth, isResizingHeight]);

  return (
    <div className="h-screen w-screen flex flex-col bg-studio-bg text-slate-100 overflow-hidden select-none">
      
      {/* Zone 1: Top Ribbon (Context & Global Controls) */}
      <TopRibbon />

      {/* Studio Workspace Layout Grid (Resizable split-pane layout) */}
      <main 
        id="workspace-main"
        className="flex-1 p-4 flex flex-col gap-1 overflow-hidden relative"
      >
        
        {/* Top Split Container (Anatomy Hero + Pathway canvas side-by-side) */}
        <div 
          className="flex flex-row min-h-0 w-full"
          style={{ height: `${topHeightPercent}%` }}
        >
          {/* Zone 2: Anatomy Hero (Left Panel) */}
          <section 
            className="h-full min-w-0"
            style={{ width: `${leftWidthPercent}%` }}
          >
            <AnatomyMapper />
          </section>

          {/* Vertical width resize handle */}
          <div 
            onMouseDown={(e) => { e.preventDefault(); setIsResizingWidth(true); }}
            className={`w-3 h-full flex-shrink-0 cursor-col-resize flex items-center justify-center group relative z-40 transition-colors ${isResizingWidth ? 'bg-studio-glowBlue/10' : ''}`}
            title="Drag sideways to resize panels"
          >
            {/* Visual separator line */}
            <div className={`w-[2px] h-[40%] rounded-full bg-slate-800 transition-all ${isResizingWidth ? 'bg-studio-glowBlue' : 'group-hover:bg-slate-500'}`} />
          </div>

          {/* Zone 4: Pathway Canvas (Right Panel) */}
          <section 
            className="flex-1 h-full min-w-0"
          >
            <PathwayCanvas />
          </section>
        </div>

        {/* Horizontal height resize handle */}
        <div 
          onMouseDown={(e) => { e.preventDefault(); setIsResizingHeight(true); }}
          className={`h-3 w-full flex-shrink-0 cursor-row-resize flex items-center justify-center group relative z-40 transition-colors ${isResizingHeight ? 'bg-studio-glowBlue/10' : ''}`}
          title="Drag up/down to resize panels"
        >
          {/* Visual separator line */}
          <div className={`h-[2px] w-[15%] rounded-full bg-slate-800 transition-all ${isResizingHeight ? 'bg-studio-glowBlue' : 'group-hover:bg-slate-500'}`} />
        </div>

        {/* Zone 3: Expression Matrix (Bottom Panel) */}
        <section 
          className="flex-1 w-full min-h-0 overflow-hidden"
        >
          <ExpressionPlot />
        </section>

      </main>

      {/* Overlay Analysis Components */}
      <GseaModal />
      <HelpModal />
      <CitationModal />
      <KineticModal />
      {isPrintingReportOpen && <PrintableReport />}

    </div>
  );
}

