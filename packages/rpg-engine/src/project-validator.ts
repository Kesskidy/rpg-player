import type {
  NarrativeGraph,
  ProjectManifest,
  RpgDatabase,
  TileMapData,
} from '@rpg-player/core-types';

export type ProjectIssueSeverity = 'error' | 'warning';
export type ProjectIssueCategory = 'map' | 'narrative' | 'database' | 'asset';

export interface ProjectIssue {
  id: string;
  severity: ProjectIssueSeverity;
  category: ProjectIssueCategory;
  targetId: string;
  targetName: string;
  message: string;
}

export interface ProjectValidationInput {
  manifest: ProjectManifest;
  maps: Record<string, TileMapData>;
  narratives: Record<string, NarrativeGraph>;
  database: RpgDatabase | null;
}

/**
 * Headless RPG project integrity checker (A4).
 * Scans maps, narrative graphs, database items/enemies, and animation clips
 * to surface broken references before playtesting or sharing.
 */
export function validateProjectConsistency(input: ProjectValidationInput): ProjectIssue[] {
  const issues: ProjectIssue[] = [];
  const { manifest, maps, narratives, database } = input;
  const assetIds = new Set(Object.keys(manifest.assets ?? {}));
  const mapIds = new Set([...Object.keys(manifest.maps ?? {}), ...Object.keys(maps)]);
  const narrativeIds = new Set([
    ...Object.keys(manifest.narratives ?? {}),
    ...Object.keys(narratives),
  ]);

  let seq = 0;
  const addIssue = (
    severity: ProjectIssueSeverity,
    category: ProjectIssueCategory,
    targetId: string,
    targetName: string,
    message: string,
  ) => {
    seq += 1;
    issues.push({
      id: `issue_${seq}`,
      severity,
      category,
      targetId,
      targetName,
      message,
    });
  };

  // 1. Validate AssetMeta animations & `hit_frame` markers
  for (const asset of Object.values(manifest.assets ?? {})) {
    for (const [clipName, clip] of Object.entries(asset.animations ?? {})) {
      if (!clip.frames || clip.frames.length === 0) {
        addIssue(
          'warning',
          'asset',
          asset.id,
          asset.name,
          `Clip d’animation « ${clipName} » sans aucune frame.`,
        );
        continue;
      }
      for (const frameIdx of clip.frames) {
        if (frameIdx < 0 || frameIdx >= asset.frameCount) {
          addIssue(
            'error',
            'asset',
            asset.id,
            asset.name,
            `Clip « ${clipName} » référence la frame #${frameIdx} hors limites (0..${asset.frameCount - 1}).`,
          );
        }
      }
      for (const marker of clip.markers ?? []) {
        if (marker.frameIndex < 0 || marker.frameIndex >= clip.frames.length) {
          addIssue(
            'error',
            'asset',
            asset.id,
            asset.name,
            `Marqueur « ${marker.event} » sur la frame #${marker.frameIndex} du clip « ${clipName} » hors limites (0..${clip.frames.length - 1}).`,
          );
        }
      }
    }
  }

  // 2. Validate Maps: tile asset refs, player sprite, teleports, narrative & enemy links
  for (const map of Object.values(maps)) {
    if (map.playerAssetId && !assetIds.has(map.playerAssetId)) {
      addIssue(
        'warning',
        'map',
        map.id,
        map.name,
        `Sprite joueur « ${map.playerAssetId} » introuvable dans le projet.`,
      );
    }

    const missingTilesets = new Set<string>();
    for (const layer of map.layers) {
      for (const stack of Object.values(layer.cells)) {
        for (const cell of stack) {
          if (!assetIds.has(cell.assetId) && !missingTilesets.has(cell.assetId)) {
            missingTilesets.add(cell.assetId);
            addIssue(
              'error',
              'map',
              map.id,
              map.name,
              `Calque « ${layer.name} » utilise l’asset manquant « ${cell.assetId} ».`,
            );
          }
        }
      }
    }

    for (const ev of map.events ?? []) {
      if (ev.spriteAssetId && !assetIds.has(ev.spriteAssetId)) {
        addIssue(
          'warning',
          'map',
          map.id,
          map.name,
          `Événement « ${ev.name} » référence un sprite introuvable (« ${ev.spriteAssetId} »).`,
        );
      }
      if (ev.teleport) {
        if (!mapIds.has(ev.teleport.targetMapId)) {
          addIssue(
            'error',
            'map',
            map.id,
            map.name,
            `Téléportation de « ${ev.name} » pointe vers une map inexistante (« ${ev.teleport.targetMapId} »).`,
          );
        } else {
          const targetMap = maps[ev.teleport.targetMapId];
          if (
            targetMap &&
            (ev.teleport.targetX < 0 ||
              ev.teleport.targetY < 0 ||
              ev.teleport.targetX >= targetMap.width ||
              ev.teleport.targetY >= targetMap.height)
          ) {
            addIssue(
              'error',
              'map',
              map.id,
              map.name,
              `Téléportation de « ${ev.name} » hors bornes (${ev.teleport.targetX},${ev.teleport.targetY}) sur « ${targetMap.name} ».`,
            );
          }
        }
      }
      if (ev.narrativeId && !narrativeIds.has(ev.narrativeId)) {
        addIssue(
          'error',
          'map',
          map.id,
          map.name,
          `Événement « ${ev.name} » pointe vers un dialogue introuvable (« ${ev.narrativeId} »).`,
        );
      }
      if (ev.battleEnemyId && database && !database.enemies[ev.battleEnemyId]) {
        addIssue(
          'error',
          'map',
          map.id,
          map.name,
          `Événement « ${ev.name} » déclenche un ennemi inconnu (« ${ev.battleEnemyId} »).`,
        );
      }
    }
  }

  // 3. Validate Narrative Graphs: entryNodeId, reachable/orphan nodes, unknown items/enemies/assets
  for (const graph of Object.values(narratives)) {
    const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
    if (!nodeById.has(graph.entryNodeId)) {
      addIssue(
        'error',
        'narrative',
        graph.id,
        graph.name,
        `Nœud d’entrée « ${graph.entryNodeId} » introuvable.`,
      );
    }

    // BFS from entryNodeId to detect orphan nodes
    const visited = new Set<string>();
    const queue: string[] = nodeById.has(graph.entryNodeId) ? [graph.entryNodeId] : [];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const node = nodeById.get(id);
      if (!node) continue;

      const targets: Array<string | null | undefined> = [
        node.nextNodeId,
        node.trueNextNodeId,
        node.falseNextNodeId,
        ...(node.choices ?? []).map((c) => c.nextNodeId),
      ];
      for (const target of targets) {
        if (!target) continue;
        if (!nodeById.has(target)) {
          addIssue(
            'error',
            'narrative',
            graph.id,
            graph.name,
            `Le nœud « ${node.title} » pointe vers un nœud inexistant (« ${target} »).`,
          );
        } else if (!visited.has(target)) {
          queue.push(target);
        }
      }
    }

    for (const node of graph.nodes) {
      if (!visited.has(node.id)) {
        addIssue(
          'warning',
          'narrative',
          graph.id,
          graph.name,
          `Nœud orphelin inatteignable : « ${node.title} » (${node.id}).`,
        );
      }

      if (node.type === 'cinematic' && node.cinematic?.assetId) {
        if (!assetIds.has(node.cinematic.assetId)) {
          addIssue(
            'warning',
            'narrative',
            graph.id,
            graph.name,
            `Cinématique « ${node.title} » référence l’asset manquant « ${node.cinematic.assetId} ».`,
          );
        }
      }

      const allEffects = [
        ...(node.effects ?? []),
        ...(node.choices ?? []).flatMap((c) => c.effects ?? []),
      ];
      for (const eff of allEffects) {
        if ((eff.type === 'give_item' || eff.type === 'remove_item') && database) {
          if (!database.items[eff.itemId]) {
            addIssue(
              'error',
              'narrative',
              graph.id,
              graph.name,
              `Nœud « ${node.title} » utilise un objet inconnu dans la base RPG (« ${eff.itemId} »).`,
            );
          }
        } else if (eff.type === 'start_battle' && database) {
          if (!database.enemies[eff.enemyId]) {
            addIssue(
              'error',
              'narrative',
              graph.id,
              graph.name,
              `Nœud « ${node.title} » déclenche un ennemi inconnu (« ${eff.enemyId} »).`,
            );
          }
        }
      }
    }
  }

  // 4. Validate Database cross-references
  if (database) {
    for (const startItem of database.hero.startingItems ?? []) {
      if (!database.items[startItem.itemId]) {
        addIssue(
          'error',
          'database',
          'hero',
          database.hero.name,
          `Objet de départ du héros introuvable : « ${startItem.itemId} ».`,
        );
      }
    }
    for (const skillId of database.hero.skillIds ?? []) {
      if (!database.skills[skillId]) {
        addIssue(
          'error',
          'database',
          'hero',
          database.hero.name,
          `Compétence du héros introuvable : « ${skillId} ».`,
        );
      }
    }
    for (const enemy of Object.values(database.enemies)) {
      if (enemy.spriteAssetId && !assetIds.has(enemy.spriteAssetId)) {
        addIssue(
          'warning',
          'database',
          enemy.id,
          enemy.name,
          `Sprite de l’ennemi « ${enemy.name} » introuvable (« ${enemy.spriteAssetId} »).`,
        );
      }
      if (enemy.rewardItemId && !database.items[enemy.rewardItemId]) {
        addIssue(
          'error',
          'database',
          enemy.id,
          enemy.name,
          `Butin de « ${enemy.name} » pointe vers un objet inconnu (« ${enemy.rewardItemId} »).`,
        );
      }
      for (const skId of enemy.skillIds ?? []) {
        if (!database.skills[skId]) {
          addIssue(
            'error',
            'database',
            enemy.id,
            enemy.name,
            `Compétence de « ${enemy.name} » introuvable (« ${skId} »).`,
          );
        }
      }
    }
  }

  return issues;
}
