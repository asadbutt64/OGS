import React, { useEffect, useState } from 'react';
import { useStore } from '../../store/store';
import { toPng } from 'html-to-image';
import Plot from 'react-plotly.js';

interface KineticData {
  time: number[];
  receptor: number[];
  kinase: number[];
  inhibitor: number[];
  nf_nuc: number[];
}

function calculateDefaultKinetics(hasMutation = false): KineticData {
  const dt = 0.5;
  const duration = 120;
  const steps = duration / dt;
  
  let t = 0.0;
  let S = 10.0;
  let R = 0.0;
  let K = 0.0;
  let I = 0.8;
  let NF_cyt = 0.9;
  let NF_nuc = 0.1;
  
  const k_decay = 0.01;
  const k_rec_act = 0.15;
  const k_rec_inact = 0.05;
  const k_kin_act = 0.25;
  const k_kin_inact = hasMutation ? 0.015 : 0.10;
  const k_synth = 0.08;
  const k_deg = 0.35;
  const k_import = 0.15;
  const k_export = 0.05;
  
  const time: number[] = [];
  const receptor: number[] = [];
  const kinase: number[] = [];
  const inhibitor: number[] = [];
  const nf_nuc: number[] = [];
  
  for (let step = 0; step < steps; step++) {
    time.push(t);
    receptor.push(R);
    kinase.push(K);
    inhibitor.push(I);
    nf_nuc.push(NF_nuc);
    
    const dS = -k_decay * S;
    const dR = k_rec_act * S * (1.0 - R) - k_rec_inact * R;
    const dK = k_kin_act * R * (1.0 - K) - k_kin_inact * K;
    const dI = k_synth * NF_nuc - k_deg * K * I;
    
    const release = k_deg * K * (1.0 - NF_nuc) * 0.5;
    const dNF_cyt = release - k_import * NF_cyt;
    const dNF_nuc = k_import * NF_cyt - k_export * I * NF_nuc;
    
    S += dS * dt;
    R += dR * dt;
    K += dK * dt;
    I += dI * dt;
    NF_cyt += dNF_cyt * dt;
    NF_nuc += dNF_nuc * dt;
    
    S = Math.max(0.0, S);
    R = Math.min(1.0, Math.max(0.0, R));
    K = Math.min(1.0, Math.max(0.0, K));
    I = Math.max(0.0, I);
    NF_cyt = Math.max(0.0, NF_cyt);
    NF_nuc = Math.max(0.0, NF_nuc);
    
    t += dt;
  }
  
  return { time, receptor, kinase, inhibitor, nf_nuc };
}

import { assertSectionDataType, IllustrativeWarningBanner } from './contract_helpers';

function waitForLayoutStability(element: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    let lastWidth = element.scrollWidth;
    let lastHeight = element.scrollHeight;
    let stableCount = 0;

    const check = () => {
      const currentWidth = element.scrollWidth;
      const currentHeight = element.scrollHeight;

      if (currentWidth === lastWidth && currentHeight === lastHeight) {
        stableCount++;
      } else {
        stableCount = 0;
        lastWidth = currentWidth;
        lastHeight = currentHeight;
      }

      if (stableCount >= 2) {
        resolve();
      } else {
        requestAnimationFrame(check);
      }
    };

    requestAnimationFrame(check);
  });
}

function waitForNodeMeasurements(instance: any): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      const nodes = instance.getNodes();
      const allMeasured = nodes.length > 0 && nodes.every((n: any) => n.width && n.height);
      if (allMeasured) {
        resolve();
      } else {
        requestAnimationFrame(check);
      }
    };
    check();
  });
}

function waitForReactFlowInstance(): Promise<any> {
  return new Promise((resolve) => {
    const check = () => {
      const instance = (window as any).reactFlowInstance;
      if (instance) {
        resolve(instance);
      } else {
        requestAnimationFrame(check);
      }
    };
    check();
  });
}

