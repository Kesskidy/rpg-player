export const NARRATIVE_SCHEMA_VERSION = 1 as const;

export type NarrativeVariableValue = string | number | boolean;

export type NarrativeEffect =
  | { type: 'give_item'; itemId: string; quantity?: number }
  | { type: 'remove_item'; itemId: string; quantity?: number }
  | { type: 'set_var'; key: string; value: NarrativeVariableValue }
  | { type: 'add_var'; key: string; delta: number }
  | { type: 'heal'; hp: number; mp?: number }
  | { type: 'start_battle'; enemyId: string };

export interface DialogueChoice {
  id: string;
  label: string;
  /** Optional condition expression, e.g. `has_item("cle_fer")` or `var("or") >= 10`. */
  condition?: string;
  nextNodeId: string | null;
  effects?: NarrativeEffect[];
}

export type CinematicDisplayMode = 'fullscreen' | 'inset' | 'background';

export interface CinematicConfig {
  /** AssetMeta.id of the animated spritesheet/cutscene to play. */
  assetId: string;
  /** Clip name inside `AssetMeta.animations` (defaults to first available clip). */
  clipName: string;
  displayMode: CinematicDisplayMode;
  /** If true, waits for the animation to finish (or user skip) before advancing to `nextNodeId`. */
  waitForCompletion: boolean;
  /** If true, keeps looping in the background during subsequent dialogue nodes. */
  loopInBackground: boolean;
  playbackSpeed?: number;
  caption?: string;
}

export type NarrativeNodeType = 'dialogue' | 'condition' | 'action' | 'cinematic' | 'end';

export interface NarrativeNode {
  id: string;
  type: NarrativeNodeType;
  position: { x: number; y: number };
  title: string;
  speaker?: string;
  text?: string;
  choices?: DialogueChoice[];
  /** Used when type === 'condition'. */
  condition?: string;
  trueNextNodeId?: string | null;
  falseNextNodeId?: string | null;
  /** Used when type === 'action'. */
  effects?: NarrativeEffect[];
  /** Used when type === 'cinematic'. */
  cinematic?: CinematicConfig;
  /** Default outgoing link (for action, cinematic, or linear dialogue without choices). */
  nextNodeId?: string | null;
}

export interface NarrativeMeta {
  id: string;
  name: string;
  filePath: string;
}

/**
 * Twine-inspired visual narrative graph persisted in `narratives/<id>.narrative.json`.
 */
export interface NarrativeGraph {
  schemaVersion: typeof NARRATIVE_SCHEMA_VERSION;
  id: string;
  name: string;
  entryNodeId: string;
  nodes: NarrativeNode[];
}
