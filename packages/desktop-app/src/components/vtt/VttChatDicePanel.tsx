import { useEffect, useRef, useState } from 'react';
import type { VttChatMessage } from '@rpg-player/core-types';

interface VttChatDicePanelProps {
  messages: readonly VttChatMessage[];
  onSendChat: (channel: 'rp' | 'hrp', text: string) => void;
  onRollDice: (formula: string, label?: string) => void;
}

const QUICK_DICE = ['1d4', '1d6', '1d8', '1d10', '1d12', '1d20', '1d100'] as const;

export function VttChatDicePanel({
  messages,
  onSendChat,
  onRollDice,
}: VttChatDicePanelProps) {
  const [channel, setChannel] = useState<'rp' | 'hrp'>('rp');
  const [text, setText] = useState('');
  const [customFormula, setCustomFormula] = useState('1d20+3');
  const [rollLabel, setRollLabel] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length]);

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    onSendChat(channel, text);
    setText('');
  }

  function handleCustomRoll(e: React.FormEvent) {
    e.preventDefault();
    if (!customFormula.trim()) return;
    onRollDice(customFormula, rollLabel || undefined);
    setRollLabel('');
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Dice Roller Tray */}
      <div className="space-y-2 border-b border-slate-800 bg-surface-950/50 p-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Lanceur de dés
          </span>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {QUICK_DICE.map((die) => (
            <button
              key={die}
              type="button"
              onClick={() => onRollDice(die)}
              className="rounded bg-indigo-600/25 py-1 font-mono text-[10px] font-bold text-indigo-200 ring-1 ring-indigo-500/40 hover:bg-indigo-600/50"
            >
              {die.replace('1', '')}
            </button>
          ))}
        </div>

        <form onSubmit={handleCustomRoll} className="flex gap-1">
          <input
            type="text"
            value={customFormula}
            onChange={(e) => setCustomFormula(e.target.value)}
            placeholder="2d6+3"
            className="w-20 rounded border border-slate-700 bg-surface-800 px-1.5 py-1 font-mono text-[11px] text-white"
          />
          <input
            type="text"
            value={rollLabel}
            onChange={(e) => setRollLabel(e.target.value)}
            placeholder="Label (ex: Attaque)"
            className="min-w-0 flex-1 rounded border border-slate-700 bg-surface-800 px-1.5 py-1 text-[11px] text-white"
          />
          <button
            type="submit"
            className="rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-500"
          >
            Jet
          </button>
        </form>
      </div>

      {/* Chat Log */}
      <div ref={listRef} className="flex-1 space-y-1.5 overflow-y-auto p-2.5 text-xs">
        {messages.map((msg) => {
          if (msg.channel === 'system') {
            return (
              <div
                key={msg.id}
                className="rounded bg-indigo-950/40 px-2 py-1 text-[11px] text-indigo-200"
              >
                {msg.text}
              </div>
            );
          }

          if (msg.channel === 'dice' && msg.roll) {
            return (
              <div
                key={msg.id}
                className="rounded-lg border border-emerald-500/35 bg-emerald-950/30 p-2"
              >
                <div className="flex items-center justify-between text-[10px] text-emerald-300">
                  <span className="font-semibold">🎲 {msg.senderName}</span>
                  <span className="font-mono">{msg.roll.formula}</span>
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-2">
                  <span className="truncate font-mono text-[11px] text-slate-300">
                    {msg.text}
                  </span>
                  <span className="rounded bg-emerald-600 px-2 py-0.5 font-mono text-sm font-extrabold text-white">
                    {msg.roll.total}
                  </span>
                </div>
              </div>
            );
          }

          return (
            <div
              key={msg.id}
              className={`rounded-md px-2.5 py-1.5 ${
                msg.channel === 'rp'
                  ? 'border border-amber-500/25 bg-amber-950/20'
                  : 'border border-slate-800 bg-surface-800/60'
              }`}
            >
              <div className="flex items-center gap-1.5 text-[10px]">
                <span
                  className={`rounded px-1 font-bold uppercase ${
                    msg.channel === 'rp'
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-slate-700 text-slate-300'
                  }`}
                >
                  {msg.channel}
                </span>
                <span className="font-semibold text-slate-200">{msg.senderName}</span>
                {msg.senderRole === 'gm' && (
                  <span className="rounded bg-amber-600/30 px-1 text-[9px] text-amber-200">
                    MJ
                  </span>
                )}
              </div>
              <p
                className={`mt-0.5 whitespace-pre-wrap text-xs ${
                  msg.channel === 'rp' ? 'italic text-amber-100' : 'text-slate-200'
                }`}
              >
                {msg.text}
              </p>
            </div>
          );
        })}
      </div>

      {/* Chat Composer */}
      <form onSubmit={handleSend} className="space-y-1.5 border-t border-slate-800 p-2.5">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setChannel('rp')}
            className={`flex-1 rounded py-1 text-[10px] font-bold uppercase ${
              channel === 'rp'
                ? 'bg-amber-600 text-white'
                : 'bg-surface-800 text-slate-400 hover:bg-surface-700'
            }`}
          >
            Canal RP
          </button>
          <button
            type="button"
            onClick={() => setChannel('hrp')}
            className={`flex-1 rounded py-1 text-[10px] font-bold uppercase ${
              channel === 'hrp'
                ? 'bg-indigo-600 text-white'
                : 'bg-surface-800 text-slate-400 hover:bg-surface-700'
            }`}
          >
            Canal HRP
          </button>
        </div>

        <div className="flex gap-1">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={channel === 'rp' ? 'Parler en jeu (RP)...' : 'Discussion hors-jeu (HRP)...'}
            className="min-w-0 flex-1 rounded border border-slate-700 bg-surface-800 px-2 py-1.5 text-xs text-white outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
          >
            Envoyer
          </button>
        </div>
      </form>
    </div>
  );
}