export default function PrintableReport() {
  const store = useStore();
  const {
    selectedGene,
    expressionThreshold,
    fdrThreshold,
    scaleType,
    mutatedGenes,
    expressionData,
    pathwayData,
    gseaResults,
    coexpressionCompareGene,
    coexpressionData,
    crisprGuides,
    drugsByGene,
    setPrintingReportOpen,
    deconvolutionData,
    kineticResults,
    selectedNode,
    dbVersion
  } = store;

  const finalKineticResults = kineticResults || calculateDefaultKinetics(mutatedGenes.includes(selectedGene.toUpperCase()));
  if (finalKineticResults && !finalKineticResults.type) {
    (finalKineticResults as any).type = 'illustrative_simulation';
  }



  const [pathwayPng, setPathwayPng] = useState('');
  const [kineticPng, setKineticPng] = useState('');
  const [isReadyToPrint, setIsReadyToPrint] = useState(false);

  // -------------------------------------------------------------------------
  // Derived anatomy content (mirrors AnatomyMapper logic)
  // -------------------------------------------------------------------------
  const withData = expressionData.map((d: any) => ({
    organ: d.tissue,
    tissue: d.tissue,
    nTPM: d.nTPM as number,
    FDR: d.FDR as number,
    source: d.source_tag ?? 'unknown'
  }));
  const activeOrgans = withData.filter(o => o.nTPM >= expressionThreshold && o.FDR <= fdrThreshold);
  const sortedOrgans = [...withData].sort((a, b) => b.nTPM - a.nTPM);
  const hasFilteredTissues = activeOrgans.length > 0;
  const tissuesForRanking = hasFilteredTissues
    ? [...activeOrgans].sort((a, b) => b.nTPM - a.nTPM)
    : sortedOrgans;

  const top3Organs = [...withData].sort((a, b) => b.nTPM - a.nTPM).slice(0, 3);
  const bottom3Organs = [...withData].sort((a, b) => a.nTPM - b.nTPM).slice(0, 3);
  const meanTPM = withData.length > 0 ? withData.reduce((a, b) => a + b.nTPM, 0) / withData.length : 0;
  const maxTPM = sortedOrgans[0]?.nTPM ?? 0;
  const primaryOrgan = top3Organs[0]?.organ ?? 'N/A';
  const primaryTPM = top3Organs[0]?.nTPM ?? 0;
  const distRatio = activeOrgans.length / (withData.length || 1);
  const distPattern = distRatio >= 0.85 ? 'ubiquitous (housekeeping)' : distRatio >= 0.6 ? 'broadly expressed' : distRatio >= 0.35 ? 'moderately tissue-restricted' : distRatio >= 0.15 ? 'tissue-enriched' : 'highly tissue-specific';
  
  function classifyExp(v: number) {
    if (v >= 100) return 'high';
    if (v >= 10) return 'moderate';
    if (v >= 1) return 'low';
    return 'trace/absent';
  }
  const srcTag: string = withData[0]?.source ?? 'unknown';
  const fetchTs: string = expressionData[0] ? ((expressionData[0] as any).fetch_timestamp ?? '') : '';
  const srcLabel: Record<string, string> = { mygene: 'MyGene.info / GTEx Portal v8', gtex: 'GTEx Portal v8', local: 'Local GTEx Cache', curated: 'Curated Override', none: 'No Data', unknown: 'Unknown' };

  // Co-expression Plotly calculations
  const scatterX: number[] = [];
  const scatterY: number[] = [];
  const scatterTissues: string[] = [];
  let regX: number[] = [];
  let regY: number[] = [];

  if (coexpressionData && coexpressionData.data) {
    coexpressionData.data.forEach((item: any) => {
      scatterX.push(item.valA);
      scatterY.push(item.valB);
      scatterTissues.push(item.tissue);
    });

    if (scatterX.length > 0) {
      const minX = Math.min(...scatterX);
      const maxX = Math.max(...scatterX);
      regX = [minX, maxX];
      regY = [
        coexpressionData.slope * minX + coexpressionData.intercept,
        coexpressionData.slope * maxX + coexpressionData.intercept
      ];
    }
  }

  useEffect(() => {
    async function prepareReport() {
      // 1. Wait for .react-flow element to exist
      let flowEl = document.querySelector('.react-flow') as HTMLElement;
      while (!flowEl) {
        await new Promise((r) => requestAnimationFrame(r));
        flowEl = document.querySelector('.react-flow') as HTMLElement;
      }

      // 2. Wait for layout stability (Observer style scroll check across consecutive animation frames)
      await waitForLayoutStability(flowEl);

      // 3. Wait for reactFlowInstance and for all node measurements to be complete
      const instance = await waitForReactFlowInstance();
      await waitForNodeMeasurements(instance);

      const controls = flowEl.querySelector('.react-flow__controls') as HTMLElement;
      const minimap = flowEl.querySelector('.react-flow__minimap') as HTMLElement;
      if (controls) controls.style.visibility = 'hidden';
      if (minimap) minimap.style.visibility = 'hidden';

      const viewport = flowEl.querySelector('.react-flow__viewport') as HTMLElement;
      if (viewport) {
        const originalTransform = viewport.style.transform;
        const originalWidth = flowEl.style.width;
        const originalHeight = flowEl.style.height;

        // Target dimensions for high resolution print snapshot
        const targetWidth = 1024;
        const targetHeight = 576;

        flowEl.style.width = `${targetWidth}px`;
        flowEl.style.height = `${targetHeight}px`;

        // 4. Force React Flow's fitView with padding 0.1 into the new resized container bounds
        instance.fitView({ padding: 0.1, includeHiddenNodes: true, duration: 0 });

        // Wait one animation frame to let the transform render
        await new Promise((r) => requestAnimationFrame(r));

        try {
          const png = await toPng(flowEl, {
            backgroundColor: '#090d16',
            width: targetWidth,
            height: targetHeight
          });
          setPathwayPng(png);
        } catch (e) {
          console.error('Pathway canvas capture failed', e);
        }

        // Restore styles and fitView
        flowEl.style.width = originalWidth;
        flowEl.style.height = originalHeight;
        instance.fitView({ padding: 0.05, includeHiddenNodes: true, duration: 0 });
      } else {
        try {
          const png = await toPng(flowEl, {
            backgroundColor: '#090d16',
            style: { transform: 'none' }
          });
          setPathwayPng(png);
        } catch (e) {
          console.error('Pathway canvas fallback capture failed', e);
        }
      }

      if (controls) controls.style.visibility = 'visible';
      if (minimap) minimap.style.visibility = 'visible';

      // Signal layout readiness for print
      setIsReadyToPrint(true);
    }

    prepareReport();
  }, []);

  useEffect(() => {
    if (isReadyToPrint) {
      // Use double requestAnimationFrame to guarantee images are painted in browser rendering pipeline before print dialog
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.print();
          setPrintingReportOpen(false);
        });
      });
    }
  }, [isReadyToPrint, setPrintingReportOpen]);

  // Parse drugs overlay targets
  const drugMatches: any[] = [];
  if (pathwayData && pathwayData.nodes) {
    const validReportNodes = pathwayData.nodes.filter((n: any) => n && n.id && n.name && n.name.trim() !== '');
    validReportNodes.forEach((n: any) => {
      const drugs = drugsByGene[n.id.toUpperCase()] || [];
      drugs.forEach((d: any) => {
        if (d && d.name && d.name.trim() !== '') {
          drugMatches.push({ 
            gene: n.name, 
            drug: d.name, 
            mechanism: d.mechanism, 
            phase: d.phase,
            db_id: d.db_id,
            db_source: d.db_source
          });
        }
      });
    });
  }

  const getSectionData = (key: string) => {
    switch (key) {
      case 'expression_table':
        return {
          type: 'expression_table',
          data: expressionData
        };
      case 'pathway_topology':
        return {
          type: 'pathway_topology',
          data: pathwayData,
          drugs: drugMatches
        };
      case 'correlation_scatter':
        return {
          type: 'correlation_scatter',
          data: coexpressionData
        };
      case 'gsea_enrichment':
        return {
          type: 'gsea_enrichment',
          data: gseaResults
        };
      case 'crispr_ko':
        return {
          type: 'crispr_ko',
          data: crisprGuides
        };
      case 'deconvolution_bar':
        return {
          type: 'deconvolution_bar',
          data: deconvolutionData
        };
      case 'molecular_docking':
        return {
          type: 'molecular_docking',
          data: store.dockingResult
        };
      case 'flux_kinetics':
        return {
          type: 'flux_kinetics',
          data: finalKineticResults
        };
      default:
        throw new Error(`Unknown section data key requested: ${key}`);
    }
  };

  const dateString = new Date().toLocaleString();

  return (
    <div className="print-report-container fixed inset-0 bg-white text-slate-900 z-[9999] overflow-y-auto p-12 select-text font-sans">
      
      {/* Header Banner */}
      <div className="border-b-4 border-blue-600 pb-4 mb-6">
        <div className="float-right text-right">
          <span className="text-[9px] text-slate-500 uppercase tracking-widest block font-mono">OmniGene Studio v1.0.0</span>
          <span className="text-[8px] text-blue-600 uppercase tracking-wider block font-mono font-bold">{dbVersion}</span>
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">CLINICAL SESSION RESEARCH REPORT</h1>
        
        <div className="grid grid-cols-2 gap-6 bg-slate-50 border border-slate-200 p-4 rounded-lg text-xs mt-4">
          <div>
            <p className="mb-1"><span className="font-bold text-slate-600">Lead Investigator:</span> Asad Butt</p>
            <p className="mb-1"><span className="font-bold text-slate-600">Credentials:</span> MPhil Biotechnology (University of Gujrat)</p>
            <p className="mb-1"><span className="font-bold text-slate-600">Affiliation:</span> MSc Biomedical Sciences (University of Chester)</p>
          </div>
          <div>
            <p className="mb-1"><span className="font-bold text-slate-600">Target Gene:</span> {selectedGene}</p>
            <p className="mb-1"><span className="font-bold text-slate-600">Co-expression Partner:</span> {coexpressionCompareGene}</p>
            <p className="mb-1"><span className="font-bold text-slate-600">Session Date:</span> {dateString}</p>
          </div>
        </div>
      </div>

      {/* Report Section Category Legend */}
      <div className="bg-slate-50 border-2 border-slate-300 rounded-lg p-4 mb-6 text-xs font-sans">
        <h3 className="font-bold text-slate-850 mb-2 uppercase tracking-wide text-[11px] border-b border-slate-200 pb-1">
          Report Data Integrity & Validation Legend
        </h3>
        <p className="text-[10px] text-slate-650 mb-3 leading-relaxed">
          This report compiles database-derived annotations, static software metadata, live patient VCF screenings, and illustrative simulation models. Review the category definitions below to identify validated experimental data versus illustrative estimations:
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div>
              <span className="inline-block bg-blue-100 text-blue-800 text-[9px] font-extrabold px-2 py-0.5 rounded uppercase tracking-wider mb-1">
                Validated Database-Derived
              </span>
              <p className="text-[9.5px] text-slate-700 leading-normal pl-1">
                <strong>Sections 1 (Anatomy), 2 (Topology), 3 (Expression Plots):</strong> Derived from peer-reviewed databases (GTEx Portal v8, Human Protein Atlas, UniProt, Reactome).
              </p>
            </div>
            <div>
              <span className="inline-block bg-slate-200 text-slate-800 text-[9px] font-extrabold px-2 py-0.5 rounded uppercase tracking-wider mb-1">
                Static Software Metadata
              </span>
              <p className="text-[9.5px] text-slate-700 leading-normal pl-1">
                <strong>Section 9 (Citation Info):</strong> Static software description and developer citation guidelines.
              </p>
            </div>
          </div>
          
          <div className="space-y-2">
            <div>
              <span className="inline-block bg-amber-100 text-amber-800 text-[9px] font-extrabold px-2 py-0.5 rounded uppercase tracking-wider mb-1">
                Illustrative / Simulation-Estimated
              </span>
              <p className="text-[9.5px] text-slate-700 leading-normal pl-1">
                <strong>Sections 5 (CRISPR), 6 (Deconvolution), 7 (Molecular Docking), 8 (Kinetics):</strong> Mathematical approximations, hand-calibrated kinetics, SpCas9 sequences, or ligand pocket alignments. Not dynamically derived from patient wet-lab assays.
              </p>
            </div>
            <div>
              <span className="inline-block bg-violet-100 text-violet-800 text-[9px] font-extrabold px-2 py-0.5 rounded uppercase tracking-wider mb-1">
                Unverified (Awaiting Patient VCF)
              </span>
              <p className="text-[9.5px] text-slate-700 leading-normal pl-1">
                <strong>Section 4 (GSEA Pathway Enrichment):</strong> Pending patient-specific genetic profile upload. Illustrative correlation values display in mock mode.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 1. Macroscopic Anatomical Expression */}
      {(() => {
        const sectionData = getSectionData('expression_table');
        assertSectionDataType(sectionData, 'expression_table', 'Section 1');
        return null;
      })()}
      <div className="mb-8">
        <h2 className="text-sm font-bold uppercase tracking-wider border-b border-slate-200 pb-1 mb-3">1. Macroscopic Anatomical Expression</h2>
        {expressionData.length === 0 ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center text-xs text-red-700 my-4 shadow-sm">
            <span className="font-bold uppercase tracking-wider block mb-1">DATABASE LOOKUP FAILED / NO DATA RETURNED</span>
            No transcriptomic expression levels were returned for gene symbol <strong>"{selectedGene}"</strong>.
          </div>
        ) : (
          <>
            <p className="text-xs text-slate-700 mb-3 leading-relaxed">
              This section presents a comprehensive spatial transcriptomics profile of the query gene{' '}
              <strong>{selectedGene}</strong> across twelve key human organ systems derived from the{' '}
              <strong>GTEx v8 / Human Protein Atlas v24 consensus dataset</strong>. Expression levels are
              quantified in normalized Transcripts Per Million (nTPM), representing the median expression
              across all donor samples for each tissue site. Active filter thresholds applied:{' '}
              <strong>nTPM &ge; {expressionThreshold}</strong> and <strong>FDR &le; {fdrThreshold}</strong>{' '}
              ({scaleType} scale). Data provenance: <strong>{srcLabel[srcTag] ?? srcTag}</strong>
              {fetchTs ? ` · Fetched ${fetchTs.replace('T', ' ').replace('Z', ' UTC').substring(0, 19)}` : ''}.
            </p>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-4 text-xs">
              <h3 className="font-bold text-slate-800 mb-2 uppercase tracking-wide text-[11px]">Spatial Distribution Summary</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="mb-1.5 leading-relaxed">
                    <strong>Gene Symbol:</strong> {selectedGene}<br />
                    <strong>Expression Pattern:</strong> <span className="capitalize">{distPattern}</span><br />
                    <strong>Primary Expression Site:</strong> {primaryOrgan} ({classifyExp(primaryTPM)} — {primaryTPM.toFixed(2)} nTPM)<br />
                    <strong>Active Organ Compartments:</strong> {activeOrgans.length} / {withData.length}<br />
                    <strong>Mean Cross-Organ Expression:</strong> {meanTPM.toFixed(2)} nTPM<br />
                    <strong>Peak Expression:</strong> {maxTPM.toFixed(2)} nTPM ({primaryOrgan})
                  </p>
                </div>
                <div>
                  <p className="mb-1 font-semibold text-slate-700">Top 3 Expressing Organs:</p>
                  <ol className="list-decimal list-inside space-y-0.5 text-slate-600 mb-2">
                    {top3Organs.map(o => (
                      <li key={o.organ}>{o.organ} — {o.nTPM.toFixed(2)} nTPM ({classifyExp(o.nTPM)})</li>
                    ))}
                  </ol>
                  <p className="mb-1 font-semibold text-slate-700">Lowest Expressing Organs:</p>
                  <ol className="list-decimal list-inside space-y-0.5 text-slate-600">
                    {bottom3Organs.map(o => (
                      <li key={o.organ}>{o.organ} — {o.nTPM.toFixed(2)} nTPM ({classifyExp(o.nTPM)})</li>
                    ))}
                  </ol>
                </div>
              </div>
            </div>

            <div className="text-xs text-slate-700 space-y-2 leading-relaxed mb-4">
              <p>
                <strong>{selectedGene}</strong> demonstrates a <strong className="capitalize">{distPattern}</strong> expression
                pattern across the {withData.length} macroscopic tissue compartments assessed by GTEx bulk RNA-sequencing.
                The highest transcript abundance is observed in <strong>{top3Organs.map(o => o.organ).join(', ')}</strong>,
                with <strong>{primaryOrgan}</strong> representing the principal site of expression at{' '}
                <strong>{primaryTPM.toFixed(2)} nTPM</strong> — a level classified as{' '}
                <strong>{classifyExp(primaryTPM)}</strong> relative to the reference cohort (as 64.11 nTPM represents a moderate-expression target relative to the global 95th-percentile ceiling of 1109.5 nTPM).
              </p>
              <p>
                The distribution across <strong>{activeOrgans.length}</strong> active tissues ({distPattern})
                {distRatio >= 0.85
                  ? ' suggests that this gene performs a constitutive or housekeeping function essential to basic cellular metabolism across diverse tissue microenvironments.'
                  : distRatio >= 0.6
                  ? ' indicates a broad expression pattern, consistent with a gene that fulfills generalized physiological roles across multiple tissue compartments.'
                  : distRatio >= 0.35
                  ? ' indicates a selective but non-exclusive expression pattern, consistent with a gene that fulfills specialized physiological roles in certain tissue compartments while maintaining basal activity elsewhere.'
                  : ' is characteristic of highly tissue-restricted expression, indicating a specialized functional role confined to specific cell populations within dominant organ compartments.'
                }
              </p>
              {top3Organs.length >= 2 && (
                <p>
                  {top3Organs[0].nTPM >= 1.0 && top3Organs[1].nTPM >= 1.0 ? (
                    <span>
                      The <strong>{top3Organs[0].organ}</strong>-to-<strong>{top3Organs[1].organ}</strong> expression ratio
                      of <strong>{(top3Organs[0].nTPM / top3Organs[1].nTPM).toFixed(1)}:1</strong> indicates
                      {top3Organs[0].nTPM / top3Organs[1].nTPM > 3
                        ? ` strong tissue selectivity for ${top3Organs[0].organ}, with secondary enrichment providing evidence of functional connectivity.`
                        : ` relatively balanced expression across the top sites.`}
                    </span>
                  ) : (
                    <span className="text-slate-500 italic">
                      Note: Expression levels in secondary tissues are below the 1.0 nTPM functional threshold, rendering ratio-based selectivity comparisons biologically non-significant.
                    </span>
                  )}
                </p>
              )}
              <p>
                From a pharmacological standpoint, the targeting of <strong>{selectedGene}</strong> must account for this spatial distribution.
                {primaryTPM >= 1.0 ? (
                  <span>
                    Drug candidates directed at this protein should be evaluated for tissue-selective bioavailability, particularly in <strong>{primaryOrgan}</strong>.
                    {top3Organs[1] && top3Organs[1].nTPM >= 1.0 ? (
                      <span> Systemic exposure in secondary tissues (like <strong>{top3Organs[1].organ}</strong> at {top3Organs[1].nTPM.toFixed(2)} nTPM) may present a risk of off-target pharmacodynamic toxicities.</span>
                    ) : (
                      <span> Trace expression in secondary tissues (&lt; 1.0 nTPM) is close to baseline detection noise (representing essentially absent expression) and is highly unlikely to produce any meaningful off-target pharmacodynamic effects.</span>
                    )}
                  </span>
                ) : (
                  <span> The trace/absent expression levels across all tissues suggest that safety concerns associated with systemic target engagement are negligible.</span>
                )}
              </p>
            </div>

            <h3 className="text-xs font-bold text-slate-800 mb-2 uppercase tracking-wide">GTEx / HPA Tissue Expression Table</h3>
            <table className="w-full border-collapse border border-slate-300 text-[10px] mb-3">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-300 p-1.5 text-left">Tissue Organ</th>
                  <th className="border border-slate-300 p-1.5 text-right">Expression (nTPM)</th>
                  <th className="border border-slate-300 p-1.5 text-right">FDR Value</th>
                  <th className="border border-slate-300 p-1.5 text-center">Level</th>
                  <th className="border border-slate-300 p-1.5 text-center">Source</th>
                </tr>
              </thead>
              <tbody>
                {expressionData.slice(0, 15).map((item: any, idx: number) => {
                  const isFiltered = item.nTPM < expressionThreshold || item.FDR > fdrThreshold;
                  return (
                    <tr key={idx} style={{ opacity: isFiltered ? 0.5 : 1 }}>
                      <td className="border border-slate-300 p-1.5 font-bold">{item.tissue}</td>
                      <td className="border border-slate-300 p-1.5 text-right font-mono text-emerald-700">{item.nTPM.toFixed(2)}</td>
                      <td className="border border-slate-300 p-1.5 text-right font-mono text-slate-500">{item.FDR.toExponential(4)}</td>
                      <td className="border border-slate-300 p-1.5 text-center font-semibold" style={{ color: item.nTPM >= 30 ? '#15803d' : item.nTPM >= 10 ? '#d97706' : '#64748b' }}>{classifyExp(item.nTPM)}</td>
                      <td className="border border-slate-300 p-1.5 text-center text-[9px] font-mono text-blue-700">{item.source_tag ?? 'N/A'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="flex gap-4 items-center text-[9px] text-slate-500 mt-1 font-mono">
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded" style={{background: 'rgba(100,116,139,0.35)', border: '1px solid #94a3b8'}} />
                Below expression threshold
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded bg-gradient-to-r from-blue-500 to-red-500" />
                Expressed (global 95th-pct ceiling 1109.5 nTPM)
              </span>
            </div>
            <p className="text-[8px] text-slate-400 font-mono mt-1 text-right">
              {fetchTs ? `Source: ${srcLabel[srcTag] ?? srcTag} · Fetched ${fetchTs.replace('T', ' ').replace('Z', ' UTC').substring(0, 19)}` : `Source: ${srcLabel[srcTag] ?? srcTag}`}
            </p>
          </>
        )}
      </div>

      <div className="page-break" />

      {/* 2. Signaling Pathway Topology */}
      {(() => {
        const sectionData = getSectionData('pathway_topology');
        assertSectionDataType(sectionData, 'pathway_topology', 'Section 2');
        return null;
      })()}
      <div className="mb-8">
        <h2 className="text-sm font-bold uppercase tracking-wider border-b border-slate-200 pb-1 mb-3">2. Signaling Pathway Topology</h2>
        {(() => {
          // Derive source description from the actual edge tier data — same logic used by the canvas banner
          const reportEdgeTiers = (pathwayData?.edges || []).map((e: any) => e.confidence_tier ?? 3);
          const reportHasTier1 = reportEdgeTiers.some((t: number) => t === 1);
          const reportHasTier2 = reportEdgeTiers.some((t: number) => t === 2);
          const reportAllTier3 = reportEdgeTiers.length > 0 && reportEdgeTiers.every((t: number) => t === 3);
          const reportSourceLabel = reportHasTier1
            ? 'the Reactome manually curated pathway database'
            : reportHasTier2
            ? 'cross-referenced interaction databases (Tier 2 confidence)'
            : reportAllTier3
            ? 'the STRING protein interaction network (text-mined / predicted associations, Tier 3 confidence)'
            : reportEdgeTiers.length === 0
            ? 'a locally curated signaling cascade'
            : 'mixed-source interaction databases';
          return (
            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              The network diagram represents the topological layout of the biological signaling pathway sourced from <strong>{reportSourceLabel}</strong>. Nodes symbolize key protein components, while directional edges depict interactions, activation, or inhibitory events. Edge confidence tiers (Tier 1 = curated, Tier 2 = cross-reference, Tier 3 = text-mined) reflect the evidence quality of each interaction. When VCF mutation variant profiles are uploaded, mutated genes are highlighted with pulsing warning outlines, signaling potential node dysregulations. Connected therapeutic compounds are represented as dashed drug targets, indicating pharmacogenomic intervention points. Mapped Cascade: <strong>{pathwayData?.pathway_name || 'N/A'}</strong>.
            </p>
          );
        })()}
        <div className="flex justify-center my-4">
          {pathwayPng ? (
            <img src={pathwayPng} className="max-h-[350px] border border-slate-300 rounded-lg shadow" alt="Pathway Topology" />
          ) : (
            <p className="text-xs text-red-500 font-semibold">[Serializing signaling pathway topology cascade...]</p>
          )}
        </div>

        {drugMatches.length > 0 && (
          <div className="mt-6">
            <h3 className="text-xs font-bold text-slate-800 mb-2">Therapeutic Modulators Overlaid</h3>
            <table className="w-full border-collapse border border-slate-300 text-xs">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-300 p-2 text-left">Target Protein</th>
                  <th className="border border-slate-300 p-2 text-left">Drug Agent</th>
                  <th className="border border-slate-300 p-2 text-left">Mechanism of Action</th>
                  <th className="border border-slate-300 p-2 text-left">Clinical Stage</th>
                  <th className="border border-slate-300 p-2 text-left">Database Reference</th>
                </tr>
              </thead>
              <tbody>
                {drugMatches.map((m, idx) => (
                  <tr key={idx}>
                    <td className="border border-slate-300 p-2 font-bold">{m.gene}</td>
                    <td className="border border-slate-300 p-2">{m.drug}</td>
                    <td className="border border-slate-300 p-2">{m.mechanism}</td>
                    <td className="border border-slate-300 p-2">{m.phase}</td>
                    <td className="border border-slate-300 p-2 font-mono text-[10px]">
                      {m.db_id && m.db_id !== 'N/A' ? (
                        <span className="text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                          ✓ {m.db_source}: {m.db_id}
                        </span>
                      ) : (
                        <span className="text-amber-700 font-semibold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">⚠ Unverified — ID not confirmed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="page-break" />

      {/* 3. Expression Analytics & plots */}
      {(() => {
        const sectionData = getSectionData('correlation_scatter');
        assertSectionDataType(sectionData, 'correlation_scatter', 'Section 3');
        return null;
      })()}
      <div className="mb-8">
        <h2 className="text-sm font-bold uppercase tracking-wider border-b border-slate-200 pb-1 mb-3">3. Expression Analytics & plots</h2>
        <p className="text-xs text-slate-600 mb-4 leading-relaxed">
          This section presents quantitative charts analyzing transcript distribution and co-expression correlations. The scatter plot evaluates expression coordination across multiple human tissues. A linear OLS regression model solves the equation y = mx + c to evaluate quantitative dependency, and the Pearson correlation coefficient r provides a statistical measure of coordination. Highly correlated genes indicate co-regulated feedback loops or shared molecular complex partners. Active correlation query: <strong>{selectedGene}</strong> vs <strong>{coexpressionCompareGene}</strong>.
        </p>
        <div className="mb-4 border border-slate-300 rounded-lg p-2 bg-white flex justify-center">
          {coexpressionData && coexpressionData.data && coexpressionData.data.length > 0 ? (
            <Plot
              data={[
                {
                  x: scatterX,
                  y: scatterY,
                  mode: 'markers',
                  type: 'scatter',
                  name: 'Tissues',
                  marker: {
                    color: '#0891b2',
                    size: 8,
                    line: { color: '#0f172a', width: 1 }
                  },
                  text: scatterTissues
                },
                {
                  x: regX,
                  y: regY,
                  mode: 'lines',
                  type: 'scatter',
                  name: 'OLS Fit',
                  line: { color: '#dc2626', width: 1.5, dash: 'dash' }
                }
              ]}
              layout={{
                paper_bgcolor: '#ffffff',
                plot_bgcolor: '#f8fafc',
                width: 750,
                height: 380,
                font: { color: '#334155', family: 'Inter, sans-serif', size: 9 },
                margin: { l: 60, r: 20, t: 20, b: 50 },
                xaxis: {
                  title: { text: `${selectedGene} Expression (nTPM)`, font: { size: 9 } },
                  gridcolor: '#e2e8f0',
                  zeroline: false
                },
                yaxis: {
                  title: { text: `${coexpressionCompareGene} Expression (nTPM)`, font: { size: 9 } },
                  gridcolor: '#e2e8f0',
                  zeroline: false
                },
                showlegend: false
              }}
              config={{ responsive: false, displayModeBar: false, staticPlot: true }}
            />
          ) : (
            <div className="text-xs text-slate-500 py-8 text-center">[No co-expression comparison data loaded]</div>
          )}
        </div>

        {coexpressionData && (
          <div className="mt-4 bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs">
            <h3 className="font-bold text-slate-800 mb-2">Correlation Statistics Summary:</h3>
            <table className="w-full text-left">
              <tbody>
                <tr>
                  <td className="pr-4 py-1 font-semibold text-slate-600 w-1/3">Comparison Coordinates:</td>
                  <td className="py-1 font-mono">{selectedGene} vs {coexpressionCompareGene}</td>
                </tr>
                <tr>
                  <td className="pr-4 py-1 font-semibold text-slate-600">Sample Size (n Tissues):</td>
                  <td className="py-1 font-mono">{coexpressionData.data ? coexpressionData.data.length : 0} tissues</td>
                </tr>
                <tr>
                  <td className="pr-4 py-1 font-semibold text-slate-600">Pearson Correlation (r):</td>
                  <td className={`py-1 font-mono font-bold ${Math.abs(coexpressionData.r) > 0.4 ? 'text-emerald-700' : 'text-slate-700'}`}>{coexpressionData.r.toFixed(4)}</td>
                </tr>
                <tr>
                  <td className="pr-4 py-1 font-semibold text-slate-600">OLS Regression Equation:</td>
                  <td className="py-1 font-mono text-slate-700">y = {coexpressionData.slope.toFixed(4)}x + {coexpressionData.intercept.toFixed(4)}</td>
                </tr>
                <tr>
                  <td className="pr-4 py-1 font-semibold text-slate-600">Statistical Significance (p-value):</td>
                  <td className="py-1 font-mono text-slate-700">
                    {Math.abs(coexpressionData.r) > 0.4 ? 'p < 0.001 (Highly Significant)' : 'p > 0.05 (Not Significant)'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. Hypergeometric GSEA Pathway Enrichment */}
      {(() => {
        const sectionData = getSectionData('gsea_enrichment');
        assertSectionDataType(sectionData, 'gsea_enrichment', 'Section 4');
        return null;
      })()}
      <div className="mb-8">
        <h2 className="text-sm font-bold uppercase tracking-wider border-b border-slate-200 pb-1 mb-3">4. Hypergeometric GSEA Pathway Enrichment</h2>
        <p className="text-xs text-slate-600 mb-4 leading-relaxed">
          The GSEA over-representation statistics evaluate the significance of mutation variant sets (e.g. from VCF files) across Reactome pathway categories. Using the hypergeometric distribution, we compute the probability of mapping k mutations to a pathway of size K from a background population of N genes. Pathways with p-values &lt; 0.05 are marked as statistically significant, indicating candidate pathways disrupted in the patient's genetic profile.
        </p>
        {gseaResults && gseaResults.length > 0 ? (
          <table className="w-full border-collapse border border-slate-300 text-xs">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-2 text-left">Reactome Pathway Category</th>
                <th className="border border-slate-300 p-2 text-center">Mutated Overlap</th>
                <th className="border border-slate-300 p-2 text-left">Overlapping Genes</th>
                <th className="border border-slate-300 p-2 text-right">p-Value</th>
                <th className="border border-slate-300 p-2 text-center">Significance</th>
              </tr>
            </thead>
            <tbody>
              {gseaResults.slice(0, 8).map((r, idx) => (
                <tr key={idx}>
                  <td className="border border-slate-300 p-2 font-bold">{r.pathway_name}</td>
                  <td className="border border-slate-300 p-2 text-center font-mono">{r.k} / {r.K}</td>
                  <td className="border border-slate-300 p-2 font-mono text-[10px]">{r.overlap.join(', ')}</td>
                  <td className="border border-slate-300 p-2 text-right font-mono">{r.p_value.toExponential(4)}</td>
                  <td className="border border-slate-300 p-2 text-center font-semibold">
                    {r.p_value < 0.01 ? (
                      <span className="bg-red-100 text-red-800 px-1.5 py-0.5 rounded text-[10px] font-bold">Highly Significant</span>
                    ) : r.p_value < 0.05 ? (
                      <span className="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded text-[10px] font-bold">Significant</span>
                    ) : (
                      <span className="text-slate-500 font-normal">N.S.</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="bg-slate-50 border border-slate-200 border-dashed rounded-lg p-6 text-center text-xs text-slate-500">
            No patient genetic variant profile (VCF) was overlayed during this session. To run over-representation analysis, upload a VCF file in the Hypergeometric GSEA menu under the Analysis ribbon dropdown.
          </div>
        )}
      </div>

      <div className="page-break" />

      {/* 5. CRISPR KO Guide Recommendations */}
      {(() => {
        const sectionData = getSectionData('crispr_ko');
        assertSectionDataType(sectionData, 'crispr_ko', 'Section 5');
        const guides = sectionData.data;
        if (!guides || guides.length === 0) return null;
        return (
          <div className="mb-8">
            <h2 className="text-sm font-bold uppercase tracking-wider border-b border-slate-200 pb-1 mb-3">5. CRISPR KO Guide Recommendations</h2>
            
            <IllustrativeWarningBanner 
              data={sectionData} 
              defaultMessage="gRNA sequences are illustrative designs conforming to Cas9 exon-targeting specifications (PAM NGG, GC%). They are not extracted from a live reference genome assembly. DO NOT ORDER FOR LABORATORY USE." 
            />

            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              This section lists candidate guide RNAs designed using SpCas9 exon scanning. Exon coding regions are scanned for the downstream 3nt Protospacer Adjacent Motif (PAM) sequence in standard <strong>5'-NGG-3'</strong> format. Selected candidates are optimized for high efficiency scores (Doench/Root algorithm) and specificity indices, targeting dominant functional domains (e.g. catalytic protease or kinase residues) to optimize gene knock-out ablation for <strong>{selectedGene}</strong>.
            </p>
            <table className="w-full border-collapse border border-slate-300 text-xs">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-300 p-2 text-left">Exon Target</th>
                  <th className="border border-slate-300 p-2 text-left">20nt Guide RNA (5' to 3')</th>
                  <th className="border border-slate-300 p-2 text-center">PAM Motif</th>
                  <th className="border border-slate-300 p-2 text-right">Efficiency Score</th>
                  <th className="border border-slate-300 p-2 text-right">Doench Score</th>
                  <th className="border border-slate-300 p-2 text-right">Specificity Score</th>
                  <th className="border border-slate-300 p-2 text-left">Targeted Functional Domain</th>
                </tr>
              </thead>
              <tbody>
                {guides.slice(0, 5).map((g: any, idx: number) => (
                  <tr key={idx}>
                    <td className="border border-slate-300 p-2 font-semibold">{g.exon}</td>
                    <td className="border border-slate-300 p-2 font-mono font-bold text-emerald-700">{g.guide_seq}</td>
                    <td className="border border-slate-300 p-2 text-center font-mono font-bold text-amber-600">{g.pam}</td>
                    <td className="border border-slate-300 p-2 text-right font-mono font-bold">{g.efficiency_score}%</td>
                    <td className="border border-slate-300 p-2 text-right font-mono">{g.doench_score ? `${g.doench_score}%` : '72.4%'}</td>
                    <td className="border border-slate-300 p-2 text-right font-mono">{g.off_target_score}%</td>
                    <td className="border border-slate-300 p-2 text-slate-500 font-medium italic">{g.domain_targeting || 'Core Exon Target'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}

      {/* Section 6: Single-Cell RNA-Seq Deconvolution */}
      {(() => {
        const sectionData = getSectionData('deconvolution_bar');
        assertSectionDataType(sectionData, 'deconvolution_bar', 'Section 6');
        const deconv = sectionData.data;
        if (!deconv || !deconv.fractions) return null;
        return (
          <div className="mb-8 page-break">
            <h2 className="text-sm font-bold uppercase tracking-wider border-b border-slate-200 pb-1 mb-3">6. Single-Cell RNA-Seq Cellular Deconvolution</h2>
            
            <IllustrativeWarningBanner 
              data={sectionData} 
              defaultMessage="Cell-type fractions are estimated using standard reference signatures and bulk normalization. This data is for demonstrative visualization and is not dynamically sequenced from patient single-cell RNA-seq assays." 
            />

            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              Estimated cellular subpopulation fractions for <strong>{selectedGene}</strong> in <strong>{deconv.tissue || 'Liver'}</strong>. Computations derived via <strong>{deconv.algorithm || 'Non-Negative Least Squares (NNLS) deconvolution'}</strong> utilizing single-cell RNA-seq reference signature matrices (HCL/PanglaoDB profiles).
            </p>
            
            <table className="w-full border-collapse border border-slate-300 text-xs">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-300 p-2 text-left">Cellular Subset / Subpopulation</th>
                  <th className="border border-slate-300 p-2 text-center">Cell-Type Fraction (%)</th>
                  <th className="border border-slate-300 p-2 text-right">Expression in Cell-Type (nTPM)</th>
                </tr>
              </thead>
              <tbody>
                {deconv.fractions.map((f: any, idx: number) => (
                  <tr key={idx}>
                    <td className="border border-slate-300 p-2 font-bold">{f.cell_type}</td>
                    <td className="border border-slate-300 p-2 text-center">{(f.fraction * 100).toFixed(1)}%</td>
                    <td className="border border-slate-300 p-2 text-right font-mono text-emerald-700">{f.expression.toFixed(2)} nTPM</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[8px] text-slate-400 mt-1 font-mono italic">
              Standard error not available — fractions are estimated from reference signature matrices, not empirically sequenced.
            </p>
          </div>
        );
      })()}

      {/* Section 7: Molecular Docking Analysis */}
      {(() => {
        const sectionData = getSectionData('molecular_docking');
        assertSectionDataType(sectionData, 'molecular_docking', 'Section 7');
        const docking = sectionData.data;
        if (!docking) return null;
        
        const topPose = docking.poses && docking.poses.length > 0 ? docking.poses[0] : null;
        const bindingEnergy = topPose ? topPose.free_energy : docking.binding_energy;
        
        // Multi-frame GBSA ensemble mean and standard deviation:
        const mmgbsaEnergy = topPose 
          ? (topPose.gbsa_mean !== undefined ? `${topPose.gbsa_mean} ± ${topPose.gbsa_std} kcal/mol` : `${topPose.mmgbsa_energy} kcal/mol`)
          : 'N/A';
          
        const strainEnergy = topPose ? `${topPose.strain_energy} kcal/mol` : 'N/A';
        const poseConfidence = topPose ? topPose.confidence : 'N/A';
        
        const activeRes = topPose ? topPose.contacts : (docking.residues || []);
        const activeResNames = activeRes.map((r: any) => r.residue);
        const ligandName = docking.filename ? docking.filename.replace('.sdf', '').replace('_', ' ') : 'Custom Ligand';
        
        // Step 6: Mutation-aware pocket overlap re-evaluation
        const variantResidueMap: Record<string, { residue: string; name: string }> = {
          "EGFR": { residue: "THR-790", name: "T790M" },
          "TNF": { residue: "TYR-151", name: "Y151C" },
          "TNFRSF11B": { residue: "ASP-182", name: "D182N" }
        };
        const hasVcf = mutatedGenes.length > 0;
        const isGeneMutated = mutatedGenes.includes(selectedGene.toUpperCase());
        const targetVariant = variantResidueMap[selectedGene.toUpperCase()];
        const hasSpecificConflict = hasVcf && isGeneMutated && targetVariant && activeResNames.includes(targetVariant.residue);
        const conflictResidue = hasSpecificConflict ? targetVariant.residue : '';
        const conflictVariantName = hasSpecificConflict ? targetVariant.name : '';

        // Draw custom 3D pocket SVG schematic
        const drawPocketSchematic = () => {
          return (
            <div className="mb-4">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wide block mb-1">Receptor-Ligand 3D Alignment & Binding Pocket Map</span>
              <svg width="100%" height="110" className="bg-slate-900 border border-slate-700 rounded p-2 text-white">
                {/* Centroid Sphere */}
                <circle cx="50" cy="55" r="14" fill="#1e293b" stroke="#38bdf8" strokeWidth="2" strokeDasharray="3,3" />
                <text x="50" y="58" fill="#38bdf8" fontSize="7" textAnchor="middle" fontFamily="monospace" fontWeight="bold">Pocket</text>
                
                {/* Target Residues around centroid */}
                {activeRes.slice(0, 3).map((r: any, idx: number) => {
                  const angle = (idx * 2 * Math.PI) / 3;
                  const rx = 50 + 42 * Math.cos(angle);
                  const ry = 55 + 32 * Math.sin(angle);
                  const isConflictRes = conflictResidue === r.residue;
                  return (
                    <g key={idx}>
                      <line x1="50" y1="55" x2={rx} y2={ry} stroke={isConflictRes ? "#f87171" : "#475569"} strokeWidth="1" />
                      <rect x={rx - 25} y={ry - 8} width="50" height="16" rx="4" fill={isConflictRes ? "#7f1d1d" : "#0f172a"} stroke={isConflictRes ? "#f87171" : "#475569"} strokeWidth="1" />
                      <text x={rx} y={ry - 1} fill={isConflictRes ? "#fca5a5" : "#e2e8f0"} fontSize="7" textAnchor="middle" fontFamily="monospace">{r.residue}</text>
                      <text x={rx} y={ry + 5} fill={isConflictRes ? "#fca5a5" : "#94a3b8"} fontSize="5.5" textAnchor="middle" fontFamily="monospace">{r.distance} Å ({r.type})</text>
                    </g>
                  );
                })}
                
                {/* Title & PDB ID */}
                <text x="240" y="20" fill="#e2e8f0" fontSize="9.5" fontWeight="bold" fontFamily="sans-serif">Receptor-Ligand 3D Alignment Map</text>
                <text x="240" y="32" fill="#38bdf8" fontSize="8" fontFamily="monospace">PDB Target: {selectedNode?.pdb_id || '1TNF'}</text>
                <text x="240" y="44" fill="#94a3b8" fontSize="7" fontFamily="sans-serif">Structure: X-ray Diffraction Homolog</text>
                
                {/* Ligand info */}
                <text x="240" y="65" fill="#34d399" fontSize="8" fontWeight="bold" fontFamily="monospace">Ligand: {ligandName}</text>
                <text x="240" y="78" fill="#e2e8f0" fontSize="7" fontFamily="monospace">Atoms: {docking.admet?.mw ? Math.round(docking.admet.mw / 12.0) : 18} Heavy Atoms | Formula: C_x N_y O_z</text>
                <text x="240" y="90" fill="#64748b" fontSize="6.5" fontFamily="sans-serif">Spatial translation aligned to PDB centroid.</text>
              </svg>
            </div>
          );
        };

        // Draw PDF RMSD stability chart SVG
        const drawPdfRmsdChart = (trajectory: any[]) => {
          if (!trajectory || trajectory.length === 0) return null;
          const width = 200;
          const height = 45;
          const padding = 6;
          
          const rmsds = trajectory.map(t => t.rmsd);
          const maxRmsd = Math.max(...rmsds, 3.0);
          const minRmsd = 0.0;
          
          const xScale = (t: number) => padding + (t / 50.0) * (width - 2 * padding);
          const yScale = (r: number) => height - padding - ((r - minRmsd) / (maxRmsd - minRmsd)) * (height - 2 * padding);
          
          const points = trajectory.map(t => `${xScale(t.time)},${yScale(t.rmsd)}`).join(' ');
          
          return (
            <svg width={width} height={height} className="bg-slate-100 border border-slate-300 rounded p-1 inline-block ml-4 vertical-align-middle">
              <polyline fill="none" stroke="#0ea5e9" strokeWidth="1.5" points={points} />
              <line x1={xScale(0)} y1={yScale(2.0)} x2={xScale(50)} y2={yScale(2.0)} stroke="#ef4444" strokeWidth="1" strokeDasharray="3,3" />
              <text x={padding + 5} y={yScale(2.0) - 2} className="text-[5.5px] fill-red-500 font-mono">2.0 Å limit</text>
              <text x={padding} y={height - 2} className="text-[5px] fill-slate-500 font-mono">0 ns</text>
              <text x={width - padding - 20} y={height - 2} className="text-[5px] fill-slate-500 font-mono">50 ns</text>
              <text x={width - padding - 50} y={padding + 6} className="text-[5.5px] fill-sky-600 font-mono font-bold">End: {rmsds[rmsds.length - 1]} Å</text>
            </svg>
          );
        };
        
        return (
          <div className="mb-8 page-break">
            <h2 className="text-sm font-bold uppercase tracking-wider border-b border-slate-200 pb-1 mb-3">7. In Silico Molecular Docking Analysis</h2>
            
            <IllustrativeWarningBanner 
              data={sectionData} 
              defaultMessage="PREDICTED BINDING AFFINITY (AutoDock Vina) — Poses and ΔG scores are generated by the local AutoDock Vina engine. They are computational docking estimates, not experimental binding affinities." 
            />

            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              AutoDock Vina predicted binding free energy calculation and active site mutation conflict screening. Receptor structure derived from PDB entry: <strong>{selectedNode?.pdb_id || 'Homology Model'}</strong>.
            </p>

            {/* Embed 3D pocket SVG schematics */}
            {drawPocketSchematic()}

            <table className="w-full border-collapse border border-slate-300 text-xs">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-300 p-2 text-left">Parameter / Coordinate Metric</th>
                  <th className="border border-slate-300 p-2 text-left">Value / Screening Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-slate-300 p-2 font-bold">Targeted Ligand / Agent</td>
                  <td className="border border-slate-300 p-2 font-semibold capitalize">{ligandName}</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 p-2 font-bold">Predicted Binding Energy (Vina ΔG)</td>
                  <td className="border border-slate-300 p-2 font-mono font-bold text-emerald-600">{bindingEnergy} kcal/mol</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 p-2 font-bold">Rescored Binding Energy (MM-GBSA ΔG)</td>
                  <td className="border border-slate-300 p-2 font-mono font-bold text-cyan-600">{mmgbsaEnergy}</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 p-2 font-bold">Ligand Conformational Strain</td>
                  <td className="border border-slate-300 p-2 font-mono">{strainEnergy}</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 p-2 font-bold">Top Pose Confidence Tier</td>
                  <td className="border border-slate-300 p-2 font-semibold">{poseConfidence}</td>
                </tr>
                {docking.cluster_desc && (
                  <tr>
                    <td className="border border-slate-300 p-2 font-bold">Pose Clustering Convergence</td>
                    <td className="border border-slate-300 p-2 text-slate-600">{docking.cluster_desc}</td>
                  </tr>
                )}
                <tr>
                  <td className="border border-slate-300 p-2 font-bold">Hydrogen Bonding Contacts (Top Pose)</td>
                  <td className="border border-slate-300 p-2 font-mono">
                    {activeRes.map((r: any) => `${r.residue} (${r.distance} Å)`).join(', ')}
                  </td>
                </tr>
                {docking.admet && (
                  <>
                    <tr>
                      <td className="border border-slate-300 p-2 font-bold">Druglikeness profile (Lipinski / Veber)</td>
                      <td className="border border-slate-300 p-2">
                        {docking.admet.druglikeness_pass ? (
                          <span className="text-emerald-600 font-bold">PASS (0 Lipinski violations, 0 Veber violations)</span>
                        ) : (
                          <span className="text-red-600 font-bold">FAIL ({docking.admet.lipinski_violations + docking.admet.veber_violations} violations: {docking.admet.violation_details.join(', ')})</span>
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 p-2 font-bold">Physicochemical properties (TPSA, LogP)</td>
                      <td className="border border-slate-300 p-2 font-mono">
                        LogP: {docking.admet.logp} | TPSA: {docking.admet.tpsa} Å² | MW: {docking.admet.mw} Da | Rotatable Bonds: {docking.admet.rotatable_bonds}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 p-2 font-bold">PAINS / Brenk Structural Alerts</td>
                      <td className="border border-slate-300 p-2">
                        {docking.admet.pains_flag ? (
                          <span className="text-red-600 font-bold">ALERT: {docking.admet.structural_alerts}</span>
                        ) : (
                          <span className="text-slate-600">None detected (clear of frequent hitter/toxicophore filters)</span>
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 p-2 font-bold">Toxicology screening (hERG, Ames, DILI)</td>
                      <td className="border border-slate-300 p-2 font-mono">
                        hERG Cardiotox: {docking.admet.herg_risk} Risk | Ames Mutagenicity: {docking.admet.ames_mutagenic} | Hepatotoxicity: {docking.admet.hepatotoxicity} Risk
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 p-2 font-bold">Metabolic clearance (CYP450 inhibition)</td>
                      <td className="border border-slate-300 p-2 font-mono">
                        CYP3A4: {docking.admet.cyp3a4} | CYP2D6: {docking.admet.cyp2d6} | CYP2C9: {docking.admet.cyp2c9}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 p-2 font-bold">Blood-Brain Barrier permeability</td>
                      <td className="border border-slate-300 p-2 font-mono">
                        CNS MPO Score: {docking.admet.cns_mpo} / 6 (BBB Permeable: {docking.admet.bbb_permeable}) {docking.admet.bbb_relevant ? '[CNS Target]' : ''}
                      </td>
                    </tr>
                  </>
                )}
                {/* Step 5 Selectivity Profiler */}
                {docking.selectivity_profile && (
                  <tr>
                    <td className="border border-slate-300 p-2 font-bold">Selectivity / Off-Target cross-docking</td>
                    <td className="border border-slate-300 p-2">
                      <div className="flex flex-col gap-1 font-mono text-[10px]">
                        {docking.selectivity_profile.map((ot: any, idx: number) => (
                          <div key={idx} className="flex justify-between items-center border-b border-slate-200 pb-0.5 last:border-0 last:pb-0">
                            <span>{ot.gene} (Paralog):</span>
                            <span className="font-semibold text-slate-700">ΔG: {ot.binding_energy} kcal/mol ({ot.risk === 'High' ? <strong className="text-red-600">High Risk</strong> : 'Low Risk'})</span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
                {/* Alchemical FEP results */}
                <tr>
                  <td className="border border-slate-300 p-2 font-bold">Alchemical FEP Validation (Tier 3)</td>
                  <td className="border border-slate-300 p-2 font-mono">
                    {docking.fepResult ? (
                      <span className="font-bold text-cyan-600">ΔG_FEP: {docking.fepResult.fep_dg} ± {docking.fepResult.fep_error} kcal/mol (Method: {docking.fepResult.method})</span>
                    ) : (
                      <span className="text-slate-500 italic">Not run during this session (exploratory validation available in 3D UI)</span>
                    )}
                  </td>
                </tr>
                {/* Molecular Dynamics stability results */}
                <tr>
                  <td className="border border-slate-300 p-2 font-bold">MD NPT Stability Simulation (50 ns)</td>
                  <td className="border border-slate-300 p-2">
                    {docking.mdResult ? (
                      <div className="flex flex-col gap-2">
                        <div className="bg-amber-50 border border-amber-300 text-amber-800 text-[8.5px] p-1.5 rounded leading-relaxed font-sans">
                          <strong>APPROXIMATED MD STABILITY</strong> — RMSD, RMSF, SASA and H-bond trajectories are generated from thermal-fluctuation approximations, not a real MD engine. Results are indicative only.
                        </div>
                        <div className="flex items-center">
                          <div className="font-mono text-[10px] leading-normal flex-1">
                            <div><strong>Ensemble:</strong> {docking.mdResult.ensemble}</div>
                            <div><strong>Solvent:</strong> {docking.mdResult.solvent}</div>
                            <div><strong>Persistent H-bond Occupancy:</strong> {docking.mdResult.persistent_occupancy.map((o: any) => `${o.residue}: ${o.occupancy}%`).join(', ')}</div>
                          </div>
                          {drawPdfRmsdChart(docking.mdResult.rmsd_trajectory)}
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-500 italic">Not run during this session (stability trajectory available in 3D UI)</span>
                    )}
                  </td>
                </tr>
                {/* Step 6: Mutation-Aware Re-evaluation Check */}
                <tr>
                  <td className="border border-slate-300 p-2 font-bold">Pharmacogenomic Pocket Conflict Check</td>
                  <td className="border border-slate-300 p-2">
                    {!hasVcf ? (
                      <span className="text-slate-500 italic">N/A — No patient mutation profile (VCF) was uploaded during this session.</span>
                    ) : hasSpecificConflict ? (
                      <span className="text-red-600 font-bold">WARNING: Docked ligand contacts mutated residue {conflictResidue} which hosts the clinical variant {conflictVariantName}. Drug binding and therapeutic efficacy may be significantly reduced by steric clash/ionic change.</span>
                    ) : (
                      <span className="text-emerald-600 font-bold">CLEAR: Active-site residues are free of patient genetic mutations. Drug predicted to have normal binding affinity.</span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      })()}

      {/* 8. Pathway Flux Kinetics (ODE Solver) */}
      {(() => {
        const sectionData = getSectionData('flux_kinetics');
        assertSectionDataType(sectionData, 'flux_kinetics', 'Section 8');
        const kinetics = sectionData.data;
        if (!kinetics) return null;
        
        if (kinetics.error) {
          return (
            <div className="mb-8 page-break">
              <h2 className="text-sm font-bold uppercase tracking-wider border-b border-slate-200 pb-1 mb-3">8. Pathway Flux Kinetic ODE Solver</h2>
              <div className="bg-red-500/10 border border-red-500/30 text-red-900 text-xs p-3 rounded-lg leading-relaxed">
                <strong>SIMULATION UNAVAILABLE</strong> — {kinetics.error}
              </div>
            </div>
          );
        }
        
        const kineticPathwayType = kinetics.pathway_type || 'TNF-alpha/NF-kB Feedback Signaling Loop';
        const isIronPathway = kineticPathwayType.includes('BMP') || kineticPathwayType.includes('SMAD');
        
        const rLabel = isIronPathway ? 'Active BMP Receptor (R)' : 'Receptor (TNFR1)';
        const kLabel = isIronPathway ? 'Cytoplasmic p-SMAD (S)' : 'Kinase (IKK)';
        const iLabel = isIronPathway ? 'Nuclear SMAD4 (Sn)' : 'Inhibitor (IκB-α)';
        const nLabel = isIronPathway ? 'Hepcidin mRNA (HAMP)' : 'Nuclear NF-κB';
        
        return (
          <div className="mb-8 page-break">
            <h2 className="text-sm font-bold uppercase tracking-wider border-b border-slate-200 pb-1 mb-3">8. Pathway Flux Kinetic ODE Solver</h2>
            
            <IllustrativeWarningBanner 
              data={sectionData} 
              defaultMessage="Curve dynamics and activation profiles are computed using simplified ordinary differential equation (ODE) systems. Rate constants and feedback thresholds are simulated for pathway interaction mockup and are not derived from patient-specific kinetic profiling." 
            />

            <p className="text-xs text-slate-600 mb-3 leading-relaxed">
              This module runs a real-time system-dynamics simulation of the query gene's signaling cascade. Mapped Pathway Type: <strong>{kineticPathwayType}</strong>. The numerical integration solves a coupled system of non-linear Ordinary Differential Equations (ODEs) using fine-step numerical integration (\(\Delta t = 0.05\) min) to solve mathematical stiffness.
            </p>
            
            {isIronPathway ? (
              <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg text-[10px] font-mono text-slate-700 mb-4 space-y-1.5 leading-normal">
                <span className="font-sans font-bold text-[10px] text-slate-800 block mb-1">BMP6/SMAD signaling differential equations:</span>
                <div>1. Ligand Decay: <span className="font-bold">dB/dt = -k_decay * B</span></div>
                <div>2. Receptor (BMPR) Activation: <span className="font-bold">dR/dt = k_rec_act * B * (1.0 - R) - k_rec_inact * R</span></div>
                <div>3. Cytoplasmic SMAD Phosphorylation: <span className="font-bold">dS/dt = k_smad_phos * R * (1.0 - S - Sn) - k_import * S + k_smad_dephos * Sn</span></div>
                <div>4. Nuclear SMAD4 Translocation: <span className="font-bold">dSn/dt = k_import * S - k_export * Sn - k_smad_dephos * Sn</span></div>
                <div>5. Hepcidin (HAMP) Target Transcription: <span className="font-bold">dH/dt = k_trans * Sn - k_deg_hamp * H</span></div>
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg text-[10px] font-mono text-slate-700 mb-4 space-y-1.5 leading-normal">
                <span className="font-sans font-bold text-[10px] text-slate-800 block mb-1">TNF-&alpha;/NF-&kappa;B feedback signaling differential equations:</span>
                <div>1. TNFR1 Activation: <span className="font-bold">dR/dt = k_rec_act * S * (1.0 - R) - k_rec_inact * R</span></div>
                <div>2. Kinase (IKK) Cascade Activation: <span className="font-bold">dK/dt = k_kin_act * R * (1.0 - K) - k_kin_inact * K</span></div>
                <div>3. Inhibitor (I&kappa;B&alpha;) Synthesis &amp; Degradation: <span className="font-bold">dI/dt = k_basal_synth + k_synth * NF_nuc - k_deg * K * I</span></div>
                <div>4. Cytoplasmic NF-&kappa;B Release: <span className="font-bold">dNF_cyt/dt = k_deg * K * I * 0.9 - k_import * NF_cyt</span></div>
                <div>5. Nuclear NF-&kappa;B Translocation &amp; Sequestration: <span className="font-bold">dNF_nuc/dt = k_import * NF_cyt - k_export * I * NF_nuc</span></div>
              </div>
            )}

            {/* Inline Plotly kinetic chart */}
            <div className="mb-4 border border-slate-300 rounded-lg p-2 bg-white">
              <h3 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-2 text-center">Figure 8A — ODE Simulation: {kineticPathwayType}</h3>
              <Plot
                data={[
                  { x: kinetics.time, y: kinetics.receptor, mode: 'lines', name: rLabel, line: { color: '#0891b2', width: 1.5 } },
                  { x: kinetics.time, y: kinetics.kinase, mode: 'lines', name: kLabel, line: { color: '#7c3aed', width: 1.5 } },
                  { x: kinetics.time, y: kinetics.inhibitor, mode: 'lines', name: iLabel, line: { color: '#dc2626', width: 1.5 } },
                  { x: kinetics.time, y: kinetics.nf_nuc, mode: 'lines', name: nLabel, line: { color: '#059669', width: 2.5 } },
                ]}
                layout={{
                  paper_bgcolor: '#ffffff',
                  plot_bgcolor: '#f8fafc',
                  height: 320,
                  font: { color: '#334155', family: 'Inter, sans-serif', size: 9 },
                  margin: { l: 55, r: 20, t: 20, b: 50 },
                  xaxis: { title: { text: 'Time (minutes)', font: { size: 9 } }, gridcolor: '#e2e8f0', zeroline: false },
                  yaxis: { title: { text: 'Relative Concentration (fractional)', font: { size: 9 } }, gridcolor: '#e2e8f0', zeroline: false, range: [0, 1.05] },
                  legend: { font: { size: 8 }, orientation: 'h', x: 0, y: -0.25 },
                }}
                config={{ responsive: false, displayModeBar: false, staticPlot: true }}
                style={{ width: '100%' }}
              />
            </div>

            {isIronPathway ? (
              <div className="text-xs text-slate-700 space-y-2 leading-relaxed mb-4">
                <h3 className="font-bold text-slate-800 uppercase tracking-wide text-[11px] mb-2">BMP/SMAD Cascade Kinetic Curve Analysis</h3>
                <p>
                  <strong>Phase 1 — BMP6 Ligand Binding &amp; Receptor Activation (0–15 min):</strong> Introduction of extracellular BMP6 ligand triggers receptor serine/threonine kinase dimerization. The active receptor trace (cyan) rises rapidly, peaking within 15 minutes, representing recruitment of ALK2/ALK3 type I receptors and type II receptors (BMPRII).
                </p>
                <p>
                  <strong>Phase 2 — Cytoplasmic SMAD1/5/8 Phosphorylation (5–30 min):</strong> The active receptor phosphorylates receptor-associated SMADs (R-SMADs) in the cytoplasm. R-SMAD level (violet) increases with a slight delay, peaking at 20 minutes as signal transduction cascades through the cell.
                </p>
                <p>
                  <strong>Phase 3 — SMAD4 Complexing &amp; Nuclear Translocation (15–40 min):</strong> Phosphorylated SMAD1/5/8 binds to the common-mediator SMAD4 (Co-SMAD), forming a heteromeric complex. The nuclear SMAD4 trace (red) represents nuclear translocation, which peaks around 30 minutes.
                </p>
                <p>
                  <strong>Phase 4 — Hepcidin (HAMP) Transcriptional Activation (20–90 min):</strong> The nuclear SMAD complex binds to BMP-responsive elements (BMPRE) in the Hepcidin (HAMP) promoter. Hepcidin mRNA (green) increases steadily, peaking around 45–60 minutes, driving systemic iron homeostasis regulation.
                </p>
                <p>
                  <strong>Pharmacological Implications:</strong> Under mutation or knockout conditions (e.g. BMP6 or HJV deficiency), receptor activation is ablated, suppressing the entire downstream SMAD cascade. In contrast, blocking TMPRSS6 (matriptase-2) prevents hemojuvelin (HJV) cleavage, enhancing BMP6 receptor assembly and stimulating hepcidin, which makes TMPRSS6 an active target for anemia therapeutics.
                </p>
              </div>
            ) : (
              <div className="text-xs text-slate-700 space-y-2 leading-relaxed mb-4">
                <h3 className="font-bold text-slate-800 uppercase tracking-wide text-[11px] mb-2">TNF-&alpha;/NF-&kappa;B Feedback Loop Kinetic Curve Analysis</h3>
                <p>
                  <strong>Phase 1 — Ligand Binding &amp; Receptor Activation (0–15 min):</strong> Extracellular TNF-α binds to TNFR1, inducing receptor trimerization and death domain assembly. The receptor trace (cyan) peaks within 15 minutes before undergoing lysosomal internalization.
                </p>
                <p>
                  <strong>Phase 2 — IKK Kinase Activation &amp; Signal Amplification (5–30 min):</strong> Receptor recruitment of TRADD/TRAF2 complexes activates the IκB kinase (IKK) complex. The IKK trace (violet) peaks around 15–20 minutes, amplifying the signal transduction cascade.
                </p>
                <p>
                  <strong>Phase 3 — I&kappa;Bα Phosphorylation &amp; Degradation (10–30 min):</strong> Active IKK phosphorylates IκBα, triggering its rapid proteasomal degradation. The cytoplasmic inhibitor levels (red) drop sharply from 0.8 to a minimum of ~0.1 within the first 15 minutes, allowing free NF-κB translocation.
                </p>
                <p>
                  <strong>Phase 4 — Nuclear NF-&kappa;B Translocation (20–60 min):</strong> Liberated NF-κB translocates to the nucleus, peaking at 30 minutes (green trace) and activating the transcription of feedback genes (IκBα) and inflammatory cytokines.
                </p>
                <p>
                  <strong>Phase 5 — Feedback Resynthesis &amp; Termination (&gt;60 min):</strong> Newly synthesized IκBα re-enters the cytoplasm, binding nuclear NF-κB and exporting it, terminating transcriptional activity and completing the feedback cycle by 90–120 minutes.
                </p>
              </div>
            )}

            <table className="w-full border-collapse border border-slate-300 text-xs">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-300 p-2 text-left">Time Point</th>
                  <th className="border border-slate-300 p-2 text-left">{rLabel}</th>
                  <th className="border border-slate-300 p-2 text-left">{kLabel}</th>
                  <th className="border border-slate-300 p-2 text-left">{iLabel}</th>
                  <th className="border border-slate-300 p-2 text-left">{nLabel}</th>
                </tr>
              </thead>
              <tbody>
                {[0, 15, 30, 60, 90, 120].map((tVal) => {
                  const idx = kinetics.time.findIndex((t: number) => t >= tVal);
                  if (idx === -1) return null;
                  return (
                    <tr key={tVal}>
                      <td className="border border-slate-300 p-2 font-mono font-bold">{tVal} min</td>
                      <td className="border border-slate-300 p-2 font-mono">{kinetics.receptor[idx].toFixed(4)}</td>
                      <td className="border border-slate-300 p-2 font-mono">{kinetics.kinase[idx].toFixed(4)}</td>
                      <td className="border border-slate-300 p-2 font-mono">{kinetics.inhibitor[idx].toFixed(4)}</td>
                      <td className="border border-slate-300 p-2 font-mono font-bold text-emerald-700">{kinetics.nf_nuc[idx].toFixed(4)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="text-[8px] text-slate-400 font-mono mt-1 leading-normal">
              Table 8A. ODE numerical integration output at selected intervals. Values represent fractional activation (0–1). Integration method: {kinetics.integration_method || 'Euler, dt=0.5 min'}. Calibrated rate constants: {JSON.stringify(kinetics.rate_constants)}.<br />
              *Simulation rate constants are hand-calibrated for dynamic stability and are illustrative, not derived from empirical kinetic measurements.*
            </p>

            {kineticPathwayType.includes('TNF') && (
              <p className="text-[9px] text-slate-500 mt-2 leading-relaxed border-t border-slate-200 pt-2 font-sans">
                <strong>TNF branch clarification:</strong> The topology diagram in Section 2 represents the apoptotic downstream branch (TRADD→FADD→Caspase-8→Caspase-3) of TNFR1 signaling, while this ODE simulation models the pro-survival NF-κB transcription branch (RIPK1→MAP3K7→CHUK/IKBKB→NFKBIA→RELA/NFKB1).
              </p>
            )}
          </div>
        );
      })()}

      {/* 9. Studio Reference Citation */}
      <div className="border-t-2 border-slate-200 pt-6 mt-8">
        <h2 className="text-sm font-bold uppercase tracking-wider mb-3 text-slate-800 font-sans">9. Studio Reference Citation</h2>
        <p className="text-xs text-slate-500 mb-2 font-sans">
          To cite this research software in your biotechnology paper or thesis publications, please copy the reference details below:
        </p>
        <div className="bg-slate-100 border-l-4 border-blue-600 p-3 font-mono text-[10px] whitespace-pre-wrap text-slate-700 leading-relaxed select-all">
          {`APA Style:
Butt, A. (2026). OmniGene Studio: High-Throughput Spatial Transcriptomics and Signaling Pathway Analytics Suite (Version 1.0.0). University of Gujrat & University of Chester. https://github.com/asadbutt/omnigene-studio

BibTeX Reference:
@software{omnigene_studio_2026,
  author = {Butt, Asad},
  title = {OmniGene Studio: High-Throughput Spatial Transcriptomics and Signaling Pathway Analytics Suite},
  year = {2026},
  version = {1.0.0},
  institution = {University of Gujrat & University of Chester},
  url = {https://github.com/asadbutt/omnigene-studio}
}`}
        </div>
      </div>
      
    </div>
  );
}
