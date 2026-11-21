import type {
  CinematicConfig,
  DialogueChoice,
  NarrativeEffect,
  NarrativeGraph,
  NarrativeNode,
  NarrativeVariableValue,
} from '@rpg-player/core-types';
import type { InventorySystem } from './inventory.js';

export interface NarrativeRuntimeContext {
  variables: Record<string, NarrativeVariableValue>;
  inventory: InventorySystem;
  onHeal?: (hp: number, mp: number) => void;
  onStartBattle?: (enemyId: string) => void;
}

type Token =
  | { type: 'ident'; value: string }
  | { type: 'string'; value: string }
  | { type: 'number'; value: number }
  | { type: 'op'; value: string }
  | { type: 'lparen' }
  | { type: 'rparen' }
  | { type: 'comma' };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i]!;
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === '(') {
      tokens.push({ type: 'lparen' });
      i += 1;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen' });
      i += 1;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: 'comma' });
      i += 1;
      continue;
    }

    const two = input.slice(i, i + 2);
    if (['&&', '||', '==', '!=', '>=', '<='].includes(two)) {
      tokens.push({ type: 'op', value: two });
      i += 2;
      continue;
    }
    if (['!', '>', '<'].includes(ch)) {
      tokens.push({ type: 'op', value: ch });
      i += 1;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      i += 1;
      let str = '';
      while (i < input.length && input[i] !== quote) {
        if (input[i] === '\\' && i + 1 < input.length) {
          str += input[i + 1];
          i += 2;
        } else {
          str += input[i];
          i += 1;
        }
      }
      if (input[i] === quote) i += 1;
      tokens.push({ type: 'string', value: str });
      continue;
    }

    if (/[0-9]/.test(ch) || (ch === '-' && /[0-9]/.test(input[i + 1] ?? ''))) {
      let numStr = ch;
      i += 1;
      while (i < input.length && /[0-9.]/.test(input[i]!)) {
        numStr += input[i];
        i += 1;
      }
      tokens.push({ type: 'number', value: Number(numStr) });
      continue;
    }

    if (/[a-zA-Z_]/.test(ch)) {
      let ident = ch;
      i += 1;
      while (i < input.length && /[a-zA-Z0-9_-]/.test(input[i]!)) {
        ident += input[i];
        i += 1;
      }
      tokens.push({ type: 'ident', value: ident });
      continue;
    }

    throw new Error(`Caractère inattendu dans la condition : "${ch}"`);
  }

  return tokens;
}

type EvalValue = string | number | boolean | null;

class ConditionParser {
  private readonly tokens: Token[];
  private readonly ctx: NarrativeRuntimeContext;
  private pos = 0;

