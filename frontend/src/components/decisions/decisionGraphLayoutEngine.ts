import dagre from '@dagrejs/dagre';
import ELK from 'elkjs/lib/elk.bundled.js';
import { Position, type Edge, type Node } from 'reactflow';

export type LayoutEngineOptions = {
  nodeWidth: number;
  nodeHeight: number;
};

const DAGRE_NODESEP = 56;
const DAGRE_RANKSEP = 96;
const ELK_NODESEP = '56';
const ELK_RANKSEP = '96';

const elk = new ELK();

const anchorPositions = (
  nodes: Node[],
  positions: Map<string, { x: number; y: number }>,
  rankdir: 'LR' | 'TB',
) => {
  const isHorizontal = rankdir === 'LR';
  return nodes.map((node) => ({
    ...node,
    position: positions.get(node.id) ?? node.position,
    sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
    targetPosition: isHorizontal ? Position.Left : Position.Top,
  }));
};

/** Layered LR layout via dagre — synchronous fallback. */
export const layoutLinkedWithDagre = <T>(
  nodes: Node<T>[],
  edges: Edge[],
  { nodeWidth, nodeHeight }: LayoutEngineOptions,
  rankdir: 'LR' | 'TB' = 'LR',
): Node<T>[] => {
  const dagreGraph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir,
    nodesep: DAGRE_NODESEP,
    ranksep: DAGRE_RANKSEP,
    marginx: 0,
    marginy: 0,
    align: 'UL',
  });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });
  edges.forEach((edge) => {
    if (dagreGraph.hasNode(edge.source) && dagreGraph.hasNode(edge.target)) {
      dagreGraph.setEdge(edge.source, edge.target);
    }
  });

  dagre.layout(dagreGraph);

  const positions = new Map<string, { x: number; y: number }>();
  nodes.forEach((node) => {
    const layout = dagreGraph.node(node.id) as { x?: number; y?: number } | undefined;
    positions.set(node.id, {
      x: (layout?.x ?? 0) - nodeWidth / 2,
      y: (layout?.y ?? 0) - nodeHeight / 2,
    });
  });

  return anchorPositions(nodes, positions, rankdir);
};

/** Layered LR layout via ELK — tighter compaction for linked groups. */
export const layoutLinkedWithElk = async <T>(
  nodes: Node<T>[],
  edges: Edge[],
  { nodeWidth, nodeHeight }: LayoutEngineOptions,
  rankdir: 'RIGHT' | 'DOWN' = 'RIGHT',
): Promise<Node<T>[]> => {
  if (nodes.length === 0) return nodes;

  const graph = {
    id: 'decision-linked-root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': rankdir,
      'elk.layered.compaction.postCompaction.strategy': 'EDGE_LENGTH',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.spacing.nodeNode': ELK_NODESEP,
      'elk.layered.spacing.nodeNodeBetweenLayers': ELK_RANKSEP,
      'elk.padding': `[top=0,left=0,bottom=0,right=0]`,
    },
    children: nodes.map((node) => ({
      id: node.id,
      width: nodeWidth,
      height: nodeHeight,
    })),
    edges: edges.map((edge, index) => ({
      id: `edge-${index}-${edge.source}-${edge.target}`,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  try {
    const layouted = await elk.layout(graph);
    const positions = new Map<string, { x: number; y: number }>();
    layouted.children?.forEach((child) => {
      if (!child.id) return;
      positions.set(child.id, {
        x: (child.x ?? 0) - nodeWidth / 2,
        y: (child.y ?? 0) - nodeHeight / 2,
      });
    });
    const flowRankdir = rankdir === 'RIGHT' ? 'LR' : 'TB';
    return anchorPositions(nodes, positions, flowRankdir);
  } catch {
    return layoutLinkedWithDagre(nodes, edges, { nodeWidth, nodeHeight }, rankdir === 'RIGHT' ? 'LR' : 'TB');
  }
};

export const layoutLinkedComponent = async <T>(
  nodes: Node<T>[],
  edges: Edge[],
  options: LayoutEngineOptions,
  engine: 'elk' | 'dagre' = 'elk',
): Promise<Node<T>[]> => {
  if (engine === 'dagre') {
    return layoutLinkedWithDagre(nodes, edges, options);
  }
  return layoutLinkedWithElk(nodes, edges, options);
};
