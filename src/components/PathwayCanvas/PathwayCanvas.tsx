// ─── Topology-driven layout ────────────────────────────────────────────────────
// Pure client-side Sugiyama-style layered layout.
// Input: nodes with topo_depth, directed edges.
// Output: {id → {x,y}} positions where deeper nodes are further down.
function computeLayeredLayout(
  nodes: { id: string; topo_depth?: number }[],
  edges: { source: string; target: string }[],
  centerGeneId: string
): Record<string, { x: number; y: number }> {
  if (!nodes.length) return {};

  // 1. Group by depth layer
  const layers: Record<number, string[]> = {};
  nodes.forEach(n => {
    const d = (n as any).topo_depth ?? 0;
    (layers[d] = layers[d] || []).push(n.id);
  });

  // 2. Within each layer, sort: center gene first, then alphabetically
  Object.values(layers).forEach(arr =>
    arr.sort((a, b) => (a === centerGeneId ? -1 : b === centerGeneId ? 1 : a.localeCompare(b)))
  );

  // 3. Assign x,y — Y driven by depth, X spread horizontally within layer
  const NODE_W = 210, NODE_H = 110;
  const positions: Record<string, { x: number; y: number }> = {};
  const maxDepth = Math.max(...Object.keys(layers).map(Number));

  Object.entries(layers).forEach(([depthStr, ids]) => {
    const depth = Number(depthStr);
    const y     = depth * NODE_H;
    const totalW = ids.length * NODE_W;
    ids.forEach((id, i) => {
      positions[id] = { x: i * NODE_W - totalW / 2 + NODE_W / 2 + 260, y };
    });
  });

  return positions;
}

// ─── Relation-type → visual config ───────────────────────────────────────────
function edgeVisual(relationType: string, tier: number, isDirected: boolean, mutedBoth: boolean) {
  const r = (relationType || '').toLowerCase();
  const isInhib = r.includes('inhibit') || r.includes('repress') || r.includes('suppress') || r.includes('prevent') || r.includes('cleavage');
  const isAssoc = r === 'association' || !isDirected;

  let stroke: string, strokeW: number, dasharray: string | undefined, animated: boolean;
  let labelColor: string, borderColor: string, labelText: string;

  if (isAssoc) {
    // STRING / undirected — no arrow, grey, dotted
    stroke = mutedBoth ? 'rgba(239,68,68,0.35)' : 'rgba(148,163,184,0.22)';
    strokeW = 1.1; dasharray = '3,6'; animated = false;
    labelColor = '#475569'; borderColor = 'rgba(71,85,105,0.2)';
    labelText = `Assoc (${tier === 3 ? 'STRING' : 'T' + tier})`;
  } else if (tier === 1) {
    strokeW = 2.5; animated = true; dasharray = undefined;
    stroke       = mutedBoth ? '#EF4444' : isInhib ? 'rgba(239,68,68,0.85)' : 'rgba(99,179,237,0.9)';
    labelColor   = isInhib ? '#FCA5A5' : '#93C5FD';
    borderColor  = isInhib ? 'rgba(239,68,68,0.25)' : 'rgba(59,130,246,0.25)';
    labelText    = isInhib ? `${relationType} ⊣` : `${relationType} →`;
  } else if (tier === 2) {
    strokeW = 1.8; animated = true; dasharray = '6,4';
    stroke       = mutedBoth ? 'rgba(239,68,68,0.7)' : isInhib ? 'rgba(239,68,68,0.6)' : 'rgba(99,179,237,0.65)';
    labelColor   = isInhib ? '#FCA5A5' : '#7DD3FC';
    borderColor  = isInhib ? 'rgba(239,68,68,0.2)' : 'rgba(59,130,246,0.2)';
    labelText    = isInhib ? `${relationType} ⊣` : `${relationType} →`;
  } else {
    strokeW = 1.2; dasharray = '2,5'; animated = false;
    stroke       = mutedBoth ? 'rgba(239,68,68,0.4)' : isInhib ? 'rgba(239,68,68,0.3)' : 'rgba(148,163,184,0.28)';
    labelColor   = '#64748B'; borderColor = 'rgba(100,116,139,0.2)';
    labelText    = `T3 (${relationType || 'interaction'})`;
  }

  return { stroke, strokeW, dasharray, animated, labelColor, borderColor, labelText, isInhib, isAssoc };
}

import React, { useEffect, useState, useCallback, useRef } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  NodeProps,
  EdgeProps,
  Edge,
  Node,
  MarkerType,
  ReactFlowProvider,
  useReactFlow,
  useNodesState,
  useEdgesState,
  getBezierPath,
  EdgeLabelRenderer,
  BaseEdge,
  BackgroundVariant,
  SelectionMode
} from 'reactflow';
import 'reactflow/dist/style.css';
import { toPng } from 'html-to-image';
import { useStore } from '../../store/store';
import {
  GitBranch, BookOpen, ExternalLink, X, AlertTriangle, Cpu,
  Lock, Unlock, LayoutGrid, Maximize2,
  FlaskConical, Pill, Dna, Zap, Target, Activity,
  ChevronRight, Atom, RefreshCw,
  CircleDot
} from 'lucide-react';
import ProteinViewer from './ProteinViewer';

// Static NODE_POSITIONS removed — layout is now computed from topo_depth via computeLayeredLayout().

// ─── Type resolver ────────────────────────────────────────────────────────────
const resolveSingleType = (type: string): string => {
  if (!type) return 'Protein';
  const first = type.split('/')[0].split('-')[0].split(' ')[0].trim();
  if (first.toLowerCase() === 'transcription') return 'Transcription Factor';
  if (first.toLowerCase() === 'kinase') return 'Kinase';
  return first;
};

// ─── Type → visual config ─────────────────────────────────────────────────────
interface NodeVisual {
  border: string;
  bg: string;
  ring: string;
  badge: string;
  badgeText: string;
  icon: React.ReactNode;
  shape: string; // extra Tailwind shape classes
}

