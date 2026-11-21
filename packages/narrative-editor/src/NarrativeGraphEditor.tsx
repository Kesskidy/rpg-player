import '@xyflow/react/dist/style.css';
import { useMemo, useState } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type NodeChange,
} from '@xyflow/react';
import type { AssetMeta, NarrativeGraph, NarrativeNodeType, RpgDatabase } from '@rpg-player/core-types';
import {
  applyFlowConnection,
  createNarrativeNode,
  narrativeGraphToFlow,
} from './graph-adapter.js';
import { NARRATIVE_NODE_TYPES } from './NarrativeNodes.js';
import { NodeInspector } from './NodeInspector.js';

export interface NarrativeGraphEditorProps {
  graph: NarrativeGraph;
  database: RpgDatabase;
  availableAssets?: Record<string, AssetMeta>;
  onChange: (next: NarrativeGraph) => void;
}

export function NarrativeGraphEditor({
  graph,
  database,
  availableAssets,
  onChange,
}: NarrativeGraphEditorProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    graph.entryNodeId ?? graph.nodes[0]?.id ?? null,
  );

  const { nodes, edges } = useMemo(() => narrativeGraphToFlow(graph), [graph]);

  function handleNodesChange(changes: NodeChange[]) {
    let positionChanged = false;
    const positionUpdates = new Map<string, { x: number; y: number }>();

    for (const change of changes) {
      if (change.type === 'position' && change.position) {
        positionUpdates.set(change.id, {
          x: Math.round(change.position.x),
          y: Math.round(change.position.y),
        });
        positionChanged = true;
      } else if (change.type === 'select' && change.selected) {
        setSelectedNodeId(change.id);
      }
    }

    if (positionChanged) {
      onChange({
        ...graph,
        nodes: graph.nodes.map((n) => {
          const pos = positionUpdates.get(n.id);
          return pos ? { ...n, position: pos } : n;
        }),
      });
    }
  }

  function handleConnect(connection: Connection) {
    onChange(applyFlowConnection(graph, connection));
  }

  function handleAddNode(type: NarrativeNodeType) {
    const offset = graph.nodes.length * 36;
    const created = createNarrativeNode(type, { x: 140 + (offset % 420), y: 120 + (offset % 260) });
    onChange({
      ...graph,
      nodes: [...graph.nodes, created],
    });
    setSelectedNodeId(created.id);
  }

  function handleDeleteNode(nodeId: string) {
    if (graph.nodes.length <= 1) return;
    const remaining = graph.nodes.filter((n) => n.id !== nodeId);
    const cleaned = remaining.map((n) => ({
      ...n,
      nextNodeId: n.nextNodeId === nodeId ? null : n.nextNodeId,
      trueNextNodeId: n.trueNextNodeId === nodeId ? null : n.trueNextNodeId,
      falseNextNodeId: n.falseNextNodeId === nodeId ? null : n.falseNextNodeId,
      choices: n.choices?.map((ch) =>
        ch.nextNodeId === nodeId ? { ...ch, nextNodeId: null } : ch,
      ),
    }));
    const entryNodeId =
      graph.entryNodeId === nodeId ? (cleaned[0]?.id ?? '') : graph.entryNodeId;

    onChange({ ...graph, entryNodeId, nodes: cleaned });
    setSelectedNodeId(cleaned[0]?.id ?? null);
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="relative flex flex-1 flex-col overflow-hidden bg-[#0b0d12]">
        <div className="flex items-center justify-between border-b border-slate-800 bg-[#121620] px-3 py-2">
          <div className="flex items-center gap-1.5">
            <span className="mr-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Ajouter :
            </span>
            <button
              type="button"
              onClick={() => handleAddNode('dialogue')}
              className="rounded bg-indigo-600/30 px-2.5 py-1 text-xs font-medium text-indigo-200 ring-1 ring-indigo-500/50 hover:bg-indigo-600/50"
            >
              + Dialogue
            </button>
            <button
              type="button"
              onClick={() => handleAddNode('condition')}
              className="rounded bg-emerald-600/25 px-2.5 py-1 text-xs font-medium text-emerald-200 ring-1 ring-emerald-500/40 hover:bg-emerald-600/45"
            >
              + Condition
            </button>
            <button
              type="button"
              onClick={() => handleAddNode('action')}
              className="rounded bg-amber-600/25 px-2.5 py-1 text-xs font-medium text-amber-200 ring-1 ring-amber-500/40 hover:bg-amber-600/45"
            >
              + Action RPG
            </button>
            <button
              type="button"
              onClick={() => handleAddNode('cinematic')}
              className="rounded bg-purple-600/25 px-2.5 py-1 text-xs font-medium text-purple-200 ring-1 ring-purple-500/40 hover:bg-purple-600/45"
            >
              + Cinématique
            </button>
            <button
              type="button"
              onClick={() => handleAddNode('end')}
              className="rounded bg-rose-600/25 px-2.5 py-1 text-xs font-medium text-rose-200 ring-1 ring-rose-500/40 hover:bg-rose-600/45"
            >
              + Fin
            </button>
          </div>
          <span className="text-[11px] text-slate-500">
            Reliez les points de sortie aux nœuds suivants (style Twine)
          </span>
        </div>

        <div className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NARRATIVE_NODE_TYPES}
            onNodesChange={handleNodesChange}
            onConnect={handleConnect}
            onNodeClick={(_event, node) => setSelectedNodeId(node.id)}
            fitView
            colorMode="dark"
          >
            <Background color="#252d40" gap={20} />
            <Controls />
            <MiniMap
              nodeColor="#4f46e5"
              maskColor="rgba(11, 13, 18, 0.75)"
              style={{ backgroundColor: '#121620' }}
            />
          </ReactFlow>
        </div>
      </div>

      <aside className="w-80 border-l border-slate-800 bg-[#121620]">
        <NodeInspector
          graph={graph}
          selectedNodeId={selectedNodeId}
          database={database}
          availableAssets={availableAssets}
          onChangeGraph={onChange}
          onDeleteNode={handleDeleteNode}
        />
      </aside>
    </div>
  );
}