  constructor(tokens: Token[], ctx: NarrativeRuntimeContext) {
    this.tokens = tokens;
    this.ctx = ctx;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private consume(): Token | undefined {
    return this.tokens[this.pos++];
  }

  parseExpression(): EvalValue {
    return this.parseOr();
  }

  private parseOr(): EvalValue {
    let left = this.parseAnd();
    while (this.peek()?.type === 'op' && (this.peek() as { value: string }).value === '||') {
      this.consume();
      const right = this.parseAnd();
      left = Boolean(left) || Boolean(right);
    }
    return left;
  }

  private parseAnd(): EvalValue {
    let left = this.parseComparison();
    while (this.peek()?.type === 'op' && (this.peek() as { value: string }).value === '&&') {
      this.consume();
      const right = this.parseComparison();
      left = Boolean(left) && Boolean(right);
    }
    return left;
  }

  private parseComparison(): EvalValue {
    const left = this.parseUnary();
    const next = this.peek();
    if (next?.type === 'op' && ['==', '!=', '>=', '<=', '>', '<'].includes(next.value)) {
      this.consume();
      const right = this.parseUnary();
      switch (next.value) {
        case '==':
          return left === right;
        case '!=':
          return left !== right;
        case '>=':
          return Number(left ?? 0) >= Number(right ?? 0);
        case '<=':
          return Number(left ?? 0) <= Number(right ?? 0);
        case '>':
          return Number(left ?? 0) > Number(right ?? 0);
        case '<':
          return Number(left ?? 0) < Number(right ?? 0);
      }
    }
    return left;
  }

  private parseUnary(): EvalValue {
    const next = this.peek();
    if (next?.type === 'op' && next.value === '!') {
      this.consume();
      return !Boolean(this.parseUnary());
    }
    return this.parsePrimary();
  }

  private parsePrimary(): EvalValue {
    const token = this.consume();
    if (!token) return false;

    if (token.type === 'lparen') {
      const value = this.parseExpression();
      if (this.peek()?.type === 'rparen') {
        this.consume();
      }
      return value;
    }

    if (token.type === 'string' || token.type === 'number') {
      return token.value;
    }

    if (token.type === 'ident') {
      if (token.value === 'true') return true;
      if (token.value === 'false') return false;

      if (this.peek()?.type === 'lparen') {
        this.consume(); // '('
        const args: EvalValue[] = [];
        while (this.peek() && this.peek()?.type !== 'rparen') {
          args.push(this.parseExpression());
          if (this.peek()?.type === 'comma') {
            this.consume();
          } else {
            break;
          }
        }
        if (this.peek()?.type === 'rparen') {
          this.consume();
        }
        return this.invokeBuiltin(token.value, args);
      }

      const rawVar = this.ctx.variables[token.value];
      return rawVar !== undefined ? rawVar : false;
    }

    return false;
  }

  private invokeBuiltin(name: string, args: EvalValue[]): EvalValue {
    switch (name) {
      case 'has_item': {
        const itemId = String(args[0] ?? '');
        const minQty = args[1] !== undefined ? Number(args[1]) : 1;
        return this.ctx.inventory.hasItem(itemId, minQty);
      }
      case 'item_count': {
        const itemId = String(args[0] ?? '');
        return this.ctx.inventory.getItemCount(itemId);
      }
      case 'var':
      case 'flag': {
        const key = String(args[0] ?? '');
        const val = this.ctx.variables[key];
        return val !== undefined ? val : false;
      }
      case 'gold': {
        return this.ctx.inventory.getGold();
      }
      default:
        return false;
    }
  }
}

/**
 * Safely evaluates Twine/RPG condition expressions without `eval`.
 * Examples:
 * - `has_item("cle_fer")`
 * - `if has_item("cle_fer") && !flag("porte_ouverte")`
 * - `var("reputation") >= 10`
 */
export function evaluateCondition(
  expression: string | undefined,
  ctx: NarrativeRuntimeContext,
): boolean {
  const trimmed = (expression ?? '').trim();
  if (!trimmed) return true;

  const withoutIf = trimmed.replace(/^if\s+/i, '');
  try {
    const tokens = tokenize(withoutIf);
    if (tokens.length === 0) return true;
    const parser = new ConditionParser(tokens, ctx);
    return Boolean(parser.parseExpression());
  } catch {
    return false;
  }
}

export function applyNarrativeEffects(
  effects: readonly NarrativeEffect[] | undefined,
  ctx: NarrativeRuntimeContext,
): { logs: string[]; triggeredBattleEnemyId: string | null } {
  const logs: string[] = [];
  let triggeredBattleEnemyId: string | null = null;

  if (!effects) return { logs, triggeredBattleEnemyId };

  for (const effect of effects) {
    switch (effect.type) {
      case 'give_item': {
        const qty = effect.quantity ?? 1;
        const res = ctx.inventory.addItem(effect.itemId, qty);
        const itemName = ctx.inventory.getItemDef(effect.itemId)?.name ?? effect.itemId;
        logs.push(res.ok ? `Reçu : ${itemName} ×${qty}` : `Inventaire : ${res.reason ?? 'plein'}`);
        break;
      }
      case 'remove_item': {
        const qty = effect.quantity ?? 1;
        ctx.inventory.removeItem(effect.itemId, qty);
        const itemName = ctx.inventory.getItemDef(effect.itemId)?.name ?? effect.itemId;
        logs.push(`Retiré : ${itemName} ×${qty}`);
        break;
      }
      case 'set_var': {
        ctx.variables[effect.key] = effect.value;
        logs.push(`Variable ${effect.key} = ${String(effect.value)}`);
        break;
      }
      case 'add_var': {
        const current = Number(ctx.variables[effect.key] ?? 0);
        const next = current + effect.delta;
        ctx.variables[effect.key] = next;
        logs.push(`Variable ${effect.key} = ${next}`);
        break;
      }
      case 'heal': {
        ctx.onHeal?.(effect.hp, effect.mp ?? 0);
        logs.push(`Soin : +${effect.hp} PV${effect.mp ? `, +${effect.mp} PM` : ''}`);
        break;
      }
      case 'start_battle': {
        triggeredBattleEnemyId = effect.enemyId;
        ctx.onStartBattle?.(effect.enemyId);
        logs.push(`Combat déclenché : ${effect.enemyId}`);
        break;
      }
    }
  }

  return { logs, triggeredBattleEnemyId };
}

export interface EvaluatedDialogueChoice {
  choice: DialogueChoice;
  enabled: boolean;
}

export interface NarrativeStepState {
  status: 'dialogue' | 'cinematic' | 'ended';
  node: NarrativeNode | null;
  speaker: string;
  text: string;
  choices: EvaluatedDialogueChoice[];
  actionLogs: string[];
  triggeredBattleEnemyId: string | null;
  /** Non-null when paused on a blocking `CinematicNode` (`waitForCompletion: true`). */
  activeCinematic: CinematicConfig | null;
  /** Optional looping cinematic running behind subsequent dialogue nodes. */
  backgroundCinematic: CinematicConfig | null;
}

/**
 * Headless runtime interpreter stepping through a NarrativeGraph (including CinematicNodes).
 */
export class NarrativeRunner {
  private readonly graph: NarrativeGraph;
  private readonly ctx: NarrativeRuntimeContext;
  private readonly nodeById: Map<string, NarrativeNode>;
  private backgroundCinematic: CinematicConfig | null = null;
  private currentStep: NarrativeStepState = {
    status: 'ended',
    node: null,
    speaker: '',
    text: '',
    choices: [],
    actionLogs: [],
    triggeredBattleEnemyId: null,
    activeCinematic: null,
    backgroundCinematic: null,
  };