const getNodeVisual = (type: string, isMutated: boolean): NodeVisual => {
  if (isMutated) {
    return {
      border: 'border-red-500',
      bg: 'bg-red-950/50',
      ring: 'ring-red-500/40',
      badge: 'bg-red-500/20 text-red-300 border-red-500/30',
      badgeText: 'MUTANT',
      icon: <AlertTriangle className="w-3.5 h-3.5 text-red-400" />,
      shape: 'rounded-xl',
    };
  }
  switch (resolveSingleType(type)) {
    case 'Ligand':
      return {
        border: 'border-emerald-400/70',
        bg: 'bg-emerald-950/40',
        ring: 'ring-emerald-400/20',
        badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
        badgeText: 'LIGAND',
        icon: <FlaskConical className="w-3.5 h-3.5 text-emerald-400" />,
        shape: 'rounded-3xl',
      };
    case 'Receptor':
      return {
        border: 'border-cyan-400/70',
        bg: 'bg-cyan-950/40',
        ring: 'ring-cyan-400/20',
        badge: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25',
        badgeText: 'RECEPTOR',
        icon: <Target className="w-3.5 h-3.5 text-cyan-400" />,
        shape: 'rounded-xl border-[2.5px]',
      };
    case 'Adaptor':
      return {
        border: 'border-purple-400/70',
        bg: 'bg-purple-950/40',
        ring: 'ring-purple-400/20',
        badge: 'bg-purple-500/15 text-purple-300 border-purple-500/25',
        badgeText: 'ADAPTOR',
        icon: <Atom className="w-3.5 h-3.5 text-purple-400" />,
        shape: 'rounded-lg',
      };
    case 'Kinase':
      return {
        border: 'border-amber-400/70',
        bg: 'bg-amber-950/40',
        ring: 'ring-amber-400/20',
        badge: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
        badgeText: 'KINASE',
        icon: <Zap className="w-3.5 h-3.5 text-amber-400" />,
        shape: 'rounded-xl',
      };
    case 'Transcription Factor':
      return {
        border: 'border-yellow-400/70',
        bg: 'bg-yellow-950/40',
        ring: 'ring-yellow-400/20',
        badge: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/25',
        badgeText: 'TF',
        icon: <Dna className="w-3.5 h-3.5 text-yellow-400" />,
        shape: 'rounded-xl',
      };
    case 'Phenotype':
      return {
        border: 'border-red-400/50 border-dashed',
        bg: 'bg-slate-900/80',
        ring: 'ring-red-400/10',
        badge: 'bg-red-500/10 text-red-400 border-red-500/20',
        badgeText: 'OUTCOME',
        icon: <Activity className="w-3.5 h-3.5 text-red-400" />,
        shape: 'rounded-3xl',
      };
    default:
      return {
        border: 'border-slate-500/60',
        bg: 'bg-slate-900/80',
        ring: 'ring-slate-500/10',
        badge: 'bg-slate-700/50 text-slate-400 border-slate-600/30',
        badgeText: 'PROTEIN',
        icon: <CircleDot className="w-3.5 h-3.5 text-slate-400" />,
        shape: 'rounded-xl',
      };
  }
};

