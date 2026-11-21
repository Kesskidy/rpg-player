import type { NarrativeGraph, NarrativeNode, NarrativeNodeType } from '@rpg-player/core-types';
import type { Connection, Edge, Node } from '@xyflow/react';

export interface NarrativeFlowNodeData extends Record<string, unknown> {
  narrativeNode: NarrativeNode;
  isEntry: boolean;
}

export type NarrativeFlowNode = Node<NarrativeFlowNodeData, NarrativeNodeType>;

export function narrativeGraphToFlow(graph: NarrativeGraph): {
  nodes: NarrativeFlowNode[];
  edges: Edge[];
} {
  const nodes: NarrativeFlowNode[] = graph.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: { x: n.position.x, y: n.position.y },
    data: {
      narrativeNode: n,
      isEntry: graph.entryNodeId === n.id,
    },
  }));

  const edges: Edge[] = [];
  const validIds = new Set(graph.nodes.map((n) => n.id));

  for (const n of graph.nodes) {
    if (n.type === 'dialogue') {
      if (n.choices && n.choices.length > 0) {
        for (const ch of n.choices) {
          if (ch.nextNodeId && validIds.has(ch.nextNodeId)) {
            edges.push({
              id: `${n.id}::choice:${ch.id}->${ch.nextNodeId}`,
              source: n.id,
              sourceHandle: `choice:${ch.id}`,
              target: ch.nextNodeId,
              label: ch.label.length > 24 ? `${ch.label.slice(0, 22)}…` : ch.label,
              animated: false,
              style: { stroke: '#818cf8', strokeWidth: 2 },
            });
          }
        }
      } else if (n.nextNodeId && validIds.has(n.nextNodeId)) {
        edges.push({
          id: `${n.id}::next->${n.nextNodeId}`,
          source: n.id,
          sourceHandle: 'next',
          target: n.nextNodeId,
          style: { stroke: '#818cf8', strokeWidth: 2 },
        });
      }
    } else if (n.type === 'condition') {
      if (n.trueNextNodeId && validIds.has(n.trueNextNodeId)) {
        edges.push({
          id: `${n.id}::true->${n.trueNextNodeId}`,
          source: n.id,
          sourceHandle: 'true',
          target: n.trueNextNodeId,
          label: 'Vrai',
          style: { stroke: '#34d399', strokeWidth: 2 },
        });
      }
      if (n.falseNextNodeId && validIds.has(n.falseNextNodeId)) {
        edges.push({
          id: `${n.id}::false->${n.falseNextNodeId}`,
          source: n.id,
          sourceHandle: 'false',
          target: n.falseNextNodeId,
          label: 'Faux',
          style: { stroke: '#f87171', strokeWidth: 2 },
        });
      }
    } else if (n.type === 'action') {
      if (n.nextNodeId && validIds.has(n.nextNodeId)) {
        edges.push({
          id: `${n.id}::next->${n.nextNodeId}`,
          source: n.id,
          sourceHandle: 'next',
          target: n.nextNodeId,
          style: { stroke: '#fbbf24', strokeWidth: 2 },
        });
      }
    }
  }

  return { nodes, edges };
}

export function applyFlowConnection(
  graph: NarrativeGraph,
  connection: Connection,
): NarrativeGraph {
  if (!connection.source || !connection.target || connection.source === connection.target) {
    return graph;
  }

  const handle = connection.sourceHandle ?? 'next';
  const nextNodes = graph.nodes.map((node) => {
    if (node.id !== connection.source) return node;

    if (node.type === 'dialogue') {
      if (handle.startsWith('choice:')) {
        const choiceId = handle.slice('choice:'.length);
        return {
          ...node,
          choices: (node.choices ?? []).map((ch) =>
            ch.id === choiceId ? { ...ch, nextNodeId: connection.target } : ch,
          ),
        };
      }
      return { ...node, nextNodeId: connection.target };
    }

    if (node.type === 'condition') {
      if (handle === 'true') {
        return { ...node, trueNextNodeId: connection.target };
      }
      if (handle === 'false') {
        return { ...node, falseNextNodeId: connection.target };
      }
    }

    if (node.type === 'action') {
      return { ...node, nextNodeId: connection.target };
    }

    return node;
  });

  return { ...graph, nodes: nextNodes };
}

export function createNarrativeNode(
  type: NarrativeNodeType,
  position: { x: number; y: number },
): NarrativeNode {
  const id = `node_${type}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
  switch (type) {
    case 'dialogue':
      return {
        id,
        type: 'dialogue',
        position,
        title: 'Nouveau dialogue',
        speaker: 'PNJ',
        text: 'Bonjour, aventurier !',
        choices: [],
        nextNodeId: null,
      };
    case 'condition':
      return {
        id,
        type: 'condition',
        position,
        title: 'Condition',
        condition: 'has_item("cle_fer")',
        trueNextNodeId: null,
        falseNextNodeId: null,
      };
    case 'action':
      return {
        id,
        type: 'action',
        position,
        title: 'Action RPG',
        effects: [{ type: 'give_item', itemId: 'potion_soin', quantity: 1 }],
        nextNodeId: null,
      };
    case 'end':
      return {
        id,
        type: 'end',
        position,
        title: 'Fin',
      };
  }
}
