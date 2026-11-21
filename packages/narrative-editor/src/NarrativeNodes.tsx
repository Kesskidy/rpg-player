import { Handle, Position, type NodeProps, type NodeTypes } from '@xyflow/react';
import type { NarrativeFlowNode } from './graph-adapter.js';

function EntryBadge() {
  return (
    <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-500/40">
      Départ
    </span>
  );
}

function DialogueNodeCard({ data, selected }: NodeProps<NarrativeFlowNode>) {
  const node = data.narrativeNode;
  const choices = node.choices ?? [];

  return (
    <div
      className={`w-60 border-2 bg-[#1E1A24] text-[#EFE6D5] shadow-[0px_4px_0px_#0B090E] ${
        selected ? 'border-[#DFA842]' : 'border-[#3E354A]'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !bg-indigo-400" />
      <div className="flex items-center justify-between rounded-t-lg border-b border-slate-800 bg-indigo-950/60 px-2.5 py-1.5">
        <span className="truncate text-[11px] font-semibold text-indigo-200">{node.title}</span>
        {data.isEntry && <EntryBadge />}
      </div>
      <div className="space-y-1.5 p-2.5 text-[11px]">
        {node.speaker && (
          <div className="font-semibold text-cyan-300">{node.speaker}</div>
        )}
        <p className="line-clamp-3 text-slate-300">{node.text || '…'}</p>

        {choices.length > 0 ? (
          <div className="space-y-1 border-t border-slate-800 pt-1.5">
            {choices.map((ch) => (
              <div
                key={ch.id}
                className="relative flex items-center justify-between rounded bg-slate-800/80 px-2 py-1 text-[10px] text-slate-200"
              >
                <span className="truncate pr-2">{ch.label}</span>
                <Handle
                  type="source"
                  id={`choice:${ch.id}`}
                  position={Position.Right}
                  className="!h-2.5 !w-2.5 !bg-indigo-400"
                />
              </div>
            ))}
          </div>
        ) : (
          <Handle
            type="source"
            id="next"
            position={Position.Right}
            className="!h-2.5 !w-2.5 !bg-indigo-400"
          />
        )}
      </div>
    </div>
  );
}

function ConditionNodeCard({ data, selected }: NodeProps<NarrativeFlowNode>) {
  const node = data.narrativeNode;
  return (
    <div
      className={`w-56 border-2 bg-[#1E1A24] text-[#EFE6D5] shadow-[0px_4px_0px_#0B090E] ${
        selected ? 'border-[#DFA842]' : 'border-[#3E354A]'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !bg-emerald-400" />
      <div className="flex items-center justify-between rounded-t-lg border-b border-slate-800 bg-emerald-950/60 px-2.5 py-1.5">
        <span className="truncate text-[11px] font-semibold text-emerald-200">
          ? {node.title}
        </span>
        {data.isEntry && <EntryBadge />}
      </div>
      <div className="space-y-2 p-2.5 text-[11px]">
        <code className="block truncate rounded bg-slate-900 px-2 py-1 font-mono text-[10px] text-amber-200">
          {node.condition || 'true'}
        </code>
        <div className="space-y-1">
          <div className="relative flex items-center justify-end pr-2 text-[10px] font-semibold text-emerald-300">
            Vrai
            <Handle
              type="source"
              id="true"
              position={Position.Right}
              className="!h-2.5 !w-2.5 !bg-emerald-400"
            />
          </div>
          <div className="relative flex items-center justify-end pr-2 text-[10px] font-semibold text-rose-300">
            Faux
            <Handle
              type="source"
              id="false"
              position={Position.Right}
              className="!h-2.5 !w-2.5 !bg-rose-400"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionNodeCard({ data, selected }: NodeProps<NarrativeFlowNode>) {
  const node = data.narrativeNode;
  const effects = node.effects ?? [];
  return (
    <div
      className={`w-56 border-2 bg-[#1E1A24] text-[#EFE6D5] shadow-[0px_4px_0px_#0B090E] ${
        selected ? 'border-[#DFA842]' : 'border-[#3E354A]'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !bg-amber-400" />
      <div className="flex items-center justify-between rounded-t-lg border-b border-slate-800 bg-amber-950/60 px-2.5 py-1.5">
        <span className="truncate text-[11px] font-semibold text-amber-200">
          ⚡ {node.title}
        </span>
        {data.isEntry && <EntryBadge />}
      </div>
      <div className="space-y-1 p-2.5 text-[10px] text-slate-300">
        {effects.length === 0 ? (
          <span className="italic text-slate-500">Aucun effet</span>
        ) : (
          effects.map((eff, idx) => (
            <div key={idx} className="truncate rounded bg-slate-800/80 px-2 py-0.5 font-mono">
              {eff.type === 'give_item' && `+item ${eff.itemId} ×${eff.quantity ?? 1}`}
              {eff.type === 'remove_item' && `-item ${eff.itemId} ×${eff.quantity ?? 1}`}
              {eff.type === 'set_var' && `${eff.key} = ${String(eff.value)}`}
              {eff.type === 'add_var' && `${eff.key} += ${eff.delta}`}
              {eff.type === 'heal' && `heal +${eff.hp} PV`}
              {eff.type === 'start_battle' && `combat: ${eff.enemyId}`}
            </div>
          ))
        )}
      </div>
      <Handle
        type="source"
        id="next"
        position={Position.Right}
        className="!h-2.5 !w-2.5 !bg-amber-400"
      />
    </div>
  );
}

function CinematicNodeCard({ data, selected }: NodeProps<NarrativeFlowNode>) {
  const node = data.narrativeNode;
  const cin = node.cinematic;
  return (
    <div
      className={`w-60 border-2 bg-[#1E1A24] text-[#EFE6D5] shadow-[0px_4px_0px_#0B090E] ${
        selected ? 'border-[#DFA842]' : 'border-[#3E354A]'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !bg-purple-400" />
      <div className="flex items-center justify-between rounded-t-lg border-b border-slate-800 bg-purple-950/60 px-2.5 py-1.5">
        <span className="truncate text-[11px] font-semibold text-purple-200">
          🎬 {node.title}
        </span>
        {data.isEntry && <EntryBadge />}
      </div>
      <div className="space-y-1 p-2.5 text-[10px] text-slate-300">
        <div className="truncate font-mono text-purple-200">
          {cin?.assetId ? `${cin.assetId} (${cin.clipName || 'default'})` : 'Aucun asset lié'}
        </div>
        <div className="flex flex-wrap gap-1">
          <span className="rounded bg-purple-500/20 px-1.5 py-0.5 uppercase text-purple-300">
            {cin?.displayMode ?? 'inset'}
          </span>
          {cin?.waitForCompletion && (
            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">Attendre fin</span>
          )}
          {cin?.loopInBackground && (
            <span className="rounded bg-cyan-500/20 px-1.5 py-0.5 text-cyan-300">Boucle fond</span>
          )}
        </div>
      </div>
      <Handle
        type="source"
        id="next"
        position={Position.Right}
        className="!h-2.5 !w-2.5 !bg-purple-400"
      />
    </div>
  );
}

function EndNodeCard({ data, selected }: NodeProps<NarrativeFlowNode>) {
  return (
    <div
      className={`w-36 border-2 bg-[#1E1A24] text-[#EFE6D5] shadow-[0px_4px_0px_#0B090E] ${
        selected ? 'border-[#C83232]' : 'border-[#3E354A]'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !bg-rose-400" />
      <div className="rounded-lg bg-rose-950/50 px-3 py-2 text-center text-xs font-semibold text-rose-200">
        ■ {data.narrativeNode.title || 'Fin'}
      </div>
    </div>
  );
}

export const NARRATIVE_NODE_TYPES: NodeTypes = {
  dialogue: DialogueNodeCard,
  condition: ConditionNodeCard,
  action: ActionNodeCard,
  cinematic: CinematicNodeCard,
  end: EndNodeCard,
};
