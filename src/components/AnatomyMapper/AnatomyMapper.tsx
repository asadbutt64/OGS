import React from 'react';
import { useStore } from '../../store/store';
import { BookOpen, Activity, AlertTriangle, TrendingUp, Microscope, Dna, FlaskConical } from 'lucide-react';

// Maps organ display names to GTEx tissue keys
const ORGAN_TISSUE_MAP: Record<string, string> = {
  Brain: 'Brain - Cortex',
  Lungs: 'Lung',
  Heart: 'Heart - Left Ventricle',
  Liver: 'Liver',
  Kidneys: 'Kidney - Cortex',
  Spleen: 'Spleen',
  Stomach: 'Stomach',
  Pancreas: 'Pancreas',
  Intestines: 'Small Intestine - Terminal Ileum',
  Muscle: 'Muscle - Skeletal',
  Skin: 'Skin - Sun Exposed',
  Blood: 'Whole Blood',
};

// GTEx approximate sample counts per tissue (for weighted averaging context)
const TISSUE_SAMPLE_COUNTS: Record<string, number> = {
  'Muscle - Skeletal': 803,
  'Whole Blood': 755,
  'Skin - Sun Exposed': 701,
  'Lung': 578,
  'Liver': 226,
  'Heart - Left Ventricle': 432,
  'Kidney - Cortex': 89,
  'Brain - Cortex': 255,
  'Spleen': 241,
  'Stomach': 262,
  'Small Intestine - Terminal Ileum': 187,
  'Pancreas': 328,
};

function classifyExpression(nTPM: number): string {
  if (nTPM >= 100) return 'very high';
  if (nTPM >= 30) return 'high';
  if (nTPM >= 10) return 'moderate';
  if (nTPM >= 2) return 'low';
  return 'trace/absent';
}

function getDistributionPattern(activeCount: number, total: number): string {
  const ratio = activeCount / total;
  if (ratio >= 0.85) return 'ubiquitous (housekeeping)';
  if (ratio >= 0.6) return 'broadly expressed';
  if (ratio >= 0.35) return 'moderately tissue-restricted';
  if (ratio >= 0.15) return 'tissue-enriched';
  return 'highly tissue-specific';
}

