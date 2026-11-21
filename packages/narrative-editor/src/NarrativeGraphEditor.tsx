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
      <div className="relative flex flex-1 flex-col overflow-hidden bg-[#141218]">
        <div className="flex items-center justify-between border-b-2 border-[#3E354A] bg-[#1E1A24] px-3 py-2">
          <div className="flex items-center gap-1.5">
            <span className="mr-2 text-[11px] font-semibold uppercase tracking-wider text-[#A69B8D]">
              Ajouter :
            </span>
            <button
              type="button"
              onClick={() => handleAddNode('dialogue')}
              className="border-2 border-[#204872] bg-[#3C78B5]/30 px-2.5 py-1 text-xs font-bold text-[#EFE6D5] hover:bg-[#3C78B5]/60"
            >
              + Dialogue
            </button>
            <button
              type="button"
              onClick={() => handleAddNode('condition')}
              className="border-2 border-[#215E33] bg-[#3D9956]/30 px-2.5 py-1 text-xs font-bold text-[#EFE6D5] hover:bg-[#3D9956]/60"
            >
              + Condition
            </button>
            <button
              type="button"
              onClick={() => handleAddNode('action')}
              className="border-2 border-[#8A6118] bg-[#DFA842]/25 px-2.5 py-1 text-xs font-bold text-[#DFA842] hover:bg-[#DFA842]/45"
            >
              + Action RPG
            </button>
            <button
              type="button"
              onClick={() => handleAddNode('cinematic')}
              className="border-2 border-[#574B66] bg-[#2A2433] px-2.5 py-1 text-xs font-bold text-[#DFA842] hover:border-[#DFA842]"
            >
              + Cinématique
            </button>
            <button
              type="button"
              onClick={() => handleAddNode('end')}
              className="border-2 border-[#7A1A1A] bg-[#C83232]/30 px-2.5 py-1 text-xs font-bold text-[#EFE6D5] hover:bg-[#C83232]/60"
            >
              + Fin
            </button>
          </div>
          <span className="text-[11px] text-[#A69B8D]">
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
            <Background color="#3E354A" gap={20} />
            <Controls />
            <MiniMap
              nodeColor="#DFA842"
              maskColor="rgba(11, 9, 14, 0.8)"
              style={{ backgroundColor: '#1E1A24' }}
            />
          </ReactFlow>
        </div>
      </div>

      <aside className="w-80 border-l-2 border-[#3E354A] bg-[#1E1A24]">
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