// ─── BioNode ──────────────────────────────────────────────────────────────────
const BioNode = ({ data }: NodeProps) => {
  const { label, type, pdb_id, isMutated, isSelected, isLowConfidence } = data;
  const isUnresolved = !label || label === 'Unresolved node — data unavailable';

  if (isUnresolved) {
    return (
      <div className="px-3.5 py-2.5 border-2 border-dashed border-slate-600/50 bg-slate-900/80 rounded-xl min-w-[10rem] select-none shadow">
        <Handle type="target" position={Position.Top} className="!bg-slate-600 !w-2 !h-2 !border-0" />
        <div className="flex items-center gap-2 text-slate-500">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600/70 shrink-0" />
          <div>
            <span className="text-[10px] text-amber-600/70 font-semibold block">Unresolved node</span>
            <span className="text-[9px] text-slate-600 italic">Data unavailable</span>
          </div>
        </div>
        <Handle type="source" position={Position.Bottom} className="!bg-slate-600 !w-2 !h-2 !border-0" />
      </div>
    );
  }

  const vis = getNodeVisual(type, isMutated);

  return (
    <div
      className={`
        relative border-2 ${vis.border} ${vis.bg} ${vis.shape}
        px-4 py-3 min-w-[11rem] max-w-[16rem] select-none shadow-lg backdrop-blur-sm
        transition-all duration-150
        ${isSelected ? `ring-2 ring-offset-1 ring-offset-slate-950 ${vis.ring} ring-opacity-80 shadow-lg` : ''}
        ${isMutated ? 'animate-pulse' : ''}
        ${isLowConfidence ? 'opacity-50 scale-95' : ''}
      `}
    >
      {/* Low-confidence badge — shown for STRING nodes below 0.5 */}
      {isLowConfidence && (
        <div className="absolute -top-2 -right-1 text-[7px] font-bold text-slate-500 bg-slate-900 border border-slate-700/50 px-1 py-0.5 rounded-full">
          low conf.
        </div>
      )}
      <Handle type="target" position={Position.Top} className="!bg-slate-400/60 !w-2 !h-2 !border-0 !-top-1" />

      <div className="flex flex-col gap-1.5">
        {/* Header row: icon + name */}
        <div className="flex items-center gap-2">
          <div className="shrink-0">{vis.icon}</div>
          <span className="font-extrabold text-[13px] text-slate-100 font-mono tracking-tight leading-tight truncate">
            {label}
          </span>
        </div>

        {/* Type badge + PDB */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${vis.badge}`}>
            {vis.badgeText}
          </span>
          {pdb_id && (
            <span className="text-[8px] text-slate-500 font-mono bg-slate-800/60 px-1.5 py-0.5 rounded border border-slate-700/40">
              PDB {pdb_id}
            </span>
          )}
        </div>

        {/* Mutation warning */}
        {isMutated && (
          <div className="flex items-center gap-1 text-[9px] text-red-300 font-bold bg-red-500/15 px-2 py-0.5 rounded border border-red-500/20 mt-0.5">
            <AlertTriangle className="w-2.5 h-2.5 text-red-400 shrink-0" />
            <span>VARIANT DETECTED</span>
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-slate-400/60 !w-2 !h-2 !border-0 !-bottom-1" />
    </div>
  );
};

// ─── DrugNode ─────────────────────────────────────────────────────────────────
const DrugNode = ({ data }: NodeProps) => {
  const { label, phase, db_id, db_source } = data;
  const isVerified = db_id && db_id !== 'N/A';

  return (
    <div className="relative border-2 border-dashed border-emerald-500/60 bg-slate-950/95 rounded-2xl px-3.5 py-2.5 min-w-[12rem] max-w-[16rem] select-none shadow-xl backdrop-blur-md">
      <Handle type="target" position={Position.Left} className="!bg-emerald-500/50 !w-2 !h-2 !border-0 !left-[-4px]" />

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <Pill className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="font-bold text-[12px] text-slate-100 font-sans leading-tight truncate">{label}</span>
        </div>
        <span className="text-[8.5px] uppercase tracking-wider text-emerald-400/80 font-mono truncate leading-snug">
          {phase}
        </span>
        {isVerified ? (
          <span
            className="text-[7.5px] font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 px-1.5 py-0.5 rounded font-mono truncate"
            title={`${db_source}: ${db_id}`}
          >
            ✓ {db_source}: {db_id}
          </span>
        ) : db_id ? (
          <span className="text-[7.5px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/25 px-1.5 py-0.5 rounded font-mono truncate">
            ⚠ Unverified
          </span>
        ) : null}
      </div>

      <Handle type="source" position={Position.Right} className="!bg-emerald-500/50 !w-2 !h-2 !border-0 !right-[-4px]" />
    </div>
  );
};

// ─── GroupNode ────────────────────────────────────────────────────────────────
const GroupNode = ({ data }: NodeProps) => (
  <div className="w-full h-full rounded-2xl bg-slate-800/5 border border-slate-600/10 p-4 flex flex-col justify-start select-none pointer-events-none">
    <span className="text-[9px] uppercase font-bold tracking-widest text-slate-600/70 font-mono">
      {data.label}
    </span>
  </div>
);

// ─── Custom Edge with floating label chip ──────────────────────────────────────
const CustomEdge = ({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  data, markerEnd, style
}: EdgeProps) => {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        {data?.label && (
          <div
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }}
            className="absolute pointer-events-none nodrag nopan"
          >
            <span
              className="text-[7.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full border select-none whitespace-nowrap"
              style={{
                background: '#0F172A',
                color: data.labelColor || '#94A3B8',
                borderColor: data.borderColor || 'rgba(148,163,184,0.2)',
                opacity: 0.92,
              }}
            >
              {data.label}
            </span>
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
};

// ─── Node/Edge type registrations ─────────────────────────────────────────────
const nodeTypes = { bioNode: BioNode, drugNode: DrugNode, groupNode: GroupNode };
const edgeTypes = { customEdge: CustomEdge };

// ─── Legend pill config ────────────────────────────────────────────────────────
const LEGEND_ITEMS = [
  { key: 'Ligand',              color: '#34D399', label: 'Ligand',              dot: 'rounded-full' },
  { key: 'Receptor',            color: '#22D3EE', label: 'Receptor',            dot: 'rounded-sm border-2' },
  { key: 'Kinase',              color: '#FBBF24', label: 'Kinase',              dot: 'rounded-lg' },
  { key: 'Transcription Factor',color: '#FDE047', label: 'Transcription Factor',dot: 'rounded-sm' },
  { key: 'Adaptor',             color: '#C084FC', label: 'Adaptor',             dot: 'rounded' },
  { key: 'Therapeutic Drug',    color: '#4ADE80', label: 'Therapeutic Drug',    dot: 'rounded-full border-dashed border-2' },
  { key: 'Variant Mutation',    color: '#F87171', label: 'Variant Mutation',    dot: 'rounded-full animate-pulse' },
];

// ─── Main inner component ──────────────────────────────────────────────────────
function PathwayCanvasInner() {
  const reactFlowInstance = useReactFlow();

  const {
    pathwayData, mutatedGenes, selectedNode, setSelectedNode,
    isLoading, selectedGene, pubmedFeed, fetchPubmedFeed,
    pathwayExportTrigger, showDrugs, setShowDrugs, drugsByGene,
    crisprGuides, fetchCrisprGuides, isPrintingReportOpen,
    dbVersion, sourceTag, fetchTimestamp,
  } = useStore();

  // ── Local UI state ──────────────────────────────────────────────────────────
  const [isFullScreen, setIsFullScreen]           = useState(false);
  const [drawerTab, setDrawerTab]                 = useState<'details' | 'crispr'>('details');
  const [selectedLegendClass, setSelectedLegendClass] = useState<string | null>(null);
  const [isLocked, setIsLocked]                   = useState(false);
  const [showMinimap, setShowMinimap]             = useState(true);
  const [rfNodes, setRfNodes, onNodesChange]       = useNodesState([]);
  const [rfEdges, setRfEdges, onEdgesChange]       = useEdgesState([]);
  // Track whether we have already seeded positions for the current pathway
  const seededPathwayRef = useRef<string | null>(null);

  const unresolvedNodes = pathwayData?.nodes?.filter(n =>
    !n.name || String(n.name).trim() === '' || String(n.name).includes('Unresolved') || String(n.name).includes('data unavailable')
  ) || [];

  // Reset drawer tab when selection changes
  useEffect(() => { setDrawerTab('details'); }, [selectedNode]);

  // ── Build and inject React Flow nodes/edges whenever pathway data changes ──
  useEffect(() => {
    if (!pathwayData) {
      setRfNodes([]);
      setRfEdges([]);
      seededPathwayRef.current = null;
      return;
    }

    // ── Guard: filter nodes missing valid gene symbol ──────────────────────
    const seenIds = new Set<string>();
    const validNodes = pathwayData.nodes.filter(node => {
      if (!node || node.id == null || String(node.id).trim() === ''
        || node.name == null || String(node.name).trim() === '') return false;
      const uid = node.id.toUpperCase().trim();
      if (seenIds.has(uid)) return false;
      seenIds.add(uid);
      return true;
    });
    const validNodeIds = new Set(validNodes.map(n => n.id.toUpperCase()));
    const validEdges   = pathwayData.edges.filter(e =>
      e && e.source?.trim() && e.target?.trim() &&
      validNodeIds.has(e.source.toUpperCase()) &&
      validNodeIds.has(e.target.toUpperCase())
    );

    const selectedGeneUpper = selectedGene.toUpperCase();
    const isNewPathway      = seededPathwayRef.current !== pathwayData.pathway_name;

    // ── Nodes ──────────────────────────────────────────────────────────────
    // ── Topology-driven positions (computed once per new pathway) ──────────
    const topoPositions = isNewPathway
      ? computeLayeredLayout(validNodes, validEdges, selectedGeneUpper)
      : {};

    const newFlowNodes: Node[] = validNodes.map(node => {
      const isMutated  = mutatedGenes.includes(node.id.toUpperCase());
      const isSelected = selectedNode?.id === node.id;

      // Preserve user-dragged positions; seed from topo layout on new pathway
      const existingNode = isNewPathway ? null : rfNodes.find(n => n.id === node.id);
      const pos = existingNode?.position ?? topoPositions[node.id] ?? { x: 260, y: 300 };

      const safeLabel   = (node.name && String(node.name).trim()) || 'Unresolved node — data unavailable';
      const isLowConf   = !!(node as any).is_low_confidence;
      return {
        id: node.id, type: 'bioNode',
        position: pos, draggable: !isLocked,
        data: { label: safeLabel, type: node.type || 'Protein', pdb_id: node.pdb_id,
                isMutated, isSelected, isLowConfidence: isLowConf },
      };
    });

    // ── Drug nodes ─────────────────────────────────────────────────────────
    const newFlowEdges: Edge[] = [];

    if (showDrugs) {
      validNodes.forEach(node => {
        const drugs = drugsByGene[node.id.toUpperCase()] || [];
        const base  = newFlowNodes.find(n => n.id === node.id)?.position ?? { x: 240, y: 30 };
        drugs.forEach((drug: any, dIdx: number) => {
          const drugId = `drug-${node.id}-${dIdx}`;
          newFlowNodes.push({
            id: drugId, type: 'drugNode', draggable: !isLocked,
            position: { x: base.x + 240, y: base.y + dIdx * 70 - 20 },
            data: { label: drug.name, phase: `${drug.mechanism.split('(')[0]} (${drug.phase})`, db_id: drug.db_id, db_source: drug.db_source },
          });
          newFlowEdges.push({
            id: `edge-drug-${node.id}-${dIdx}`, source: drugId, target: node.id,
            type: 'customEdge', animated: true,
            style: { stroke: '#10B981', strokeWidth: 1.5, strokeDasharray: '4,4' },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#10B981', width: 9, height: 9 },
            data: { label: 'Drug → Target', labelColor: '#4ADE80', borderColor: 'rgba(74,222,128,0.25)' },
          });
        });
      });
    }

    // ── Pathway edges — relation-type-aware ────────────────────────────────
    validEdges.forEach((edge, idx) => {
      const isSrcMut   = mutatedGenes.includes(edge.source.toUpperCase());
      const isTgtMut   = mutatedGenes.includes(edge.target.toUpperCase());
      const tier       = (edge as any).confidence_tier ?? 3;
      const isDirected = (edge as any).is_directed !== false;  // default true for local
      const relType    = (edge as any).relation_type || (edge as any).relation || 'interaction';
      const score      = (edge as any).confidence_score ?? 0;

      const { stroke, strokeW, dasharray, animated, labelColor, borderColor, labelText, isAssoc }
        = edgeVisual(relType, tier, isDirected, isSrcMut && isTgtMut);

      newFlowEdges.push({
        id: `e-${edge.source}-${edge.target}-${idx}`,
        source: edge.source, target: edge.target,
        type: 'customEdge', animated,
        style: { stroke, strokeWidth: strokeW, strokeDasharray: dasharray },
        // Only render arrowhead when data source is actually directional
        markerEnd: isAssoc ? undefined
          : { type: MarkerType.ArrowClosed, color: stroke, width: 10, height: 10 },
        data: { label: labelText, labelColor, borderColor },
      });
    });

    seededPathwayRef.current = pathwayData.pathway_name;
    setRfNodes(newFlowNodes);
    setRfEdges(newFlowEdges);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathwayData, mutatedGenes, showDrugs, drugsByGene, selectedGene]);

  // Update draggable flag when lock state toggles without rebuilding layout
  useEffect(() => {
    setRfNodes(nds => nds.map(n => ({ ...n, draggable: n.id === 'pathway-group-backing' ? false : !isLocked })));
  }, [isLocked, setRfNodes]);

  // Keep isSelected in sync when selectedNode changes
  useEffect(() => {
    setRfNodes(nds => nds.map(n => ({
      ...n,
      data: { ...n.data, isSelected: selectedNode?.id === n.id },
    })));
  }, [selectedNode, setRfNodes]);

  // Fit view on report print
  useEffect(() => {
    if (isPrintingReportOpen && reactFlowInstance) {
      reactFlowInstance.fitView({ padding: 0.06, duration: 0 });
      const t = setTimeout(() => reactFlowInstance.fitView({ padding: 0.06, duration: 0 }), 120);
      return () => clearTimeout(t);
    }
  }, [isPrintingReportOpen, reactFlowInstance]);

  // PNG export
  useEffect(() => {
    if (pathwayExportTrigger === 0 || !reactFlowInstance) return;
    reactFlowInstance.fitView({ padding: 0.15 });
    const timer = setTimeout(() => {
      const flowDiv = document.querySelector('.react-flow') as HTMLElement;
      if (!flowDiv) return;
      const controls  = flowDiv.querySelector('.react-flow__controls') as HTMLElement;
      const minimap   = flowDiv.querySelector('.react-flow__minimap')  as HTMLElement;
      if (controls)  controls.style.visibility  = 'hidden';
      if (minimap)   minimap.style.visibility   = 'hidden';
      toPng(flowDiv, { backgroundColor: '#090d16', style: { transform: 'none' } })
        .then(url => {
          const a = Object.assign(document.createElement('a'), { download: `${selectedGene}_pathway_topology.png`, href: url });
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
        })
        .catch(console.error)
        .finally(() => {
          if (controls) controls.style.visibility = 'visible';
          if (minimap)  minimap.style.visibility  = 'visible';
        });
    }, 160);
    return () => clearTimeout(timer);
  }, [pathwayExportTrigger, selectedGene, reactFlowInstance]);

  // Fetch PubMed + CRISPR on node selection
  useEffect(() => {
    if (selectedNode) { fetchPubmedFeed(selectedNode.name); fetchCrisprGuides(selectedNode.name); }
  }, [selectedNode, fetchPubmedFeed, fetchCrisprGuides]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedLegendClass(null);
    const matched = pathwayData?.nodes.find(n => n.id === node.id);
    if (matched) setSelectedNode(matched);
  }, [pathwayData, setSelectedNode]);

  const handlePaneClick = useCallback(() => {
    setSelectedNode(null);
    setSelectedLegendClass(null);
  }, [setSelectedNode]);

  const handleResetLayout = useCallback(() => {
    if (!pathwayData) return;
    const seenIds = new Set<string>();
    const vNodes = pathwayData.nodes.filter(n => {
      if (!n?.id || !n?.name) return false;
      const uid = n.id.toUpperCase();
      if (seenIds.has(uid)) return false;
      seenIds.add(uid); return true;
    });
    const positions = computeLayeredLayout(vNodes, pathwayData.edges, selectedGene.toUpperCase());
    seededPathwayRef.current = null;
    setRfNodes(nds => nds.map(n =>
      n.id !== 'pathway-group-backing' && positions[n.id]
        ? { ...n, position: positions[n.id] } : n
    ));
    setTimeout(() => reactFlowInstance?.fitView({ padding: 0.18, duration: 400 }), 50);
  }, [reactFlowInstance, setRfNodes, pathwayData, selectedGene]);

  // ── Derived labels ───────────────────────────────────────────────────────────
  const allTiers         = (pathwayData?.edges || []).map((e: any) => e.confidence_tier ?? 3);
  const hasTier1         = allTiers.some((t: number) => t === 1);
  const hasTier2         = allTiers.some((t: number) => t === 2);
  const allTier3         = allTiers.length > 0 && allTiers.every((t: number) => t === 3);
  const networkSourceLabel = hasTier1 ? 'Reactome Curated'
    : hasTier2 ? 'CrossRef (Tier 2)'
    : allTier3 ? 'STRING / Text-Mined'
    : allTiers.length === 0 ? 'Local Cascade'
    : 'Mixed Sources';

  // ── Empty / loading states ───────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="glass-panel rounded-xl h-full flex flex-col items-center justify-center gap-3 text-studio-textMuted border border-studio-border">
        <Cpu className="w-8 h-8 animate-spin text-studio-glowBlue" />
        <p className="text-xs">Computing topological signaling layout…</p>
      </div>
    );
  }
  if (!pathwayData) {
    return (
      <div className="glass-panel rounded-xl h-full flex flex-col items-center justify-center gap-3 p-6 text-studio-textMuted border border-studio-border">
        <GitBranch className="w-10 h-10 opacity-30" />
        <div className="text-center">
          <p className="text-sm font-semibold text-slate-400">No Pathway Selected</p>
          <p className="text-xs mt-1">Select a gene from the ribbon to visualise its signaling topology.</p>
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className={
      isFullScreen 
        ? "fixed inset-0 z-[9999] bg-[#070b13] flex flex-row overflow-hidden p-6" 
        : "glass-panel rounded-xl h-full flex flex-row overflow-hidden border border-studio-border relative"
    }>

      {/* ── React Flow canvas ─────────────────────────────────────────────── */}
      <div className="flex-1 h-full relative min-w-0">

        {/* ── Top banner ─── */}
        <div className="absolute top-3 left-3 z-10 bg-slate-950/85 border border-studio-border rounded-xl px-4 py-2.5 backdrop-blur-md flex items-center gap-4 shadow-lg max-w-[72%]">
          <div className="min-w-0 flex-1">
            <span className="text-[9px] text-studio-textMuted uppercase font-bold tracking-widest block">
              {networkSourceLabel} &middot; {dbVersion}
            </span>
            <span className="text-[13px] font-extrabold text-slate-100 font-sans tracking-tight truncate block">{pathwayData.pathway_name}</span>
            {sourceTag && fetchTimestamp && (
              <span className="text-[8px] text-studio-glowCyan font-mono block mt-0.5" title="Provenance source metadata tag and fetch date/timestamp">
                PROV: {sourceTag.toUpperCase()} &middot; {new Date(fetchTimestamp).toLocaleString()}
              </span>
            )}
          </div>
          {/* Node / edge stats */}
          <div className="hidden sm:flex items-center gap-2 shrink-0 border-l border-studio-border/40 pl-3">
            <div className="text-center">
              <span className="text-[14px] font-extrabold text-studio-glowBlue font-mono leading-none block">
                {rfNodes.filter(n => n.type !== 'groupNode').length}
              </span>
              <span className="text-[7px] uppercase tracking-widest text-slate-600 font-bold block">nodes</span>
            </div>
            <div className="text-center">
              <span className="text-[14px] font-extrabold text-studio-glowCyan font-mono leading-none block">
                {rfEdges.filter(e => !e.id.startsWith('edge-drug')).length}
              </span>
              <span className="text-[7px] uppercase tracking-widest text-slate-600 font-bold block">edges</span>
            </div>
            {mutatedGenes.length > 0 && (
              <div className="text-center">
                <span className="text-[14px] font-extrabold text-red-400 font-mono leading-none block animate-pulse">
                  {rfNodes.filter(n => n.data?.isMutated).length}
                </span>
                <span className="text-[7px] uppercase tracking-widest text-red-600/70 font-bold block">mutant</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowDrugs(!showDrugs)}
              className={`text-[9px] px-2.5 py-1.5 rounded-lg border transition-all font-bold uppercase tracking-wider flex items-center gap-1.5 ${showDrugs ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/35' : 'bg-slate-900 text-slate-400 border-studio-border hover:bg-slate-800'}`}
            >
              <Pill className="w-3 h-3" />
              {showDrugs ? 'Hide Drugs' : 'Drugs'}
            </button>
            {isFullScreen ? (
              <>
                <button
                  onClick={() => {
                    const flowDiv = document.querySelector('.react-flow') as HTMLElement;
                    if (!flowDiv) return;
                    const controls  = flowDiv.querySelector('.react-flow__controls') as HTMLElement;
                    const minimap   = flowDiv.querySelector('.react-flow__minimap')  as HTMLElement;
                    if (controls)  controls.style.visibility  = 'hidden';
                    if (minimap)   minimap.style.visibility   = 'hidden';
                    toPng(flowDiv, { backgroundColor: '#090d16', style: { transform: 'none' } })
                      .then(url => {
                        const a = Object.assign(document.createElement('a'), { download: `${selectedGene}_pathway_topology.png`, href: url });
                        document.body.appendChild(a); a.click(); document.body.removeChild(a);
                      })
                      .catch(console.error)
                      .finally(() => {
                        if (controls) controls.style.visibility = 'visible';
                        if (minimap)  minimap.style.visibility  = 'visible';
                      });
                  }}
                  className="text-[9px] px-2.5 py-1.5 rounded-lg border bg-slate-900 text-slate-400 border-studio-border hover:bg-slate-800 hover:text-slate-200 transition-all font-bold uppercase tracking-wider flex items-center gap-1.5"
                >
                  <Maximize2 className="w-3 h-3" />
                  Save Screenshot
                </button>
                <button
                  onClick={() => setIsFullScreen(false)}
                  className="text-[9px] px-2.5 py-1.5 rounded-lg border bg-red-500/15 text-red-400 border-red-500/35 hover:bg-red-500/25 transition-all font-bold uppercase tracking-wider flex items-center gap-1.5"
                >
                  <X className="w-3 h-3" />
                  Close View
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsFullScreen(true)}
                className="text-[9px] px-2.5 py-1.5 rounded-lg border bg-studio-glowBlue/15 text-studio-glowBlue border-studio-glowBlue/35 hover:bg-studio-glowBlue/25 transition-all font-bold uppercase tracking-wider flex items-center gap-1.5"
                title="Pop out Reactome detailed signaling cascade into separate overlay window"
              >
                <Maximize2 className="w-3 h-3" />
                Pop Out Detailed View
              </button>
            )}
          </div>
        </div>

        {/* ── Unresolved Warning overlay ── */}
        {unresolvedNodes.length > 0 && (
          <div className="absolute top-[80px] left-3 z-10 bg-amber-950/80 border border-amber-500/35 rounded-xl px-3.5 py-1.5 backdrop-blur-md flex items-center gap-2 shadow-lg text-[9px] text-amber-300 font-semibold max-w-[72%]">
            <span className="flex h-1.5 w-1.5 relative shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500"></span>
            </span>
            <span>Warning: {unresolvedNodes.length} node(s) unresolved (missing canonical reference mapping).</span>
          </div>
        )}

        {/* ── Toolbar ─── */}
        <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5">
          {/* Lock toggle */}
          <button
            onClick={() => setIsLocked(l => !l)}
            title={isLocked ? 'Unlock layout (enable dragging)' : 'Lock layout (disable dragging)'}
            className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-all shadow
              ${isLocked
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                : 'bg-slate-900/90 border-studio-border text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
          >
            {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
          </button>
          {/* Reset layout */}
          <button
            onClick={handleResetLayout}
            title="Reset to default layout"
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-studio-border bg-slate-900/90 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-all shadow"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          {/* Fit view */}
          <button
            onClick={() => reactFlowInstance?.fitView({ padding: 0.18, duration: 400 })}
            title="Fit all nodes in view"
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-studio-border bg-slate-900/90 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-all shadow"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          {/* Minimap toggle */}
          <button
            onClick={() => setShowMinimap(m => !m)}
            title={showMinimap ? 'Hide minimap' : 'Show minimap'}
            className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-all shadow
              ${showMinimap
                ? 'bg-studio-glowBlue/15 border-studio-glowBlue/30 text-studio-glowBlue'
                : 'bg-slate-900/90 border-studio-border text-slate-400 hover:bg-slate-800'
              }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* ── Lock badge ─── */}
        {isLocked && (
          <div className="absolute bottom-32 right-3 z-10 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow">
            <Lock className="w-3 h-3" /> Layout Locked
          </div>
        )}

        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          onPaneClick={handlePaneClick}
          nodesDraggable={!isLocked}
          nodesConnectable={false}
          elementsSelectable={!isLocked}
          selectionMode={SelectionMode.Partial}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.15}
          maxZoom={2.5}
          className="w-full h-full"
          proOptions={{ hideAttribution: true }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            color="rgba(255,255,255,0.04)"
            gap={20}
            size={1.2}
          />
          <Controls
            showInteractive={false}
            className="!bottom-4 !left-4 !top-auto !bg-slate-900/90 !border-studio-border !rounded-xl !shadow-lg"
          />
          {showMinimap && (
            <MiniMap
              nodeColor={n => {
                if (n.type === 'drugNode')  return '#10B981';
                if (n.data?.isMutated)     return '#EF4444';
                if (n.type === 'groupNode') return 'transparent';
                const vis = getNodeVisual(n.data?.type || '', false);
                return vis.border.includes('emerald') ? '#34D399'
                  : vis.border.includes('cyan')    ? '#22D3EE'
                  : vis.border.includes('amber')   ? '#FBBF24'
                  : vis.border.includes('yellow')  ? '#FDE047'
                  : vis.border.includes('purple')  ? '#C084FC'
                  : '#64748B';
              }}
              maskColor="rgba(9,13,22,0.75)"
              className="!bg-slate-900/90 !border !border-studio-border !rounded-xl !bottom-4 !right-4 !shadow-lg"
              style={{ width: 140, height: 90 }}
              pannable
              zoomable
            />
          )}
        </ReactFlow>

        {/* ── Legend (bottom-left, above Controls) ─── */}
        <div className="absolute bottom-4 left-16 z-10 bg-slate-950/88 border border-studio-border/60 rounded-xl p-2.5 backdrop-blur-md flex flex-col gap-1.5 shadow-xl max-w-[11rem]">
          <span className="text-[8px] font-bold uppercase tracking-widest text-slate-600 border-b border-studio-border/30 pb-1 block mb-0.5">
            Symbol Legend
          </span>
          {LEGEND_ITEMS.filter(li => li.key !== 'Therapeutic Drug' || showDrugs).map(li => (
            <button
              key={li.key}
              onClick={() => { setSelectedNode(null); setSelectedLegendClass(li.key === selectedLegendClass ? null : li.key); }}
              className={`flex items-center gap-2 w-full text-left px-1.5 py-0.5 rounded-lg transition-all text-[9.5px] font-medium
                ${selectedLegendClass === li.key
                  ? 'bg-white/5 border border-white/10'
                  : 'hover:bg-white/5'
                }`}
            >
              <span
                className={`w-3 h-3 shrink-0 ${li.dot}`}
                style={{ background: li.color + '33', border: `1.5px solid ${li.color}77` }}
              />
              <span className="text-slate-400 truncate">{li.label}</span>
            </button>
          ))}

          {/* Edge tier key */}
          <div className="border-t border-studio-border/30 pt-1.5 mt-0.5 space-y-1">
            <span className="text-[8px] font-bold uppercase tracking-widest text-slate-600 block">Edge Confidence</span>
            {[
              { color: '#93C5FD', dash: 'none',  label: 'Tier 1 — Curated' },
              { color: '#7DD3FC', dash: '4px',   label: 'Tier 2 — X-Ref' },
              { color: '#475569', dash: '2px 4px',label: 'Tier 3 — Text-mined' },
            ].map(({ color, dash, label }) => (
              <div key={label} className="flex items-center gap-2">
                <svg width="24" height="6" className="shrink-0">
                  <line x1="0" y1="3" x2="24" y2="3"
                    stroke={color} strokeWidth="2"
                    strokeDasharray={dash === 'none' ? undefined : dash}
                  />
                </svg>
                <span className="text-[8.5px] text-slate-500">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Side-drawer ─────────────────────────────────────────────────────── */}
      {(selectedNode || selectedLegendClass) && (
        <div className="w-80 border-l border-studio-border bg-slate-950/92 h-full flex flex-col backdrop-blur-md animate-in slide-in-from-right duration-200 select-none shrink-0">

          {/* Drawer header */}
          <div className="flex justify-between items-start px-5 pt-5 pb-4 border-b border-studio-border">
            {selectedNode ? (
              <div className="min-w-0 flex-1">
                <span className="text-[8.5px] text-studio-glowBlue font-bold uppercase tracking-widest block">Node Metadata</span>
                <h3 className="text-[15px] font-extrabold text-slate-100 tracking-tight truncate">{selectedNode.name}</h3>
              </div>
            ) : (
              <div className="min-w-0 flex-1">
                <span className="text-[8.5px] text-studio-glowCyan font-bold uppercase tracking-widest block">Class Profile</span>
                <h3 className="text-[15px] font-extrabold text-slate-100 tracking-tight">{selectedLegendClass}</h3>
              </div>
            )}
            <button
              onClick={() => { setSelectedNode(null); setSelectedLegendClass(null); }}
              className="text-studio-textMuted hover:text-slate-200 p-1 hover:bg-slate-800 rounded-lg transition-colors ml-2 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Drawer body */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {selectedLegendClass ? (
              /* ── Legend class card ─── */
              <div className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-thin">
                {(() => {
                  let description = '';
                  let members: any[] = [];

                  if (selectedLegendClass === 'Ligand') {
                    description = 'Extracellular signaling molecules (cytokines, growth factors, hormones) that bind receptor targets and initiate intracellular signaling cascades.';
                    members = pathwayData.nodes.filter(n => resolveSingleType(n.type) === 'Ligand');
                  } else if (selectedLegendClass === 'Receptor') {
                    description = 'Transmembrane proteins that undergo conformational changes upon ligand binding, converting extracellular cues to intracellular biochemical signals.';
                    members = pathwayData.nodes.filter(n => resolveSingleType(n.type) === 'Receptor');
                  } else if (selectedLegendClass === 'Kinase') {
                    description = 'Enzymes that catalyse phosphorylation (kinases) or peptide-bond cleavage (proteases) to propagate and amplify intracellular signals.';
                    members = pathwayData.nodes.filter(n => {
                      const t = resolveSingleType(n.type);
                      return t === 'Kinase' || n.type.toLowerCase().includes('protease') || n.type.toLowerCase().includes('caspase');
                    });
                  } else if (selectedLegendClass === 'Transcription Factor') {
                    description = 'Nuclear proteins that bind promoter sequences and regulate gene transcription in response to upstream signaling activation.';
                    members = pathwayData.nodes.filter(n => resolveSingleType(n.type) === 'Transcription Factor');
                  } else if (selectedLegendClass === 'Adaptor') {
                    description = 'Scaffold/adaptor proteins that lack intrinsic enzymatic activity but bridge and coordinate signalling complexes.';
                    members = pathwayData.nodes.filter(n => resolveSingleType(n.type) === 'Adaptor');
                  } else if (selectedLegendClass === 'Therapeutic Drug') {
                    description = 'Approved or investigational compounds (monoclonal antibodies, small molecules) engineered to modulate key pathway nodes.';
                    pathwayData.nodes.forEach(n => {
                      (drugsByGene[n.id.toUpperCase()] || []).forEach((d: any) => {
                        members.push({ id: n.id, name: `${d.name} (${d.phase})`, target: n.name });
                      });
                    });
                  } else if (selectedLegendClass === 'Variant Mutation') {
                    description = 'Coding alterations from your VCF profile that map to nodes in this cascade, potentially disrupting normal signal transduction.';
                    members = pathwayData.nodes.filter(n => mutatedGenes.includes(n.id.toUpperCase()));
                  }

                  return (
                    <>
                      <div className="bg-slate-900/60 border border-studio-border/40 rounded-xl p-3.5">
                        <span className="text-[9px] text-studio-textMuted font-bold uppercase tracking-wider block mb-1">Biological Role</span>
                        <p className="text-xs text-slate-300 leading-relaxed">{description}</p>
                      </div>
                      <div>
                        <span className="text-[9px] text-studio-textMuted font-bold uppercase tracking-wider block mb-2">
                          Members in Pathway ({members.length})
                        </span>
                        {members.length > 0 ? (
                          <div className="space-y-1.5 max-h-80 overflow-y-auto pr-0.5 scrollbar-thin">
                            {members.map((item, i) => {
                              const n = pathwayData.nodes.find(node => node.id === (item.id || item.target));
                              const nodePdb = n?.pdb_id;
                              const nodeMut = n ? mutatedGenes.includes(n.id.toUpperCase()) : false;
                              return (
                                <button
                                  key={i}
                                  onClick={() => {
                                    if (n) { setSelectedNode(n); setSelectedLegendClass(null); }
                                  }}
                                  className="w-full text-left p-2.5 rounded-xl bg-slate-900 border border-studio-border/40 hover:border-studio-glowBlue/40 hover:bg-slate-800/30 transition-all group flex flex-col gap-1"
                                >
                                  <div className="flex justify-between items-center w-full">
                                    <span className="text-[11px] font-bold text-slate-200 group-hover:text-studio-glowBlue transition-colors font-mono truncate">{item.name || item.id}</span>
                                    <ChevronRight className="w-3.5 h-3.5 text-studio-glowCyan shrink-0 ml-2 opacity-70 group-hover:opacity-100" />
                                  </div>
                                  {item.target && <span className="text-[9px] text-studio-textMuted block">Target: {item.target}</span>}
                                  <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                    {nodePdb && (
                                      <span className="text-[7.5px] text-slate-500 font-mono bg-slate-800/80 px-1.5 py-0.5 rounded border border-studio-border/30">
                                        PDB {nodePdb}
                                      </span>
                                    )}
                                    {nodeMut && (
                                      <span className="text-[7.5px] text-red-400 font-bold bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20">
                                        MUTANT
                                      </span>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-[10px] text-studio-textMuted italic bg-slate-900/50 p-3 rounded-xl border border-dashed border-studio-border/40 text-center">
                            No {selectedLegendClass} nodes mapped in this cascade.
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : selectedNode && (
              /* ── Node detail panel ─── */
              <>
                {/* Tab bar */}
                <div className="flex border-b border-studio-border/30 px-5 pt-1 shrink-0">
                  {(['details', 'crispr'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setDrawerTab(tab)}
                      className={`flex-1 pb-2.5 text-[10px] font-bold uppercase tracking-wider text-center border-b-2 transition-all
                        ${drawerTab === tab
                          ? 'border-studio-glowBlue text-studio-glowBlue'
                          : 'border-transparent text-studio-textMuted hover:text-slate-200'
                        }`}
                    >
                      {tab === 'details' ? 'Details' : 'CRISPR KO Guides'}
                    </button>
                  ))}
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-thin">
                  {drawerTab === 'crispr' ? (
                    /* ── CRISPR tab ─── */
                    <>
                      <div className="bg-red-500/10 border border-red-500/25 text-red-400 text-[9px] p-2.5 rounded-xl leading-relaxed">
                        <strong>SYNTHETIC SEQUENCE WARNING</strong> — gRNA sequences are illustrative SpCas9 designs (PAM: NGG). Not extracted from a live genome assembly. <strong>DO NOT ORDER.</strong>
                      </div>
                      <div>
                        <span className="text-[9px] text-studio-textMuted font-bold uppercase tracking-wider block">SpCas9 PAM: 5′-NGG-3′</span>
                      </div>
                      {crisprGuides != null && crisprGuides.length > 0 ? (
                        <div className="space-y-2.5">
                          {(crisprGuides as any[]).map((g: any, i: number) => (
                            <div key={i} className="p-3 rounded-xl bg-slate-900 border border-studio-border/50 space-y-2">
                              <div className="flex justify-between items-center text-[10px]">
                                <span className="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-bold font-mono">{g.exon}</span>
                                <span className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 px-1.5 py-0.5 rounded text-[9px] font-bold">
                                  Eff: {g.efficiency_score}%
                                </span>
                              </div>
                              <div className="bg-slate-950 p-2 rounded-lg border border-studio-border/30 font-mono text-[11px] flex items-center gap-1 cursor-pointer select-all">
                                <span className="text-emerald-400 font-extrabold">{g.guide_seq}</span>
                                <span className="text-amber-500 font-extrabold" title="PAM">{g.pam}</span>
                              </div>
                              <div className="flex justify-between text-[9px] text-studio-textMuted">
                                <span>GC: {g.gc_content}%</span>
                                <span>Off-target: {g.off_target_score}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-[10px] text-studio-textMuted italic bg-slate-900/50 p-3 rounded-xl border border-dashed border-studio-border/40 text-center">
                          Loading guide candidates…
                        </div>
                      )}
                    </>
                  ) : (
                    /* ── Details tab ─── */
                    <>
                      {/* Type */}
                      <div>
                        <span className="text-[9px] text-studio-textMuted font-bold uppercase tracking-wider block mb-1">Biological Type</span>
                        <span className="bg-studio-glowBlue/15 text-studio-glowBlue border border-studio-glowBlue/25 text-[10px] px-2.5 py-1 rounded-lg font-bold">
                          {selectedNode.type}
                        </span>
                      </div>

                      {/* Description */}
                      <div>
                        <span className="text-[9px] text-studio-textMuted font-bold uppercase tracking-wider block mb-1">Functional Description</span>
                        <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/50 border border-studio-border/30 rounded-xl p-3">{selectedNode.description}</p>
                      </div>

                      {/* Citations */}
                      {selectedNode.citations && (
                        <div>
                          <span className="text-[9px] text-studio-textMuted font-bold uppercase tracking-wider flex items-center gap-1 mb-1">
                            <BookOpen className="w-3 h-3 text-studio-glowCyan" /> Citations
                          </span>
                          <p className="text-[11px] text-studio-glowCyan font-mono italic bg-slate-900 border border-studio-border/50 p-2.5 rounded-xl">
                            {selectedNode.citations}
                          </p>
                        </div>
                      )}

                      {/* PDB */}
                      {selectedNode.pdb_id && (
                        <div>
                          <span className="text-[9px] text-studio-textMuted font-bold uppercase tracking-wider block mb-1.5">Protein Structure (PDB)</span>
                          <a
                            href={`https://www.rcsb.org/structure/${selectedNode.pdb_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-between text-xs text-studio-glowBlue bg-studio-glowBlue/5 border border-studio-glowBlue/25 hover:bg-studio-glowBlue/10 p-2.5 rounded-xl transition-all font-semibold mb-2"
                          >
                            <span className="font-mono">PDB: {selectedNode.pdb_id}</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                          <ProteinViewer pdbId={selectedNode.pdb_id} />
                        </div>
                      )}

                      {/* PubMed feed */}
                      <div>
                        <span className="text-[9px] text-studio-textMuted font-bold uppercase tracking-wider flex items-center gap-1.5 mb-2">
                          <BookOpen className="w-3 h-3 text-studio-glowBlue animate-pulse" /> Live PubMed Articles
                        </span>
                        {pubmedFeed?.length > 0 ? (
                          <div className="space-y-2 max-h-52 overflow-y-auto pr-0.5 scrollbar-thin">
                            {pubmedFeed.map((paper: any) => (
                              <a
                                key={paper.id}
                                href={paper.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block p-2.5 rounded-xl bg-slate-900 border border-studio-border/40 hover:border-studio-glowBlue/40 hover:bg-slate-800/30 transition-all group"
                              >
                                <h4 className="text-[11px] font-bold text-slate-200 line-clamp-2 leading-snug group-hover:text-studio-glowBlue transition-colors">
                                  {paper.title}
                                </h4>
                                <p className="text-[9px] text-studio-textMuted mt-0.5 truncate">{paper.authors}</p>
                                <div className="flex justify-between text-[9px] text-studio-glowCyan mt-0.5 font-mono">
                                  <span>{paper.journal}</span>
                                  <span>{paper.pubdate}</span>
                                </div>
                              </a>
                            ))}
                          </div>
                        ) : (
                          <div className="text-[10px] text-studio-textMuted italic bg-slate-900/50 p-3 rounded-xl border border-dashed border-studio-border/40 text-center">
                            Loading articles for {selectedNode.name}…
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Root export with ReactFlowProvider ──────────────────────────────────────────
export default function PathwayCanvas() {
  return (
    <ReactFlowProvider>
      <PathwayCanvasInner />
    </ReactFlowProvider>
  );
}
