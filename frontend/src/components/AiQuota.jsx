import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Lock, Sparkles, X } from 'lucide-react';
import { api } from '../lib/api';
import { getKey, onKeyChange, registerPrompt, setKey } from '../lib/auth';
import { getPreset, setPreset } from '../lib/modelPreset';

/**
 * Model picker.
 *
 * A preset rather than a raw model list: "which model writes the verdict" is a
 * meaningless question to a visitor, "how good do you want this" is not. The
 * owner-only option stays visible but disabled — showing what the app can do
 * and why it's reserved reads better than hiding it.
 */
function ModelPicker({ options, value, onChange }) {
  if (!options?.length) return null;

  return (
    <div className="mt-3 border-t rule pt-3">
      <div className="eyebrow mb-2">Model</div>
      <div className="space-y-1">
        {options.map((o) => {
          const active = (value || 'standard') === o.id;
          return (
            <button
              key={o.id}
              type="button"
              disabled={o.locked}
              onClick={() => !o.locked && onChange(o.id)}
              aria-pressed={active}
              title={o.locked ? 'Owner-only on this demo' : o.blurb}
              className={`flex w-full items-start gap-2 rounded-ctl px-2 py-1.5 text-left transition-colors ${
                o.locked
                  ? 'cursor-not-allowed opacity-40'
                  : active
                    ? 'bg-white/[.07]'
                    : 'hover:bg-white/[.04]'
              }`}
            >
              <span className="mt-[3px] w-3 shrink-0 text-text-secondary">
                {o.locked ? <Lock size={11} /> : active ? <Check size={11} /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-[12px] font-medium">{o.label}</span>
                  <span className={`eyebrow shrink-0 ${o.free ? 'text-bull' : ''}`}>
                    {o.price_hint}
                  </span>
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-text-tertiary">
                  {o.blurb}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-text-tertiary">
        The free option doesn’t touch your daily allowance.
      </p>
    </div>
  );
}

/**
 * Remaining AI runs, shown in the header.
 *
 * This app is a portfolio piece, so anonymous visitors can run everything — the
 * meter exists to tell them how much is left, not to keep them out. It only
 * appears when a limit is actually configured, so local development shows
 * nothing at all.
 *
 * The same panel holds the owner passcode, which lifts every limit.
 */
export default function AiQuota() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [hasKey, setHasKey] = useState(() => !!getKey());
  const [preset, setPresetState] = useState(() => getPreset());
  const panelRef = useRef(null);
  const inputRef = useRef(null);
  const qc = useQueryClient();

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: api.health,
    refetchInterval: 30_000,
    retry: false,
  });

  // Keyed on the passcode: the owner sees the premium option unlocked, so the
  // catalogue has to be re-fetched when that changes rather than served stale.
  const { data: catalogue } = useQuery({
    queryKey: ['models', hasKey],
    queryFn: api.models,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const budget = health?.budget;
  const visitor = budget?.visitor;
  const owner = budget?.owner;

  useEffect(() => registerPrompt(() => setOpen(true)), []);
  useEffect(() => onKeyChange((k) => setHasKey(!!k)), []);

  useEffect(() => {
    if (!open) return;
    setValue(getKey());
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    const away = (e) => { if (!panelRef.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  // Hide only when there is genuinely nothing to say: no meter, no passcode,
  // and no real choice of model.
  const metered = visitor?.enabled || budget?.global?.enabled;
  const choosable = (catalogue?.options?.length ?? 0) > 1;
  if (!health || (!metered && !owner && !hasKey && !choosable)) return null;

  const left = visitor?.remaining;
  const spent = visitor?.enabled && left === 0;

  return (
    <div className="relative shrink-0" ref={panelRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={owner ? 'Owner access — no limits' : 'Free AI runs remaining today'}
        className={`flex items-center gap-1.5 rounded-ctl px-2 py-1 transition-colors ${
          spent ? 'text-warn hover:bg-white/[.06]' : 'text-text-tertiary hover:text-text-secondary'
        }`}
      >
        <Sparkles size={12} />
        <span className="eyebrow">
          {owner ? 'Owner' : visitor?.enabled ? `${left} left` : 'AI'}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-card border border-white/10 bg-surface p-4 shadow-pop animate-rise">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-[13px] font-semibold">AI usage</h2>
            <button onClick={() => setOpen(false)} aria-label="Close"
                    className="text-text-tertiary transition-colors hover:text-text-primary">
              <X size={13} />
            </button>
          </div>

          {owner ? (
            <p className="mt-2 text-[12px] leading-relaxed text-text-tertiary">
              Owner access — no limits on this browser.
            </p>
          ) : (
            <>
              <p className="mt-2 text-[12px] leading-relaxed text-text-tertiary">
                This is a live demo, and each AI run costs real credits. Everything else —
                prices, charts, the 0–100 scoring maths — is unlimited and always free.
              </p>
              {visitor?.enabled && (
                <div className="mt-3">
                  <div className="flex items-baseline justify-between">
                    <span className="eyebrow">Your runs today</span>
                    <span className="num text-[12px]">
                      <span className={spent ? 'text-warn' : 'text-text-primary'}>{visitor.used}</span>
                      <span className="text-text-tertiary">/{visitor.limit}</span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[.07]">
                    <div
                      className={`h-full rounded-full transition-[width] duration-500 ease-spring ${spent ? 'bg-warn' : 'bg-primary'}`}
                      style={{ width: `${Math.min(100, (visitor.used / visitor.limit) * 100)}%` }}
                    />
                  </div>
                  <p className="mt-2 text-[11px] text-text-tertiary">
                    {spent
                      ? 'Spent for today — deep research falls back to a saved run. Resets 00:00 UTC.'
                      : 'Resets at 00:00 UTC.'}
                  </p>
                </div>
              )}
            </>
          )}

          <ModelPicker
            options={catalogue?.options}
            value={preset || catalogue?.default}
            onChange={(id) => {
              setPreset(id);
              setPresetState(id);
              // Cached AI results were produced by the previous model — drop
              // them so the next view reflects the choice just made.
              qc.invalidateQueries({ queryKey: ['score-explain'] });
              qc.invalidateQueries({ queryKey: ['toppicks'] });
            }}
          />

          <form
            className="mt-3 space-y-2 border-t rule pt-3"
            onSubmit={(e) => { e.preventDefault(); setKey(value.trim()); setOpen(false); }}
          >
            <label htmlFor="owner-key" className="eyebrow block">Owner passcode</label>
            <input
              ref={inputRef}
              id="owner-key"
              type="password"
              className="input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Optional"
              autoComplete="current-password"
            />
            <div className="flex gap-2">
              <button type="submit" className="btn flex-1">Save</button>
              {hasKey && (
                <button type="button" className="btn-ghost"
                        onClick={() => { setKey(''); setValue(''); setOpen(false); }}>
                  Forget
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