export default function AnatomyMapper() {
  const { expressionData, selectedGene, expressionThreshold, fdrThreshold } = useStore();

  // -----------------------------------------------------------------------
  // Derive written anatomy content from live expression data
  // -----------------------------------------------------------------------
  const organStats = Object.entries(ORGAN_TISSUE_MAP).map(([organ, tissue]) => {
    const rec = expressionData.find(d => d.tissue === tissue);
    return { organ, tissue, nTPM: rec ? (rec as any).nTPM as number : null, source: (rec as any)?.source_tag ?? 'unknown' };
  });

  const withData = organStats.filter(o => o.nTPM !== null) as { organ: string; tissue: string; nTPM: number; source: string }[];
  const sorted = [...withData].sort((a, b) => b.nTPM - a.nTPM);
  const activeOrgans = withData.filter(o => o.nTPM >= expressionThreshold);
  const top3 = sorted.slice(0, 3);
  const bottom3 = [...sorted].reverse().slice(0, 3);
  const meanTPM = withData.length > 0 ? withData.reduce((a, b) => a + b.nTPM, 0) / withData.length : 0;
  const maxTPM = sorted[0]?.nTPM ?? 0;
  const distPattern = getDistributionPattern(activeOrgans.length, Object.keys(ORGAN_TISSUE_MAP).length);
  const primaryOrgan = top3[0]?.organ ?? 'unknown';
  const primaryTPM = top3[0]?.nTPM ?? 0;
  const sourceTag = withData[0]?.source ?? 'unknown';
  const fetchTs = expressionData[0] ? (expressionData[0] as any).fetch_timestamp ?? '' : '';

  const srcLabel: Record<string, string> = {
    mygene: 'MyGene.info / GTEx Portal v8',
    gtex: 'GTEx Portal v8',
    local: 'Local GTEx Cache',
    curated: 'Curated Override ⚠',
    none: 'No Data',
    unknown: 'Unknown',
  };

  if (expressionData.length === 0) {
    return (
      <div className="glass-panel rounded-xl h-full flex flex-col p-5 border border-studio-border overflow-y-auto">
        <div className="flex items-center gap-2 mb-4 border-b border-studio-border pb-3">
          <BookOpen className="w-4 h-4 text-studio-glowBlue" />
          <span className="text-sm font-semibold tracking-wide text-slate-200">Macroscopic Anatomy</span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-red-950/15 border border-red-500/20 rounded-lg">
          <AlertTriangle className="w-8 h-8 text-red-500 mb-2 animate-bounce" />
          <h3 className="text-xs font-bold text-red-400 uppercase tracking-wider">No Expression Data</h3>
          <p className="text-[10px] text-studio-textMuted mt-1 leading-relaxed max-w-xs">
            No transcriptomic data was returned for <strong>"{selectedGene}"</strong>. Search for a valid gene symbol to populate the anatomy summary.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-xl h-full flex flex-col border border-studio-border overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-studio-border bg-slate-900/40 flex-shrink-0">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-studio-glowBlue" />
          <span className="text-sm font-semibold tracking-wide text-slate-200">Macroscopic Anatomy</span>
        </div>
        <span className="text-[9px] font-mono text-studio-textMuted/60 bg-slate-950/60 px-2 py-0.5 rounded border border-studio-border/40">
          {selectedGene}
        </span>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">

        {/* Hero stats row */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-studio-glowBlue/8 border border-studio-glowBlue/20 rounded-lg p-2.5 flex flex-col items-center">
            <TrendingUp className="w-3.5 h-3.5 text-studio-glowBlue mb-1" />
            <span className="text-[9px] text-studio-textMuted uppercase font-bold tracking-wide">Primary Site</span>
            <span className="text-[11px] font-extrabold text-studio-glowBlue mt-0.5 text-center leading-tight">{primaryOrgan}</span>
            <span className="text-[8px] font-mono text-slate-400">{primaryTPM.toFixed(1)} nTPM</span>
          </div>
          <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-lg p-2.5 flex flex-col items-center">
            <Activity className="w-3.5 h-3.5 text-emerald-400 mb-1" />
            <span className="text-[9px] text-studio-textMuted uppercase font-bold tracking-wide">Distribution</span>
            <span className="text-[10px] font-extrabold text-emerald-400 mt-0.5 text-center leading-tight capitalize">{distPattern}</span>
          </div>
          <div className="bg-violet-500/8 border border-violet-500/20 rounded-lg p-2.5 flex flex-col items-center">
            <Microscope className="w-3.5 h-3.5 text-violet-400 mb-1" />
            <span className="text-[9px] text-studio-textMuted uppercase font-bold tracking-wide">Mean nTPM</span>
            <span className="text-[11px] font-extrabold text-violet-400 mt-0.5">{meanTPM.toFixed(1)}</span>
            <span className="text-[8px] font-mono text-slate-400">across organs</span>
          </div>
        </div>

        {/* Primary written description */}
        <div className="bg-slate-900/60 border border-studio-border/60 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-1.5 mb-1">
            <Dna className="w-3.5 h-3.5 text-studio-glowCyan flex-shrink-0" />
            <span className="text-[10px] font-bold text-slate-200 uppercase tracking-wider">Spatial Transcriptomic Profile</span>
          </div>
          <p className="text-[10px] text-slate-300 leading-relaxed">
            <strong className="text-studio-glowBlue">{selectedGene}</strong> exhibits a{' '}
            <strong className="text-slate-200">{distPattern}</strong> expression pattern across major human organ systems,
            with peak transcript abundance detected in{' '}
            <strong className="text-studio-glowCyan">{top3.map(t => t.organ).join(', ')}</strong>{' '}
            (reaching {classifyExpression(maxTPM)} levels of{' '}
            <strong className="text-emerald-400">{maxTPM.toFixed(1)} nTPM</strong> in {primaryOrgan}).
          </p>
          <p className="text-[10px] text-slate-300 leading-relaxed">
            Of the {Object.keys(ORGAN_TISSUE_MAP).length} macroscopic organ compartments surveyed,{' '}
            <strong className="text-slate-100">{activeOrgans.length}</strong> show expression above the
            active threshold of {expressionThreshold} nTPM, while the lowest detectable levels occur in{' '}
            <strong className="text-slate-400">{bottom3.map(t => t.organ).join(', ')}</strong>.
            The mean cross-organ expression of {meanTPM.toFixed(2)} nTPM is consistent with a gene that{' '}
            {meanTPM > 20 ? 'plays a constitutive, systemic role' : meanTPM > 5 ? 'is selectively upregulated in target tissues' : 'is expressed at low basal levels with likely inducible regulation'}.
          </p>
          {top3.length >= 2 && (
            <p className="text-[10px] text-slate-300 leading-relaxed">
              The co-enrichment of transcript signal in{' '}
              <strong className="text-slate-200">{top3[0].organ}</strong> ({top3[0].nTPM.toFixed(1)} nTPM) and{' '}
              <strong className="text-slate-200">{top3[1].organ}</strong> ({top3[1].nTPM.toFixed(1)} nTPM){' '}
              suggests functional relevance to the physiological processes governing these compartments,
              and may inform tissue-targeted delivery strategies for pharmacological intervention.
            </p>
          )}
        </div>

        {/* Top organs ranked list */}
        <div>
          <span className="text-[9px] text-studio-textMuted font-bold uppercase tracking-wider block mb-1.5 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> Top Expressing Organs
          </span>
          <div className="space-y-1">
            {sorted.slice(0, 6).map((item, idx) => {
              const pct = maxTPM > 0 ? (item.nTPM / maxTPM) * 100 : 0;
              const hue = Math.round(120 - (pct / 100) * 120);
              return (
                <div key={item.organ} className="flex items-center gap-2 text-[10px]">
                  <span className="w-3 text-studio-textMuted font-mono text-right flex-shrink-0">{idx + 1}.</span>
                  <span className="w-20 flex-shrink-0 text-slate-300 font-semibold truncate">{item.organ}</span>
                  <div className="flex-1 h-1.5 bg-slate-900 rounded-full overflow-hidden border border-studio-border/30">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, background: `hsla(${hue}, 80%, 55%, 0.85)` }}
                    />
                  </div>
                  <span className="w-16 text-right font-mono text-slate-400 flex-shrink-0">{item.nTPM.toFixed(1)} nTPM</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Clinical relevance note */}
        <div className="bg-amber-500/6 border border-amber-500/20 rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <FlaskConical className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
            <span className="text-[9px] font-bold text-amber-300 uppercase tracking-wider">Pharmacological Relevance</span>
          </div>
          <p className="text-[10px] text-slate-300 leading-relaxed">
            High expression in <strong className="text-amber-300">{primaryOrgan}</strong> positions{' '}
            <strong>{selectedGene}</strong> as a candidate therapeutic target in{' '}
            {primaryOrgan.toLowerCase()}-associated pathologies. Drug bioavailability modelling should
            account for the {distPattern} pattern to assess off-target risk in secondary tissues,
            particularly {top3[1]?.organ ?? 'adjacent organs'} where transcript levels are similarly elevated.
            Expression data sourced from <strong className="text-slate-300">{srcLabel[sourceTag] ?? sourceTag}</strong>
            {fetchTs ? ` (fetched ${fetchTs.replace('T', ' ').replace('Z', ' UTC').substring(0, 19)})` : ''}.
          </p>
        </div>

      </div>
    </div>
  );
}
