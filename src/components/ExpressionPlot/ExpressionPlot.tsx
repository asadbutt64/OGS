import React, { useState, useEffect } from 'react';
import { useStore } from '../../store/store';
import { BarChart3, HelpCircle, Activity } from 'lucide-react';
import Plot from 'react-plotly.js';

export default function ExpressionPlot() {
  const {
    expressionData,
    expressionThreshold,
    fdrThreshold,
    scaleType,
    activeTissueFilter,
    setActiveTissueFilter,
    selectedGene,
    coexpressionCompareGene,
    coexpressionData,
    setCoexpressionCompareGene,
    activeTab,
    setActiveTab,
    expressionExportTrigger,
    heatmapGenes,
    heatmapData,
    setHeatmapGenes,
    deconvolutionData
  } = useStore();

  const [heatmapInput, setHeatmapInput] = useState('');

  // Sync heatmap input box when store updates
  useEffect(() => {
    setHeatmapInput(heatmapGenes.join(', '));
  }, [heatmapGenes]);

  // Handle high-res PNG export events
  useEffect(() => {
    if (expressionExportTrigger === 0) return;
    const PlotlyLib = (window as any).Plotly;
    const plotDiv = document.querySelector('.js-plotly-plot');

    if (plotDiv && PlotlyLib) {
      PlotlyLib.downloadImage(plotDiv, {
        format: 'png',
        width: 1200,
        height: 600,
        filename: activeTab === 'heatmap' ? `${selectedGene}_correlation_heatmap` : `${selectedGene}_expression_chart`
      });
    }
  }, [expressionExportTrigger, activeTab, selectedGene]);

  if (expressionData.length === 0) {
    return (
      <div className="glass-panel rounded-xl h-full flex flex-col items-center justify-center p-6 text-studio-textMuted border border-studio-border">
        <BarChart3 className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-xs">No expression data loaded. Search for a gene above.</p>
      </div>
    );
  }

  // ---- TAB 1: EXPRESSION MATRIX PREP ----
  const sortedData = [...expressionData].sort((a, b) => b.nTPM - a.nTPM);
  const tissues: string[] = [];
  const expressions: number[] = [];
  const colors: string[] = [];

  sortedData.forEach((item) => {
    const isFiltered = item.nTPM < expressionThreshold || item.FDR > fdrThreshold;
    const isSelected = activeTissueFilter === item.tissue;

    tissues.push(item.tissue);
    expressions.push(scaleType === 'log2' ? Math.log2(item.nTPM + 1) : item.nTPM);

    if (isFiltered) {
      colors.push('rgba(74, 85, 104, 0.2)');
    } else if (activeTissueFilter && !isSelected) {
      colors.push('rgba(59, 130, 246, 0.25)');
    } else if (isSelected) {
      colors.push('#06B6D4');
    } else {
      const ratio = Math.min(item.nTPM / 150, 1);
      const hue = 210 - ratio * 210;
      colors.push(`hsla(${hue}, 85%, 50%, 0.7)`);
    }
  });

  const handleBarClick = (data: any) => {
    if (data.points && data.points.length > 0) {
      const tissueName = data.points[0].y;
      if (activeTissueFilter === tissueName) {
        setActiveTissueFilter(null);
      } else {
        setActiveTissueFilter(tissueName);
      }
    }
  };

  // ---- TAB 2: CO-EXPRESSION ANALYZER PREP ----
  const scatterX: number[] = [];
  const scatterY: number[] = [];
  const scatterTissues: string[] = [];
  let regX: number[] = [];
  let regY: number[] = [];
  let rVal: number | null = null;
  let formulaStr = '';

  if (coexpressionData && coexpressionData.data) {
    coexpressionData.data.forEach((item: any) => {
      scatterX.push(item.valA);
      scatterY.push(item.valB);
      scatterTissues.push(item.tissue);
    });

    rVal = coexpressionData.r ?? null;
    formulaStr = (rVal !== null && coexpressionData.slope != null)
      ? `y = ${coexpressionData.slope.toFixed(2)}x + ${coexpressionData.intercept.toFixed(2)}`
      : 'Insufficient data (n < 3 shared tissues)';

    const minX = Math.min(...scatterX);
    const maxX = Math.max(...scatterX);
    regX = [minX, maxX];
    regY = [
      coexpressionData.slope * minX + coexpressionData.intercept,
      coexpressionData.slope * maxX + coexpressionData.intercept
    ];
  }

  // ---- TAB 4: CELL DECONVOLUTION PREP ----
  const cellTypes: string[] = [];
  const cellFractions: number[] = [];
  const cellExpressions: number[] = [];

  if (deconvolutionData && deconvolutionData.fractions) {
    deconvolutionData.fractions.forEach((item: any) => {
      cellTypes.push(item.cell_type);
      cellFractions.push(item.fraction * 100);
      cellExpressions.push(item.expression);
    });
  }

  // ---- TAB 3: HEATMAP MATRIX SUBMIT ----
  const handleHeatmapSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const list = heatmapInput
      .split(',')
      .map((g) => g.trim().toUpperCase())
      .filter((g) => g.length > 0);
    setHeatmapGenes(list);
  };

  return (
    <div className="glass-panel rounded-xl h-full flex flex-col p-4 overflow-hidden border border-studio-border relative select-none">
      
      {/* Header Tabs & Inline Controls */}
      <div className="flex items-center justify-between mb-2 border-b border-studio-border pb-2.5">
        <div className="flex items-center gap-1.5 bg-slate-950 p-0.5 rounded-lg border border-studio-border">
          <button
            className={`px-3 py-1 text-xs rounded-md transition-all font-medium ${activeTab === 'expression' ? 'bg-studio-glowBlue text-white shadow-glow' : 'text-studio-textMuted hover:text-slate-200'}`}
            onClick={() => setActiveTab('expression')}
          >
            Spatial Expression ({selectedGene})
          </button>
          <button
            className={`px-3 py-1 text-xs rounded-md transition-all font-medium ${activeTab === 'coexpression' ? 'bg-studio-glowBlue text-white shadow-glow' : 'text-studio-textMuted hover:text-slate-200'}`}
            onClick={() => setActiveTab('coexpression')}
          >
            Co-Expression Analyzer
          </button>
          <button
            className={`px-3 py-1 text-xs rounded-md transition-all font-medium ${activeTab === 'heatmap' ? 'bg-studio-glowBlue text-white shadow-glow' : 'text-studio-textMuted hover:text-slate-200'}`}
            onClick={() => setActiveTab('heatmap')}
          >
            Multi-Gene Matrix
          </button>
          <button
            className={`px-3 py-1 text-xs rounded-md transition-all font-medium ${activeTab === 'deconvolution' ? 'bg-studio-glowBlue text-white shadow-glow' : 'text-studio-textMuted hover:text-slate-200'}`}
            onClick={() => setActiveTab('deconvolution')}
          >
            Single-Cell Deconvolution
          </button>
        </div>

        {/* Tab-dependent Controls */}
        {activeTab === 'expression' ? (
          <div className="flex items-center gap-3 text-[10px] text-studio-textMuted font-mono">
            <span className="flex items-center gap-1">
              <HelpCircle className="w-3.5 h-3.5 text-studio-textMuted/70" />
              Click bars to isolate organ mapping
            </span>
          </div>
        ) : activeTab === 'coexpression' ? (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-studio-textMuted font-bold uppercase tracking-wider font-sans">Compare with:</span>
            <input
              type="text"
              value={coexpressionCompareGene}
              onChange={(e) => setCoexpressionCompareGene(e.target.value)}
              className="bg-slate-950 border border-studio-border rounded px-2 py-1 text-[10px] text-slate-100 font-mono focus:outline-none focus:border-studio-glowBlue placeholder-slate-700 w-24"
              placeholder="Gene name"
            />
            {coexpressionData && (
              <div className="flex items-center gap-2 ml-2 bg-slate-900 border border-studio-border rounded-lg px-2.5 py-1">
                <span className="text-[10px] font-bold text-slate-300">Pearson r:</span>
                {rVal !== null && rVal !== undefined ? (
                  <span className={`text-[10px] font-extrabold font-mono ${rVal > 0.4 ? 'text-emerald-400' : rVal < -0.4 ? 'text-red-400' : 'text-yellow-400'}`}>
                    {rVal.toFixed(4)}
                  </span>
                ) : (
                  <span className="text-[10px] font-mono text-slate-500 italic">Insufficient data (n=0)</span>
                )}
                <span className="text-[9px] text-studio-textMuted font-mono border-l border-studio-border/60 pl-2">
                  {formulaStr}
                </span>
              </div>
            )}
          </div>
        ) : activeTab === 'heatmap' ? (
          <form onSubmit={handleHeatmapSubmit} className="flex items-center gap-2">
            <span className="text-[10px] text-studio-textMuted font-bold uppercase tracking-wider font-sans">Matrix Genes:</span>
            <input
              type="text"
              value={heatmapInput}
              onChange={(e) => setHeatmapInput(e.target.value)}
              className="bg-slate-950 border border-studio-border rounded px-2 py-1 text-[10px] text-slate-100 font-mono focus:outline-none focus:border-studio-glowBlue placeholder-slate-700 w-60"
              placeholder="Gene list (e.g. TNF, EGFR, AKT1)"
            />
            <button
              type="submit"
              className="bg-studio-glowBlue/20 text-studio-glowBlue border border-studio-glowBlue/40 px-2 py-1 rounded text-[10px] hover:bg-studio-glowBlue/30 font-bold uppercase transition-all"
            >
              Analyze
            </button>
          </form>
        ) : (
          <div className="flex items-center gap-2 text-[10px] text-studio-textMuted font-mono">
            <span className="font-bold uppercase tracking-wider text-slate-400">Tissue Model:</span>
            <span className="text-studio-glowBlue font-semibold">{activeTissueFilter || 'Liver'}</span>
            <span className="text-[9px] opacity-75 border-l border-studio-border/60 pl-2">Signature Matrix: CIBERSORTx LM22 approximation</span>
          </div>
        )}
      </div>

      {/* Main Canvas rendering */}
      <div className="flex-1 min-h-0 relative">
        {activeTab === 'expression' && (
          <Plot
            data={[
              {
                x: tissues,
                y: expressions,
                type: 'bar',
                marker: { color: colors },
                hoverinfo: 'text',
                text: sortedData.map(
                  (item) => `Tissue: ${item.tissue}<br>Expression: ${(item.nTPM ?? 0).toFixed(2)} nTPM<br>FDR: ${item.FDR !== undefined && item.FDR !== null ? item.FDR.toFixed(6) : 'N/A'}`
                )
              }
            ]}
            layout={{
              paper_bgcolor: 'rgba(0,0,0,0)',
              plot_bgcolor: 'rgba(0,0,0,0)',
              font: {
                color: '#94A3B8',
                family: 'Inter, sans-serif',
                size: 9
              },
              margin: { l: 160, r: 15, t: 5, b: 30 },
              xaxis: {
                title: {
                  text: scaleType === 'log2' ? 'log2(nTPM + 1)' : 'Expression level (nTPM)',
                  font: { size: 9, color: '#64748B' }
                },
                gridcolor: 'rgba(255, 255, 255, 0.04)',
                zeroline: false,
                tickfont: { size: 9 }
              },
              yaxis: {
                gridcolor: 'rgba(255, 255, 255, 0.04)',
                tickfont: { size: 9, color: '#E2E8F0' },
                autorange: true
              },
              hoverlabel: {
                bgcolor: '#0B0F19',
                bordercolor: '#2A3142',
                font: { color: '#F8FAFC', family: 'Fira Code, monospace', size: 10 }
              }
            }}
            config={{
              responsive: true,
              displayModeBar: false
            }}
            onClick={handleBarClick}
            className="w-full h-full js-plotly-plot"
          />
        )}

        {activeTab === 'coexpression' && (
          coexpressionData && coexpressionData.data && coexpressionData.data.length > 0 ? (
            <Plot
              data={[
                {
                  x: scatterX,
                  y: scatterY,
                  mode: 'markers',
                  type: 'scatter',
                  name: 'Tissues',
                  marker: {
                    color: '#06B6D4',
                    size: 8,
                    line: { color: '#090d16', width: 1 }
                  },
                  hoverinfo: 'text',
                  text: scatterTissues.map((t, idx) => 
                    `Tissue: ${t}<br>${selectedGene}: ${(scatterX[idx] ?? 0).toFixed(2)} nTPM<br>${coexpressionCompareGene}: ${(scatterY[idx] ?? 0).toFixed(2)} nTPM`
                  )
                },
                {
                  x: regX,
                  y: regY,
                  mode: 'lines',
                  type: 'scatter',
                  name: 'OLS Fit',
                  line: { color: '#EF4444', width: 1.5, dash: 'dash' },
                  hoverinfo: 'none'
                }
              ]}
              layout={{
                paper_bgcolor: 'rgba(0,0,0,0)',
                plot_bgcolor: 'rgba(0,0,0,0)',
                font: {
                  color: '#94A3B8',
                  family: 'Inter, sans-serif',
                  size: 9
                },
                margin: { l: 50, r: 15, t: 5, b: 30 },
                xaxis: {
                  title: {
                    text: `${selectedGene} Expression (nTPM)`,
                    font: { size: 9, color: '#64748B' }
                  },
                  gridcolor: 'rgba(255, 255, 255, 0.04)',
                  zeroline: false,
                  tickfont: { size: 9 }
                },
                yaxis: {
                  title: {
                    text: `${coexpressionCompareGene} Expression (nTPM)`,
                    font: { size: 9, color: '#64748B' }
                  },
                  gridcolor: 'rgba(255, 255, 255, 0.04)',
                  zeroline: false,
                  tickfont: { size: 9 }
                },
                showlegend: false,
                hoverlabel: {
                  bgcolor: '#0B0F19',
                  bordercolor: '#2A3142',
                  font: { color: '#F8FAFC', family: 'Fira Code, monospace', size: 10 }
                }
              }}
              config={{
                responsive: true,
                displayModeBar: false
              }}
              className="w-full h-full js-plotly-plot"
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-studio-textMuted">
              <Activity className="w-8 h-8 mb-2 opacity-40 animate-pulse text-studio-glowBlue" />
              <p className="text-xs">Gathering co-expression matrices from the GTEx network...</p>
            </div>
          )
        )}

        {activeTab === 'heatmap' && (
          heatmapData && heatmapData.matrix && heatmapData.matrix.length > 0 ? (
            <Plot
              data={[
                {
                  z: heatmapData.matrix,
                  x: heatmapData.genes,
                  y: heatmapData.genes,
                  type: 'heatmap',
                  colorscale: [
                    [0, '#0f172a'],
                    [0.5, '#0891b2'],
                    [1, '#10b981']
                  ],
                  hoverinfo: 'text',
                  text: heatmapData.matrix.map((row: any, rIdx: number) =>
                    row.map((val: any, cIdx: number) =>
                      val !== null && val !== undefined && typeof val === 'number'
                        ? `Gene A: ${heatmapData.genes[rIdx]}<br>Gene B: ${heatmapData.genes[cIdx]}<br>Pearson r: ${val.toFixed(4)}`
                        : `Gene A: ${heatmapData.genes[rIdx]}<br>Gene B: ${heatmapData.genes[cIdx]}<br>Insufficient data`
                    )
                  )
                }
              ]}
              layout={{
                paper_bgcolor: 'rgba(0,0,0,0)',
                plot_bgcolor: 'rgba(0,0,0,0)',
                margin: { l: 60, r: 15, t: 15, b: 40 },
                xaxis: {
                  tickfont: { size: 9, color: '#94A3B8' },
                  gridcolor: 'rgba(255,255,255,0.03)'
                },
                yaxis: {
                  tickfont: { size: 9, color: '#94A3B8' },
                  autorange: 'reversed',
                  gridcolor: 'rgba(255,255,255,0.03)'
                },
                font: { family: 'Inter, sans-serif' },
                hoverlabel: {
                  bgcolor: '#0B0F19',
                  bordercolor: '#2A3142',
                  font: { color: '#F8FAFC', family: 'Fira Code, monospace', size: 10 }
                }
              }}
              config={{
                responsive: true,
                displayModeBar: false
              }}
              className="w-full h-full js-plotly-plot"
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-studio-textMuted">
              <Activity className="w-8 h-8 mb-2 opacity-40 animate-pulse text-studio-glowBlue" />
              <p className="text-xs">Generating correlation matrix heatmap...</p>
            </div>
          )
        )}

        {activeTab === 'deconvolution' && (
          deconvolutionData && deconvolutionData.fractions && deconvolutionData.fractions.length > 0 ? (
            <div className="flex flex-col h-full min-h-0">
              <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[9px] p-2 rounded-lg mb-2 leading-relaxed">
                <strong>ILLUSTRATIVE MODEL ESTIMATION ONLY</strong> — Cell-type fractions and expressions are simulated for demonstrative visualization and are not dynamically sequenced from patient single-cell RNA-seq assays. Standard Error (±SE) displays a fixed 8% placeholder.
              </div>
              <div className="flex-1 min-h-0">
                <Plot
                  data={[
                    {
                      x: cellFractions,
                      y: cellTypes,
                      type: 'bar',
                      orientation: 'h',
                      name: 'Cell Fraction (%)',
                      marker: { color: '#06B6D4' }
                    },
                    {
                      x: cellExpressions,
                      y: cellTypes,
                      type: 'bar',
                      orientation: 'h',
                      name: `${selectedGene} Expression (nTPM)`,
                      marker: { color: '#10B981' }
                    }
                  ]}
                  layout={{
                    paper_bgcolor: 'rgba(0,0,0,0)',
                    plot_bgcolor: 'rgba(0,0,0,0)',
                    barmode: 'group',
                    font: {
                      color: '#94A3B8',
                      family: 'Inter, sans-serif',
                      size: 9
                    },
                    margin: { l: 150, r: 15, t: 5, b: 30 },
                    xaxis: {
                      gridcolor: 'rgba(255, 255, 255, 0.04)',
                      zeroline: false,
                      tickfont: { size: 9 }
                    },
                    yaxis: {
                      gridcolor: 'rgba(255, 255, 255, 0.04)',
                      tickfont: { size: 9, color: '#E2E8F0' }
                    },
                    legend: {
                      font: { size: 9, color: '#94A3B8' },
                      orientation: 'h',
                      x: 0,
                      y: 1.25
                    },
                    hoverlabel: {
                      bgcolor: '#0B0F19',
                      bordercolor: '#2A3142',
                      font: { color: '#F8FAFC', family: 'Fira Code, monospace', size: 10 }
                    }
                  }}
                  config={{
                    responsive: true,
                    displayModeBar: false
                  }}
                  className="w-full h-full js-plotly-plot"
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-studio-textMuted">
              <Activity className="w-8 h-8 mb-2 opacity-40 animate-pulse text-studio-glowBlue" />
              <p className="text-xs">Select an organ on the anatomy map (Zone 2) to trigger cellular deconvolution...</p>
            </div>
          )
        )}
      </div>

    </div>
  );
}
