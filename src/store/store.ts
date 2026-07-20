import { create } from 'zustand';

interface TissueExpression {
  gene: string;
  tissue: string;
  nTPM: number;
  FDR: number;
}

interface PathwayNode {
  id: string;
  name: string;
  type: string;
  description: string;
  pdb_id: string;
  citations: string;
}

interface PathwayEdge {
  source: string;
  target: string;
  relation: string;
}

interface PathwayResponse {
  pathway_name: string;
  nodes: PathwayNode[];
  edges: PathwayEdge[];
}

interface AppState {
  // Config & State
  selectedGene: string;
  expressionThreshold: number;
  fdrThreshold: number;
  scaleType: 'linear' | 'log2';
  activeTissueFilter: string | null;
  mutatedGenes: string[];
  
  // Data State
  expressionData: TissueExpression[];
  pathwayData: PathwayResponse | null;
  selectedNode: PathwayNode | null;
  pubmedFeed: any[];
  coexpressionCompareGene: string;
  coexpressionData: any | null;
  activeTab: 'expression' | 'coexpression' | 'heatmap' | 'deconvolution';
  gseaResults: any[] | null;
  isGseaModalOpen: boolean;
  isHelpModalOpen: boolean;
  isCitationModalOpen: boolean;
  isPrintingReportOpen: boolean;
  isKineticModalOpen: boolean;
  deconvolutionData: any | null;
  heatmapGenes: string[];
  heatmapData: any | null;
  showDrugs: boolean;
  crisprGuides: any[] | null;
  drugsByGene: Record<string, any[]>;
  kineticResults: any | null;
  dockingResult: any | null;
  sourceTag: string | null;
  fetchTimestamp: string | null;
  
  // Export Triggers
  anatomyExportTrigger: number;
  pathwayExportTrigger: number;
  expressionExportTrigger: number;
  
  // Search state
  searchQuery: string;
  searchResults: string[];
  
  // UI indicators
  isLoading: boolean;
  error: string | null;
  dbVersion: string;
  
  // Actions
  setExpressionThreshold: (val: number) => void;
  setFdrThreshold: (val: number) => void;
  setScaleType: (type: 'linear' | 'log2') => void;
  setActiveTissueFilter: (tissue: string | null) => void;
  setSelectedNode: (node: PathwayNode | null) => void;
  setSearchQuery: (query: string) => void;
  setMutatedGenes: (genes: string[]) => void;
  setCoexpressionCompareGene: (gene: string) => void;
  setActiveTab: (tab: 'expression' | 'coexpression' | 'heatmap' | 'deconvolution') => void;
  setGseaModalOpen: (open: boolean) => void;
  setHelpModalOpen: (open: boolean) => void;
  setCitationModalOpen: (open: boolean) => void;
  setPrintingReportOpen: (open: boolean) => void;
  setKineticModalOpen: (open: boolean) => void;
  fetchDeconvolutionData: (gene: string, tissue: string) => Promise<void>;
  setHeatmapGenes: (genes: string[]) => void;
  setShowDrugs: (show: boolean) => void;
  triggerAnatomyExport: () => void;
  triggerPathwayExport: () => void;
  triggerExpressionExport: () => void;
  setKineticResults: (results: any) => void;
  setDockingResult: (result: any) => void;
  
  // Async operations
  fetchSearchResults: (query: string) => Promise<void>;
  fetchGeneData: (gene: string) => Promise<void>;
  fetchPubmedFeed: (gene: string) => Promise<void>;
  fetchCoexpressionData: (geneB?: string) => Promise<void>;
  fetchGseaResults: () => Promise<void>;
  fetchHeatmapData: (genes?: string[]) => Promise<void>;
  fetchCrisprGuides: (gene: string) => Promise<void>;
  fetchDrugsForGene: (gene: string) => Promise<void>;
  fetchKineticSimulation: (gene: string) => Promise<void>;
  loadSession: (session: any) => void;
}

const API_BASE = 'http://127.0.0.1:8000/api';

