'use client';

import { Map } from 'lucide-react';
import { useState } from 'react';
import { MiniMap, Panel, type Node } from 'reactflow';

const MINIMAP_WIDTH = 200;
const MINIMAP_HEIGHT = 132;

type MiniMapNodeData = {
  status?: string;
};

const nodeColor = (node: Node<MiniMapNodeData>): string => {
  if (node.selected) return '#3CCED7';
  switch (node.data?.status) {
    case 'COMMITTED':
      return '#86efac';
    case 'REVIEWED':
      return '#93c5fd';
    case 'ARCHIVED':
      return '#c4b5fd';
    case 'AWAITING_APPROVAL':
      return '#fde68a';
    case 'DRAFT':
    case 'PREDRAFT':
      return '#e2e8f0';
    default:
      return '#cbd5e1';
  }
};

const nodeStrokeColor = (node: Node<MiniMapNodeData>): string =>
  node.selected ? '#16828C' : '#94a3b8';

/** Collapsible overview map — status colors, clearer viewport mask. */
export default function DecisionGraphMiniMap() {
  const [open, setOpen] = useState(true);

  return (
    <Panel position="bottom-right" className="!m-3 flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white/95 px-2 text-[10px] font-semibold uppercase tracking-wide text-slate-600 shadow-sm backdrop-blur transition hover:border-slate-300 hover:bg-white"
        aria-expanded={open}
        aria-label={open ? 'Hide graph overview' : 'Show graph overview'}
      >
        <Map className="h-3 w-3 shrink-0" aria-hidden="true" />
        {open ? 'Hide' : 'Map'}
      </button>
      {open ? (
        <MiniMap
          pannable
          zoomable={false}
          nodeColor={nodeColor}
          nodeStrokeColor={nodeStrokeColor}
          nodeStrokeWidth={1.5}
          nodeBorderRadius={6}
          maskColor="rgba(248, 250, 252, 0.55)"
          maskStrokeColor="#16828C"
          maskStrokeWidth={2}
          ariaLabel="Decision graph overview"
          className="!rounded-xl !border !border-slate-200 !bg-white/95 !shadow-md"
          style={{ width: MINIMAP_WIDTH, height: MINIMAP_HEIGHT, margin: 0 }}
        />
      ) : null}
    </Panel>
  );
}
