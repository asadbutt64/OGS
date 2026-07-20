import { toPng } from 'html-to-image';

export async function exportPdfReport(storeState: any) {
  const {
    selectedGene,
    expressionThreshold,
    fdrThreshold,
    scaleType,
    mutatedGenes,
    pathwayData,
    gseaResults,
    coexpressionCompareGene,
    crisprGuides,
    pubmedFeed,
    drugsByGene
  } = storeState;

  // 1. Snapshot Pathway Canvas
  let pathwayPng = '';
  const flowEl = document.querySelector('.react-flow') as HTMLElement;
  if (flowEl) {
    const controls = flowEl.querySelector('.react-flow__controls') as HTMLElement;
    const legend = flowEl.querySelector('.border-dashed') as HTMLElement;
    if (controls) controls.style.visibility = 'hidden';
    try {
      pathwayPng = await toPng(flowEl, {
        backgroundColor: '#090d16',
        style: { transform: 'none' }
      });
    } catch (e) {
      console.error('Failed to capture pathway canvas PNG', e);
    }
    if (controls) controls.style.visibility = 'visible';
  }

  // 2. Snapshot Plotly Expression Chart
  let plotlyPng = '';
  const PlotlyLib = (window as any).Plotly;
  const plotEl = document.querySelector('.js-plotly-plot');
  if (PlotlyLib && plotEl) {
    try {
      plotlyPng = await PlotlyLib.toImage(plotEl, { format: 'png', width: 900, height: 450 });
    } catch (e) {
      console.error('Failed to capture Plotly chart', e);
    }
  }

  // 3. Serialize Anatomy SVG
  let anatomySvg = '';
  const svgEl = document.querySelector('.anatomy-svg');
  if (svgEl) {
    const serializer = new XMLSerializer();
    anatomySvg = serializer.serializeToString(svgEl);
  }

  // 4. Gather active drug overlay data
  const drugMatches: any[] = [];
  if (pathwayData) {
    pathwayData.nodes.forEach((n: any) => {
      const drugs = drugsByGene[n.id.toUpperCase()] || [];
      drugs.forEach((d: any) => {
        drugMatches.push({ gene: n.name, drug: d.name, mechanism: d.mechanism, phase: d.phase });
      });
    });
  }

  // 5. Build HTML Print template
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert("Please allow popups to export the research report PDF.");
    return;
  }

  const dateString = new Date().toLocaleString();

  printWindow.document.write(`
    <html>
      <head>
        <title>OmniGene Studio - Session Report (${selectedGene})</title>
        <style>
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            color: #1e293b;
            line-height: 1.5;
            padding: 40px;
            background: #ffffff;
            margin: 0;
          }
          h1, h2, h3 {
            color: #0f172a;
            margin-top: 0;
          }
          h1 {
            border-bottom: 2px solid #3b82f6;
            padding-bottom: 12px;
            font-size: 24px;
            font-weight: 800;
          }
          h2 {
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 6px;
            font-size: 16px;
            margin-top: 30px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .meta-grid {
            display: grid;
            grid-cols: 2;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            padding: 15px;
            border-radius: 8px;
            font-size: 12px;
            margin-bottom: 25px;
          }
          .meta-item span {
            font-weight: bold;
            color: #475569;
          }
          .report-section {
            margin-bottom: 30px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
            margin-top: 10px;
          }
          th, td {
            border: 1px solid #cbd5e1;
            padding: 8px;
            text-align: left;
          }
          th {
            background-color: #f1f5f9;
            font-weight: bold;
          }
          .page-break {
            page-break-before: always;
          }
          .flex-center {
            display: flex;
            justify-content: center;
            align-items: center;
            margin: 20px 0;
          }
          .chart-img {
            max-width: 100%;
            height: auto;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
          }
          .svg-container {
            max-width: 320px;
            margin: 0 auto;
          }
          .svg-container svg {
            width: 100%;
            height: auto;
          }
          .citation-box {
            background: #f1f5f9;
            border-left: 4px solid #3b82f6;
            padding: 12px;
            font-family: monospace;
            font-size: 10px;
            white-space: pre-wrap;
            margin-top: 15px;
          }
          .badge {
            display: inline-block;
            padding: 2px 6px;
            font-size: 9px;
            font-weight: bold;
            border-radius: 4px;
            background: #fee2e2;
            color: #991b1b;
          }
        </style>
      </head>
      <body>
        
        <!-- Header Page -->
        <div class="report-section">
          <div style="float: right; text-align: right; font-size: 10px; color: #64748b;">
            OmniGene Studio v1.0.0
          </div>
          <h1>CLINICAL RESEARCH SESSION REPORT</h1>
          
          <div class="meta-grid">
            <div class="meta-item">
              <p><span>Lead Investigator:</span> Asad Butt</p>
              <p><span>Credentials:</span> MPhil Biotechnology (University of Gujrat)</p>
              <p><span>Affiliation:</span> MSc Biomedical Sciences (University of Chester)</p>
            </div>
            <div class="meta-item">
              <p><span>Target Gene:</span> ${selectedGene}</p>
              <p><span>Co-expression Partner:</span> ${coexpressionCompareGene}</p>
              <p><span>Session Timestamp:</span> ${dateString}</p>
            </div>
          </div>
        </div>

        <!-- Section 1: Macroscopic Tissue Heatmap -->
        <div class="report-section">
          <h2>1. Macroscopic Anatomical Expression</h2>
          <p style="font-size: 11px;">
            Heatmap mapping showing organ expression levels colored from blue (low) to red (high) based on median nTPM levels. Filter thresholds active: <strong>nTPM &ge; ${expressionThreshold}</strong> and <strong>FDR &le; ${fdrThreshold}</strong> (${scaleType} scale).
          </p>
          <div class="flex-center">
            <div class="svg-container">
              ${anatomySvg || '<p style="color: red;">[Anatomy Heatmap SVG not captured]</p>'}
            </div>
          </div>
        </div>

        <!-- Page Break to Canvas -->
        <div class="page-break"></div>

        <!-- Section 2: Signaling Cascade -->
        <div class="report-section">
          <h2>2. Signaling Pathway Topology</h2>
          <p style="font-size: 11px;">
            Topological network layout representing the Reactome pathway: <strong>${pathwayData?.pathway_name || 'N/A'}</strong>.
          </p>
          <div class="flex-center">
            ${pathwayPng ? `<img src="${pathwayPng}" class="chart-img" style="max-height: 400px;" />` : '<p style="color: red;">[Pathway Canvas PNG not captured]</p>'}
          </div>
          
          {/* Active Drugs Summary Table */}
          {drugMatches.length > 0 && (
            <div style="margin-top: 15px;">
              <h3 style="font-size: 12px; font-weight: bold;">Therapeutic Modulators Overlaid</h3>
              <table>
                <thead>
                  <tr>
                    <th>Target Protein</th>
                    <th>Drug Agent</th>
                    <th>Mechanism of Action</th>
                    <th>Clinical Stage</th>
                  </tr>
                </thead>
                <tbody>
                  ${drugMatches.map(m => `
                    <tr>
                      <td><strong>${m.gene}</strong></td>
                      <td>${m.drug}</td>
                      <td>${m.mechanism}</td>
                      <td>${m.phase}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div class="page-break"></div>

        <!-- Section 3: Expression Plots & Correlation -->
        <div class="report-section">
          <h2>3. Expression Analytics & plots</h2>
          <p style="font-size: 11px;">
            Expression profile plots and Pearson co-expression matrix summaries.
          </p>
          <div class="flex-center">
            ${plotlyPng ? `<img src="${plotlyPng}" class="chart-img" />` : '<p style="color: red;">[Plotly Analytics Chart not captured]</p>'}
          </div>
        </div>

        <!-- Section 4: GSEA Statistics -->
        ${gseaResults && gseaResults.length > 0 ? `
          <div class="report-section" style="margin-top: 30px;">
            <h2>4. Hypergeometric GSEA Pathway Enrichment</h2>
            <p style="font-size: 11px;">
              Over-representation analysis of clinical mutations relative to human pathway categories.
            </p>
            <table>
              <thead>
                <tr>
                  <th>Reactome Pathway Category</th>
                  <th>Overlap</th>
                  <th>p-Value Significance</th>
                  <th>Badge Status</th>
                </tr>
              </thead>
              <tbody>
                ${gseaResults.slice(0, 8).map((r: any) => `
                  <tr>
                    <td><strong>${r.pathway}</strong></td>
                    <td>${r.overlap} / ${r.pathway_size}</td>
                    <td>${r.p_value.toExponential(4)}</td>
                    <td>
                      ${r.p_value < 0.01 ? '<span class="badge" style="background:#fee2e2; color:#991b1b;">Highly Significant</span>' :
                        r.p_value < 0.05 ? '<span class="badge" style="background:#fef3c7; color:#92400e;">Significant</span>' :
                        '<span style="color:#64748b;">N.S.</span>'}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : ''}

        <div class="page-break"></div>

        <!-- Section 5: CRISPR KO Exon Targets -->
        ${crisprGuides && crisprGuides.length > 0 ? `
          <div class="report-section">
            <h2>5. CRISPR KO Guide Recommendations</h2>
            <p style="font-size: 11px;">
              SpCas9 target guide coordinates designed to knock out coding exons of <strong>${selectedGene}</strong>.
            </p>
            <table>
              <thead>
                <tr>
                  <th>Exon Target</th>
                  <th>20nt Guide RNA Target (5' to 3')</th>
                  <th>PAM Motif</th>
                  <th>Efficiency Score</th>
                  <th>GC Content</th>
                </tr>
              </thead>
              <tbody>
                ${crisprGuides.slice(0, 5).map((g: any) => `
                  <tr>
                    <td>${g.exon}</td>
                    <td><code style="font-weight:bold; color:#059669;">${g.guide_seq}</code></td>
                    <td><strong style="color:#d97706;">${g.pam}</strong></td>
                    <td><strong>${g.efficiency_score}%</strong></td>
                    <td>${g.gc_content}%</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : ''}

        <!-- Section 6: Bibliographic Referencing -->
        <div class="report-section" style="margin-top: 40px;">
          <h2>6. Studio Reference Citation</h2>
          <p style="font-size: 11px;">
            Please cite this software in your research work using the templates below:
          </p>
          <div class="citation-box">APA 7th Edition Style:
Butt, A. (2026). OmniGene Studio: High-Throughput Spatial Transcriptomics and Signaling Pathway Analytics Suite (Version 1.0.0). University of Gujrat & University of Chester. https://github.com/asadbutt/omnigene-studio

BibTeX Reference:
@software{omnigene_studio_2026,
  author = {Butt, Asad},
  title = {OmniGene Studio: High-Throughput Spatial Transcriptomics and Signaling Pathway Analytics Suite},
  year = {2026},
  version = {1.0.0},
  institution = {University of Gujrat & University of Chester},
  url = {https://github.com/asadbutt/omnigene-studio}
}</div>
        </div>

      </body>
    </html>
  `);

  printWindow.document.close();

  // Trigger browser save-to-PDF print window once loaded
  printWindow.onload = () => {
    printWindow.print();
  };

  // Fallback if onload doesn't fire (sometimes happens in Electron)
  setTimeout(() => {
    if (printWindow.document.readyState === 'complete') {
      printWindow.print();
    }
  }, 1000);
}