export const useStore = create<AppState>((set, get) => ({
  selectedGene: 'TNF',
  expressionThreshold: 10.0,
  fdrThreshold: 0.05,
  scaleType: 'linear',
  activeTissueFilter: null,
  mutatedGenes: [],
  
  expressionData: [],
  pathwayData: null,
  selectedNode: null,
  pubmedFeed: [],
  coexpressionCompareGene: 'AKT1',
  coexpressionData: null,
  activeTab: 'expression',
  gseaResults: null,
  isGseaModalOpen: false,
  isHelpModalOpen: false,
  isCitationModalOpen: false,
  isPrintingReportOpen: false,
  isKineticModalOpen: false,
  deconvolutionData: null,
  heatmapGenes: ['TNF', 'AKT1', 'EGFR', 'TP53', 'MTOR'],
  heatmapData: null,
  showDrugs: false,
  crisprGuides: null,
  drugsByGene: {},
  kineticResults: null,
  dockingResult: null,
  sourceTag: null,
  fetchTimestamp: null,
  anatomyExportTrigger: 0,
  pathwayExportTrigger: 0,
  expressionExportTrigger: 0,
  
  searchQuery: 'TNF',
  searchResults: [],
  isLoading: false,
  error: null,
  dbVersion: 'OmniGene Reference KB v2026.07',

  setExpressionThreshold: (val) => set({ expressionThreshold: val }),
  setFdrThreshold: (val) => set({ fdrThreshold: val }),
  setScaleType: (type) => set({ scaleType: type }),
  setActiveTissueFilter: (tissue) => {
    set({ activeTissueFilter: tissue });
    if (tissue) {
      get().fetchDeconvolutionData(get().selectedGene, tissue);
    }
  },
  setSelectedNode: (node) => set({ selectedNode: node }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setMutatedGenes: (genes) => {
    set({ mutatedGenes: genes });
    get().fetchGseaResults();
  },
  setCoexpressionCompareGene: (gene) => {
    set({ coexpressionCompareGene: gene.toUpperCase().trim() });
    get().fetchCoexpressionData();
  },
  setActiveTab: (tab) => set({ activeTab: tab }),
  setGseaModalOpen: (open) => set({ isGseaModalOpen: open }),
  setHelpModalOpen: (open) => set({ isHelpModalOpen: open }),
  setCitationModalOpen: (open) => set({ isCitationModalOpen: open }),
  setPrintingReportOpen: (open) => set({ isPrintingReportOpen: open }),
  setKineticModalOpen: (open) => set({ isKineticModalOpen: open }),
  fetchDeconvolutionData: async (gene, tissue) => {
    try {
      const res = await fetch(`${API_BASE}/deconvolution?gene=${encodeURIComponent(gene)}&tissue=${encodeURIComponent(tissue)}`);
      if (res.ok) {
        const data = await res.json();
        if (get().selectedGene !== gene.toUpperCase().trim()) return;
        set({ deconvolutionData: data });
      }
    } catch (err) {
      console.error('Error fetching deconvolution:', err);
    }
  },
  setHeatmapGenes: (genes) => {
    set({ heatmapGenes: genes });
    get().fetchHeatmapData();
  },
  setShowDrugs: (show) => set({ showDrugs: show }),
  triggerAnatomyExport: () => set((state) => ({ anatomyExportTrigger: state.anatomyExportTrigger + 1 })),
  triggerPathwayExport: () => set((state) => ({ pathwayExportTrigger: state.pathwayExportTrigger + 1 })),
  triggerExpressionExport: () => set((state) => ({ expressionExportTrigger: state.expressionExportTrigger + 1 })),
  setKineticResults: (results) => set({ kineticResults: results }),
  setDockingResult: (result) => set({ dockingResult: result }),

  fetchSearchResults: async (query) => {
    if (!query.trim()) {
      set({ searchResults: [] });
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        set({ searchResults: data.results });
      }
    } catch (err) {
      console.error('Error fetching search results:', err);
    }
  },

  fetchGeneData: async (gene) => {
    const geneUpper = gene.toUpperCase().trim();
    if (!geneUpper) return;

    set({ isLoading: true, error: null, selectedGene: geneUpper, selectedNode: null });

    // Concurrently trigger PubMed citations load, co-expression, CRISPR gRNAs & Heatmap matrix
    get().fetchPubmedFeed(geneUpper);
    get().fetchCoexpressionData();
    get().fetchCrisprGuides(geneUpper);
    get().fetchHeatmapData();
    get().fetchDeconvolutionData(geneUpper, get().activeTissueFilter || 'Liver');
    get().fetchKineticSimulation(geneUpper);

    try {
      // Parallel fetch for expression, pathway & db-version
      const [expRes, pathRes, dbRes] = await Promise.all([
        fetch(`${API_BASE}/expression?gene=${geneUpper}`),
        fetch(`${API_BASE}/pathway?gene=${geneUpper}`),
        fetch(`${API_BASE}/db-version`).catch(() => null)
      ]);

      let expressionData: TissueExpression[] = [];
      let pathwayData: PathwayResponse | null = null;
      let errorMsg: string | null = null;
      let dbVersion = get().dbVersion;

      let sourceTag: string | null = null;
      let fetchTimestamp: string | null = null;

      if (expRes.ok) {
        const expJson = await expRes.json();
        expressionData = expJson.expression;
        sourceTag = expJson.source_tag || null;
        fetchTimestamp = expJson.fetch_timestamp || null;
      } else {
        errorMsg = `Gene "${geneUpper}" expression data not found.`;
      }

      if (pathRes.ok) {
        pathwayData = await pathRes.json();
        if (pathwayData && pathwayData.nodes) {
          pathwayData.nodes.forEach((node: any) => {
            get().fetchDrugsForGene(node.id);
          });
        }
      }

      if (dbRes && dbRes.ok) {
        const dbJson = await dbRes.json();
        if (dbJson && dbJson.version) {
          dbVersion = dbJson.version;
        }
      }

      if (get().selectedGene !== geneUpper) return;
      set({
        expressionData,
        pathwayData,
        dbVersion,
        sourceTag,
        fetchTimestamp,
        isLoading: false,
        error: errorMsg
      });

    } catch (err) {
      set({
        isLoading: false,
        error: 'Failed to connect to local scientific backend.'
      });
      console.error('Error fetching gene data:', err);
    }
  },

  fetchPubmedFeed: async (gene) => {
    const geneUpper = gene.toUpperCase().trim();
    if (!geneUpper) return;
    try {
      const res = await fetch(`${API_BASE}/pubmed?gene=${geneUpper}`);
      if (res.ok) {
        const data = await res.json();
        if (get().selectedGene !== geneUpper) return;
        set({ pubmedFeed: data.citations });
      }
    } catch (err) {
      console.error('Error fetching pubmed feed:', err);
    }
  },

  fetchCoexpressionData: async (geneB) => {
    const mainGene = get().selectedGene;
    const targetGene = (geneB || get().coexpressionCompareGene).toUpperCase().trim();
    if (!mainGene || !targetGene) return;
    try {
      const res = await fetch(`${API_BASE}/coexpression?geneA=${mainGene}&geneB=${targetGene}`);
      if (res.ok) {
        const data = await res.json();
        if (get().selectedGene !== mainGene) return;
        set({ coexpressionData: data });
      }
    } catch (err) {
      console.error('Error fetching co-expression data:', err);
    }
  },

  fetchGseaResults: async () => {
    const mutated = get().mutatedGenes;
    if (mutated.length === 0) {
      set({ gseaResults: [] });
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/gsea`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mutated_genes: mutated })
      });
      if (res.ok) {
        const data = await res.json();
        set({ gseaResults: data.results });
      }
    } catch (err) {
      console.error('Error running GSEA:', err);
    }
  },

  fetchHeatmapData: async (genes) => {
    const list = genes || get().heatmapGenes;
    if (list.length === 0) return;
    try {
      const res = await fetch(`${API_BASE}/coexpression-matrix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ genes: list })
      });
      if (res.ok) {
        const data = await res.json();
        set({ heatmapData: data });
      }
    } catch (err) {
      console.error('Error fetching heatmap matrix:', err);
    }
  },

  fetchCrisprGuides: async (gene) => {
    const geneUpper = gene.toUpperCase().trim();
    if (!geneUpper) return;
    try {
      const res = await fetch(`${API_BASE}/crispr?gene=${geneUpper}`);
      if (res.ok) {
        const data = await res.json();
        const guides = data.guides || [];
        (guides as any).type = data.type || 'illustrative_simulation';
        if (get().selectedGene !== geneUpper) return;
        set({ crisprGuides: guides });
      }
    } catch (err) {
      console.error('Error fetching CRISPR guides:', err);
    }
  },

  fetchKineticSimulation: async (gene) => {
    const geneUpper = gene.toUpperCase().trim();
    if (!geneUpper) return;
    try {
      const res = await fetch(`${API_BASE}/kinetic-simulation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gene: geneUpper,
          stimulus: 10.0,
          duration: 120,
          knockout_nodes: [],
          has_mutation: get().mutatedGenes.includes(geneUpper)
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (get().selectedGene !== geneUpper) return;
        set({ kineticResults: data });
      } else {
        const errData = await res.json();
        if (get().selectedGene !== geneUpper) return;
        set({ kineticResults: { error: errData.detail || `Unavailable for ${geneUpper}` } });
      }
    } catch (err) {
      console.error('Error fetching kinetic simulation:', err);
      set({ kineticResults: { error: `Connection error during simulation fetch` } });
    }
  },

  fetchDrugsForGene: async (gene) => {
    const geneUpper = gene.toUpperCase().trim();
    if (!geneUpper) return;
    if (get().drugsByGene[geneUpper]) return;
    try {
      const res = await fetch(`${API_BASE}/drugs?gene=${geneUpper}`);
      if (res.ok) {
        const data = await res.json();
        set((state) => ({
          drugsByGene: {
            ...state.drugsByGene,
            [geneUpper]: data.drugs
          }
        }));
      }
    } catch (err) {
      console.error('Error fetching drugs for gene:', err);
    }
  },

  loadSession: (session) => {
    set({
      selectedGene: session.selectedGene || 'TNF',
      expressionThreshold: session.expressionThreshold ?? 10.0,
      fdrThreshold: session.fdrThreshold ?? 0.05,
      scaleType: session.scaleType || 'linear',
      activeTissueFilter: session.activeTissueFilter ?? null,
      mutatedGenes: session.mutatedGenes || [],
      expressionData: session.expressionData || [],
      pathwayData: session.pathwayData || null,
      selectedNode: session.selectedNode || null,
      pubmedFeed: session.pubmedFeed || [],
      coexpressionCompareGene: session.coexpressionCompareGene || 'AKT1',
      coexpressionData: session.coexpressionData || null,
      activeTab: session.activeTab || 'expression',
      gseaResults: session.gseaResults || null,
      isGseaModalOpen: session.isGseaModalOpen || false,
  isHelpModalOpen: session.isHelpModalOpen || false,
  isCitationModalOpen: session.isCitationModalOpen || false,
  isPrintingReportOpen: session.isPrintingReportOpen || false,
  isKineticModalOpen: session.isKineticModalOpen || false,
  deconvolutionData: session.deconvolutionData || null,
      heatmapGenes: session.heatmapGenes || ['TNF', 'AKT1', 'EGFR', 'TP53', 'MTOR'],
      heatmapData: session.heatmapData || null,
      showDrugs: session.showDrugs || false,
      crisprGuides: session.crisprGuides || null,
      drugsByGene: session.drugsByGene || {},
      kineticResults: session.kineticResults || null,
      dockingResult: session.dockingResult || null,
      sourceTag: session.sourceTag || null,
      fetchTimestamp: session.fetchTimestamp || null,
      searchQuery: session.selectedGene || 'TNF'
    });
  }
}));