  constructor(graph: NarrativeGraph, ctx: NarrativeRuntimeContext) {
    this.graph = graph;
    this.ctx = ctx;
    this.nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  }

  start(): NarrativeStepState {
    this.backgroundCinematic = null;
    return this.goToNode(this.graph.entryNodeId, []);
  }

  getCurrentStep(): Readonly<NarrativeStepState> {
    return this.currentStep;
  }

  selectChoice(choiceId: string): NarrativeStepState {
    if (this.currentStep.status !== 'dialogue') return this.currentStep;
    const match = this.currentStep.choices.find(
      (item) => item.choice.id === choiceId && item.enabled,
    );
    if (!match) return this.currentStep;

    const applied = applyNarrativeEffects(match.choice.effects, this.ctx);
    return this.goToNode(
      match.choice.nextNodeId,
      applied.logs,
      applied.triggeredBattleEnemyId,
    );
  }

  advance(): NarrativeStepState {
    if (
      (this.currentStep.status !== 'dialogue' && this.currentStep.status !== 'cinematic') ||
      !this.currentStep.node
    ) {
      return this.currentStep;
    }
    return this.goToNode(this.currentStep.node.nextNodeId ?? null, []);
  }

  private goToNode(
    startNodeId: string | null | undefined,
    initialLogs: string[],
    initialBattleEnemyId: string | null = null,
  ): NarrativeStepState {
    let cursorId = startNodeId ?? null;
    const logs = [...initialLogs];
    let battleEnemyId = initialBattleEnemyId;
    let hops = 0;

    while (cursorId && hops < 32) {
      hops += 1;
      const node = this.nodeById.get(cursorId);
      if (!node || node.type === 'end') {
        this.currentStep = {
          status: 'ended',
          node: node ?? null,
          speaker: '',
          text: '',
          choices: [],
          actionLogs: logs,
          triggeredBattleEnemyId: battleEnemyId,
          activeCinematic: null,
          backgroundCinematic: null,
        };
        return this.currentStep;
      }

      if (node.type === 'condition') {
        const ok = evaluateCondition(node.condition, this.ctx);
        cursorId = ok ? (node.trueNextNodeId ?? null) : (node.falseNextNodeId ?? null);
        continue;
      }

      if (node.type === 'action') {
        const applied = applyNarrativeEffects(node.effects, this.ctx);
        logs.push(...applied.logs);
        if (applied.triggeredBattleEnemyId) {
          battleEnemyId = applied.triggeredBattleEnemyId;
        }
        cursorId = node.nextNodeId ?? null;
        continue;
      }

      if (node.type === 'cinematic') {
        const cin = node.cinematic ?? null;
        if (cin?.loopInBackground) {
          this.backgroundCinematic = { ...cin };
        }
        if (cin && cin.waitForCompletion) {
          this.currentStep = {
            status: 'cinematic',
            node,
            speaker: node.title,
            text: cin.caption ?? '',
            choices: [],
            actionLogs: logs,
            triggeredBattleEnemyId: battleEnemyId,
            activeCinematic: { ...cin },
            backgroundCinematic: this.backgroundCinematic,
          };
          return this.currentStep;
        }
        cursorId = node.nextNodeId ?? null;
        continue;
      }

      // Dialogue node reached
      const choices: EvaluatedDialogueChoice[] = (node.choices ?? []).map((choice) => ({
        choice,
        enabled: evaluateCondition(choice.condition, this.ctx),
      }));

      this.currentStep = {
        status: 'dialogue',
        node,
        speaker: node.speaker ?? node.title,
        text: node.text ?? '',
        choices,
        actionLogs: logs,
        triggeredBattleEnemyId: battleEnemyId,
        activeCinematic: null,
        backgroundCinematic: this.backgroundCinematic,
      };
      return this.currentStep;
    }

    this.currentStep = {
      status: 'ended',
      node: null,
      speaker: '',
      text: '',
      choices: [],
      actionLogs: logs,
      triggeredBattleEnemyId: battleEnemyId,
      activeCinematic: null,
      backgroundCinematic: null,
    };
    return this.currentStep;
  }
}
