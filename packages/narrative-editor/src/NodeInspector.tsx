import type {
  AssetMeta,
  CinematicDisplayMode,
  DialogueChoice,
  NarrativeEffect,
  NarrativeGraph,
  NarrativeNode,
  RpgDatabase,
} from '@rpg-player/core-types';

interface NodeInspectorProps {
  graph: NarrativeGraph;
  selectedNodeId: string | null;
  database: RpgDatabase;
  availableAssets?: Record<string, AssetMeta>;
  onChangeGraph: (next: NarrativeGraph) => void;
  onDeleteNode: (nodeId: string) => void;
}

export function NodeInspector({
  graph,
  selectedNodeId,
  database,
  availableAssets,
  onChangeGraph,
  onDeleteNode,
}: NodeInspectorProps) {
  const node = graph.nodes.find((n) => n.id === selectedNodeId) ?? null;

  if (!node) {
    return (
      <div className="flex h-full flex-col justify-center p-4 text-center text-xs text-slate-400">
        Cliquez sur un nœud du graphe pour éditer son contenu, ses choix, ses conditions ou ses
        effets RPG.
      </div>
    );
  }

  const itemIds = Object.keys(database.items);
  const enemyIds = Object.keys(database.enemies);

  function patchNode(updater: (current: NarrativeNode) => NarrativeNode) {
    onChangeGraph({
      ...graph,
      nodes: graph.nodes.map((n) => (n.id === node!.id ? updater(n) : n)),
    });
  }

  function addChoice() {
    const newChoice: DialogueChoice = {
      id: `ch_${Date.now().toString(36)}`,
      label: 'Nouveau choix',
      nextNodeId: null,
    };
    patchNode((cur) => ({
      ...cur,
      choices: [...(cur.choices ?? []), newChoice],
    }));
  }

  function addEffect(type: NarrativeEffect['type']) {
    let effect: NarrativeEffect;
    switch (type) {
      case 'give_item':
        effect = { type: 'give_item', itemId: itemIds[0] ?? 'potion_soin', quantity: 1 };
        break;
      case 'remove_item':
        effect = { type: 'remove_item', itemId: itemIds[0] ?? 'cle_fer', quantity: 1 };
        break;
      case 'set_var':
        effect = { type: 'set_var', key: 'quete_active', value: true };
        break;
      case 'add_var':
        effect = { type: 'add_var', key: 'reputation', delta: 1 };
        break;
      case 'heal':
        effect = { type: 'heal', hp: 30, mp: 10 };
        break;
      case 'start_battle':
        effect = { type: 'start_battle', enemyId: enemyIds[0] ?? 'gobelin_eclaireur' };
        break;
    }
    patchNode((cur) => ({
      ...cur,
      effects: [...(cur.effects ?? []), effect],
    }));
  }

  const otherNodes = graph.nodes.filter((n) => n.id !== node.id);

  return (
    <div className="flex h-full flex-col space-y-3 overflow-y-auto p-3 text-xs text-slate-200">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div>
          <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] uppercase text-indigo-300">
            {node.type}
          </span>
          <span className="ml-2 font-mono text-[10px] text-slate-500">{node.id}</span>
        </div>
        <button
          type="button"
          onClick={() => onDeleteNode(node.id)}
          disabled={graph.nodes.length <= 1}
          className="rounded bg-rose-950/60 px-2 py-0.5 text-[11px] text-rose-300 hover:bg-rose-900/60 disabled:opacity-30"
        >
          Supprimer
        </button>
      </div>

      <label className="block text-[11px] text-slate-400">
        Titre du nœud
        <input
          type="text"
          value={node.title}
          onChange={(e) => patchNode((c) => ({ ...c, title: e.target.value }))}
          className="mt-0.5 w-full rounded border border-slate-700 bg-[#1a202e] px-2 py-1 text-xs text-white outline-none focus:border-indigo-500"
        />
      </label>

      {graph.entryNodeId !== node.id && (
        <button
          type="button"
          onClick={() => onChangeGraph({ ...graph, entryNodeId: node.id })}
          className="w-full rounded border border-emerald-500/40 bg-emerald-950/30 py-1 text-[11px] font-medium text-emerald-300 hover:bg-emerald-950/60"
        >
          Définir comme point de départ
        </button>
      )}

      {node.type === 'dialogue' && (
        <>
          <label className="block text-[11px] text-slate-400">
            Personnage qui parle
            <input
              type="text"
              value={node.speaker ?? ''}
              onChange={(e) => patchNode((c) => ({ ...c, speaker: e.target.value }))}
              className="mt-0.5 w-full rounded border border-slate-700 bg-[#1a202e] px-2 py-1 text-xs text-white"
            />
          </label>

          <label className="block text-[11px] text-slate-400">
            Texte du dialogue
            <textarea
              rows={4}
              value={node.text ?? ''}
              onChange={(e) => patchNode((c) => ({ ...c, text: e.target.value }))}
              className="mt-0.5 w-full rounded border border-slate-700 bg-[#1a202e] px-2 py-1 text-xs text-white"
            />
          </label>

          <div className="space-y-2 border-t border-slate-800 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase text-slate-400">
                Choix ({(node.choices ?? []).length})
              </span>
              <button
                type="button"
                onClick={addChoice}
                className="rounded bg-indigo-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-indigo-500"
              >
                + Choix
              </button>
            </div>

            {(node.choices ?? []).length === 0 ? (
              <label className="block text-[11px] text-slate-400">
                Nœud suivant (dialogue linéaire)
                <select
                  value={node.nextNodeId ?? ''}
                  onChange={(e) =>
                    patchNode((c) => ({ ...c, nextNodeId: e.target.value || null }))
                  }
                  className="mt-0.5 w-full rounded border border-slate-700 bg-[#1a202e] px-2 py-1 text-xs text-white"
                >
                  <option value="">(Fin de dialogue)</option>
                  {otherNodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.title} ({n.type})
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="space-y-2">
                {(node.choices ?? []).map((choice, idx) => (
                  <div
                    key={choice.id}
                    className="space-y-1.5 rounded border border-slate-800 bg-[#1a202e]/60 p-2"
                  >
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={choice.label}
                        onChange={(e) =>
                          patchNode((c) => ({
                            ...c,
                            choices: (c.choices ?? []).map((item, i) =>
                              i === idx ? { ...item, label: e.target.value } : item,
                            ),
                          }))
                        }
                        className="flex-1 rounded border border-slate-700 bg-[#121620] px-1.5 py-1 text-xs text-white"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          patchNode((c) => ({
                            ...c,
                            choices: (c.choices ?? []).filter((_, i) => i !== idx),
                          }))
                        }
                        className="rounded px-1.5 py-0.5 text-rose-400 hover:bg-rose-950/60"
                      >
                        ×
                      </button>
                    </div>
                    <input
                      type="text"
                      value={choice.condition ?? ''}
                      placeholder='Condition optionnelle (ex: has_item("cle_fer"))'
                      onChange={(e) =>
                        patchNode((c) => ({
                          ...c,
                          choices: (c.choices ?? []).map((item, i) =>
                            i === idx ? { ...item, condition: e.target.value } : item,
                          ),
                        }))
                      }
                      className="w-full rounded border border-slate-700 bg-[#121620] px-1.5 py-0.5 font-mono text-[10px] text-amber-200"
                    />
                    <select
                      value={choice.nextNodeId ?? ''}
                      onChange={(e) =>
                        patchNode((c) => ({
                          ...c,
                          choices: (c.choices ?? []).map((item, i) =>
                            i === idx ? { ...item, nextNodeId: e.target.value || null } : item,
                          ),
                        }))
                      }
                      className="w-full rounded border border-slate-700 bg-[#121620] px-1.5 py-1 text-[11px] text-slate-200"
                    >
                      <option value="">(Aucun lien)</option>
                      {otherNodes.map((n) => (
                        <option key={n.id} value={n.id}>
                          → {n.title}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {node.type === 'condition' && (
        <div className="space-y-2.5">
          <label className="block text-[11px] text-slate-400">
            Expression de condition
            <input
              type="text"
              value={node.condition ?? ''}
              onChange={(e) => patchNode((c) => ({ ...c, condition: e.target.value }))}
              placeholder='has_item("cle_fer")'
              className="mt-0.5 w-full rounded border border-slate-700 bg-[#1a202e] px-2 py-1 font-mono text-xs text-amber-200"
            />
          </label>
          <div className="flex flex-wrap gap-1">
            {['has_item("cle_fer")', 'flag("porte_ouverte")', 'var("reputation") >= 5'].map(
              (snippet) => (
                <button
                  key={snippet}
                  type="button"
                  onClick={() => patchNode((c) => ({ ...c, condition: snippet }))}
                  className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300 hover:bg-slate-700"
                >
                  {snippet}
                </button>
              ),
            )}
          </div>
          <label className="block text-[11px] text-emerald-300">
            Si Vrai →
            <select
              value={node.trueNextNodeId ?? ''}
              onChange={(e) =>
                patchNode((c) => ({ ...c, trueNextNodeId: e.target.value || null }))
              }
              className="mt-0.5 w-full rounded border border-slate-700 bg-[#1a202e] px-2 py-1 text-xs text-white"
            >
              <option value="">(Fin)</option>
              {otherNodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.title}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[11px] text-rose-300">
            Si Faux →
            <select
              value={node.falseNextNodeId ?? ''}
              onChange={(e) =>
                patchNode((c) => ({ ...c, falseNextNodeId: e.target.value || null }))
              }
              className="mt-0.5 w-full rounded border border-slate-700 bg-[#1a202e] px-2 py-1 text-xs text-white"
            >
              <option value="">(Fin)</option>
              {otherNodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.title}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {node.type === 'action' && (
        <div className="space-y-2.5">
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => addEffect('give_item')}
              className="rounded bg-amber-600/25 px-2 py-0.5 text-[10px] text-amber-200 hover:bg-amber-600/40"
            >
              + Donner objet
            </button>
            <button
              type="button"
              onClick={() => addEffect('set_var')}
              className="rounded bg-indigo-600/25 px-2 py-0.5 text-[10px] text-indigo-200 hover:bg-indigo-600/40"
            >
              + Variable
            </button>
            <button
              type="button"
              onClick={() => addEffect('start_battle')}
              className="rounded bg-rose-600/25 px-2 py-0.5 text-[10px] text-rose-200 hover:bg-rose-600/40"
            >
              + Combat
            </button>
          </div>

          <div className="space-y-2">
            {(node.effects ?? []).map((eff, idx) => (
              <div
                key={idx}
                className="space-y-1 rounded border border-slate-800 bg-[#1a202e]/60 p-2"
              >
                <div className="flex items-center justify-between text-[10px] font-semibold uppercase text-amber-300">
                  <span>{eff.type}</span>
                  <button
                    type="button"
                    onClick={() =>
                      patchNode((c) => ({
                        ...c,
                        effects: (c.effects ?? []).filter((_, i) => i !== idx),
                      }))
                    }
                    className="text-rose-400"
                  >
                    ×
                  </button>
                </div>

                {(eff.type === 'give_item' || eff.type === 'remove_item') && (
                  <div className="flex gap-1">
                    <select
                      value={eff.itemId}
                      onChange={(e) =>
                        patchNode((c) => ({
                          ...c,
                          effects: (c.effects ?? []).map((it, i) =>
                            i === idx ? { ...eff, itemId: e.target.value } : it,
                          ),
                        }))
                      }
                      className="flex-1 rounded border border-slate-700 bg-[#121620] px-1.5 py-1 text-[11px] text-white"
                    >
                      {itemIds.map((id) => (
                        <option key={id} value={id}>
                          {database.items[id]?.name ?? id}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      value={eff.quantity ?? 1}
                      onChange={(e) =>
                        patchNode((c) => ({
                          ...c,
                          effects: (c.effects ?? []).map((it, i) =>
                            i === idx
                              ? { ...eff, quantity: Math.max(1, Number(e.target.value)) }
                              : it,
                          ),
                        }))
                      }
                      className="w-14 rounded border border-slate-700 bg-[#121620] px-1.5 py-1 font-mono text-[11px] text-white"
                    />
                  </div>
                )}

                {eff.type === 'set_var' && (
                  <div className="grid grid-cols-2 gap-1">
                    <input
                      type="text"
                      value={eff.key}
                      onChange={(e) =>
                        patchNode((c) => ({
                          ...c,
                          effects: (c.effects ?? []).map((it, i) =>
                            i === idx ? { ...eff, key: e.target.value } : it,
                          ),
                        }))
                      }
                      className="rounded border border-slate-700 bg-[#121620] px-1.5 py-1 font-mono text-[11px] text-white"
                    />
                    <input
                      type="text"
                      value={String(eff.value)}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const parsed =
                          raw === 'true'
                            ? true
                            : raw === 'false'
                              ? false
                              : raw !== '' && !Number.isNaN(Number(raw))
                                ? Number(raw)
                                : raw;
                        patchNode((c) => ({
                          ...c,
                          effects: (c.effects ?? []).map((it, i) =>
                            i === idx ? { ...eff, value: parsed } : it,
                          ),
                        }));
                      }}
                      className="rounded border border-slate-700 bg-[#121620] px-1.5 py-1 font-mono text-[11px] text-white"
                    />
                  </div>
                )}

                {eff.type === 'start_battle' && (
                  <select
                    value={eff.enemyId}
                    onChange={(e) =>
                      patchNode((c) => ({
                        ...c,
                        effects: (c.effects ?? []).map((it, i) =>
                          i === idx ? { ...eff, enemyId: e.target.value } : it,
                        ),
                      }))
                    }
                    className="w-full rounded border border-slate-700 bg-[#121620] px-1.5 py-1 text-[11px] text-white"
                  >
                    {enemyIds.map((id) => (
                      <option key={id} value={id}>
                        {database.enemies[id]?.name ?? id}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>

          <label className="block text-[11px] text-slate-400">
            Nœud suivant →
            <select
              value={node.nextNodeId ?? ''}
              onChange={(e) => patchNode((c) => ({ ...c, nextNodeId: e.target.value || null }))}
              className="mt-0.5 w-full rounded border border-slate-700 bg-[#1a202e] px-2 py-1 text-xs text-white"
            >
              <option value="">(Fin)</option>
              {otherNodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.title}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {node.type === 'cinematic' && (
        <div className="space-y-2.5">
          {(() => {
            const cin = node.cinematic ?? {
              assetId: '',
              clipName: 'idle',
              displayMode: 'inset' as CinematicDisplayMode,
              waitForCompletion: true,
              loopInBackground: false,
              playbackSpeed: 1,
              caption: '',
            };
            const patchCin = (patch: Partial<typeof cin>) =>
              patchNode((c) => ({ ...c, cinematic: { ...cin, ...patch } }));
            const assetList = Object.values(availableAssets ?? {});
            const selectedAsset = cin.assetId ? availableAssets?.[cin.assetId] : undefined;
            const clipNames = selectedAsset ? Object.keys(selectedAsset.animations) : [];

            return (
              <>
                <label className="block text-[11px] text-slate-400">
                  Asset animé / Cinématique
                  {assetList.length > 0 ? (
                    <select
                      value={cin.assetId}
                      onChange={(e) => {
                        const nextId = e.target.value;
                        const firstClip = nextId
                          ? Object.keys(availableAssets?.[nextId]?.animations ?? {})[0] ?? 'idle'
                          : 'idle';
                        patchCin({ assetId: nextId, clipName: firstClip });
                      }}
                      className="mt-0.5 w-full rounded border border-slate-700 bg-[#1a202e] px-2 py-1 text-xs text-white"
                    >
                      <option value="">(Choisir un asset…)</option>
                      {assetList.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.type} · {a.frameCount}f)
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={cin.assetId}
                      onChange={(e) => patchCin({ assetId: e.target.value })}
                      placeholder="ID d’asset animé"
                      className="mt-0.5 w-full rounded border border-slate-700 bg-[#1a202e] px-2 py-1 font-mono text-xs text-white"
                    />
                  )}
                </label>

                <label className="block text-[11px] text-slate-400">
                  Clip d’animation
                  {clipNames.length > 0 ? (
                    <select
                      value={cin.clipName}
                      onChange={(e) => patchCin({ clipName: e.target.value })}
                      className="mt-0.5 w-full rounded border border-slate-700 bg-[#1a202e] px-2 py-1 text-xs text-white"
                    >
                      {clipNames.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={cin.clipName}
                      onChange={(e) => patchCin({ clipName: e.target.value })}
                      className="mt-0.5 w-full rounded border border-slate-700 bg-[#1a202e] px-2 py-1 font-mono text-xs text-white"
                    />
                  )}
                </label>

                <div className="grid grid-cols-2 gap-1.5">
                  <label className="block text-[11px] text-slate-400">
                    Affichage
                    <select
                      value={cin.displayMode}
                      onChange={(e) =>
                        patchCin({ displayMode: e.target.value as CinematicDisplayMode })
                      }
                      className="mt-0.5 w-full rounded border border-slate-700 bg-[#1a202e] px-2 py-1 text-xs text-white"
                    >
                      <option value="fullscreen">Plein écran</option>
                      <option value="inset">Encart dialogue</option>
                      <option value="background">Arrière-plan</option>
                    </select>
                  </label>
                  <label className="block text-[11px] text-slate-400">
                    Vitesse
                    <select
                      value={cin.playbackSpeed ?? 1}
                      onChange={(e) => patchCin({ playbackSpeed: Number(e.target.value) })}
                      className="mt-0.5 w-full rounded border border-slate-700 bg-[#1a202e] px-2 py-1 font-mono text-xs text-white"
                    >
                      <option value={0.5}>×0.5</option>
                      <option value={1}>×1</option>
                      <option value={2}>×2</option>
                    </select>
                  </label>
                </div>

                <label className="flex cursor-pointer items-center gap-2 text-[11px] text-slate-200">
                  <input
                    type="checkbox"
                    checked={cin.waitForCompletion}
                    onChange={(e) => patchCin({ waitForCompletion: e.target.checked })}
                    className="accent-purple-500"
                  />
                  Attendre la fin avant le prochain dialogue
                </label>

                <label className="flex cursor-pointer items-center gap-2 text-[11px] text-slate-200">
                  <input
                    type="checkbox"
                    checked={cin.loopInBackground}
                    onChange={(e) => patchCin({ loopInBackground: e.target.checked })}
                    className="accent-cyan-500"
                  />
                  Jouer en boucle en arrière-plan
                </label>

                <label className="block text-[11px] text-slate-400">
                  Sous-titre / Légende (optionnel)
                  <input
                    type="text"
                    value={cin.caption ?? ''}
                    onChange={(e) => patchCin({ caption: e.target.value })}
                    className="mt-0.5 w-full rounded border border-slate-700 bg-[#1a202e] px-2 py-1 text-xs text-white"
                  />
                </label>

                <label className="block text-[11px] text-slate-400">
                  Nœud suivant →
                  <select
                    value={node.nextNodeId ?? ''}
                    onChange={(e) =>
                      patchNode((c) => ({ ...c, nextNodeId: e.target.value || null }))
                    }
                    className="mt-0.5 w-full rounded border border-slate-700 bg-[#1a202e] px-2 py-1 text-xs text-white"
                  >
                    <option value="">(Fin)</option>
                    {otherNodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.title}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
