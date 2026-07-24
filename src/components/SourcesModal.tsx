import { useEffect, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BookOpen, Brain, CheckCircle2, Circle, Loader2, Plug, Plus, Trash2, X } from 'lucide-react';
import {
  deleteDocRemote, fetchDocs, fetchModels, fetchSettings, saveDocRemote, saveSettingsRemote,
  type BriefSourceMeta, type DocMeta, type ModelPreset, type SettingsStatus,
} from '../lib/api';

interface SourcesModalProps {
  isOpen: boolean;
  onClose: () => void;
  sources?: BriefSourceMeta[];
  onSaved: () => void;
}

interface FieldDef {
  key: string;
  label: string;
  secret?: boolean;
  placeholder?: string;
}

const GROUPS: { id: string; title: string; hint: string; fields: FieldDef[] }[] = [
  {
    id: 'operator',
    title: 'Operator — who this console serves',
    hint: 'Used to personalize the brief and detect messages aimed at you. Name should match how teammates address you in Pumble.',
    fields: [
      { key: 'OPERATOR_NAME', label: 'Your name', placeholder: 'e.g. Alex' },
      { key: 'OPERATOR_CONTEXT', label: 'Context (role, company, current focus)', placeholder: 'Founder of Floats XR / realmspace — raising, shipping v2…' },
    ],
  },
  {
    id: 'pumble',
    title: 'Pumble — work context',
    hint: 'Install the “API Keys” addon in Pumble, generate a key, paste it here. Optionally limit which channels are scanned.',
    fields: [
      { key: 'PUMBLE_API_KEY', label: 'API key', secret: true },
      { key: 'PUMBLE_CHANNELS', label: 'Channels (optional, comma-separated)', placeholder: 'general, product, gtm' },
    ],
  },
  {
    id: 'gmail',
    title: 'Gmail + Google Calendar — personal inbox & schedule',
    hint: 'One Google OAuth client powers BOTH. Scopes: gmail.readonly + calendar.readonly. If Calendar shows a scope error, re-run the OAuth consent flow with calendar.readonly added (same client ID/secret) and paste the new refresh token here.',
    fields: [
      { key: 'GMAIL_CLIENT_ID', label: 'Client ID' },
      { key: 'GMAIL_CLIENT_SECRET', label: 'Client secret', secret: true },
      { key: 'GMAIL_REFRESH_TOKEN', label: 'Refresh token', secret: true },
    ],
  },
  {
    id: 'zoho',
    title: 'Zoho Mail — company inbox',
    hint: 'Zoho API console → Self Client → scope ZohoMail.messages.READ,ZohoMail.accounts.READ → generate refresh token.',
    fields: [
      { key: 'ZOHO_CLIENT_ID', label: 'Client ID' },
      { key: 'ZOHO_CLIENT_SECRET', label: 'Client secret', secret: true },
      { key: 'ZOHO_REFRESH_TOKEN', label: 'Refresh token', secret: true },
      { key: 'ZOHO_DC', label: 'Data centre (com / eu / in …)', placeholder: 'com' },
    ],
  },
  {
    id: 'llm',
    title: 'Model — one call per pass',
    hint: 'OpenRouter key. ONE model call per pass, cached. Pick a preset below or type any OpenRouter slug — JSON parsing tolerates every model.',
    fields: [
      { key: 'OPENROUTER_API_KEY', label: 'OpenRouter API key', secret: true },
      { key: 'BRIEF_TTL_MINUTES', label: 'LLM cache window, minutes (default 30)', placeholder: '30' },
      { key: 'BRIEF_FRESHNESS_MINUTES', label: 'Inbox freshness, minutes (default 3, zero-credit)', placeholder: '3' },
    ],
  },
];

const REASONING_LEVELS = ['off', 'low', 'medium', 'high'] as const;

export default function SourcesModal({ isOpen, onClose, sources, onSaved }: SourcesModalProps) {
  const [status, setStatus] = useState<SettingsStatus>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');
  const [models, setModels] = useState<ModelPreset[]>([]);
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [docTitle, setDocTitle] = useState('');
  const [docContent, setDocContent] = useState('');
  const [docSaving, setDocSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setDraft({});
    setNote('');
    fetchSettings().then(setStatus).catch(() => setNote('Could not load settings — is the Worker running?'));
    fetchModels().then(setModels).catch(() => setModels([]));
    fetchDocs().then(setDocs).catch(() => setDocs([]));
  }, [isOpen]);

  const currentModel = (draft.OPENROUTER_MODEL ?? (typeof status.OPENROUTER_MODEL === 'string' ? status.OPENROUTER_MODEL : '')) || '';
  const currentReasoning = (draft.OPENROUTER_REASONING ?? (typeof status.OPENROUTER_REASONING === 'string' ? status.OPENROUTER_REASONING : '')) || 'off';

  const addDoc = async () => {
    if (!docTitle.trim() || !docContent.trim()) return;
    setDocSaving(true);
    try {
      await saveDocRemote(docTitle.trim(), docContent);
      setDocTitle('');
      setDocContent('');
      setDocs(await fetchDocs());
      setNote('Context doc saved — it now feeds every brief and chat.');
    } catch {
      setNote('Doc save failed — is the Worker running?');
    } finally {
      setDocSaving(false);
    }
  };

  const removeDoc = async (id: number) => {
    setDocs((d) => d.filter((x) => x.id !== id));
    try { await deleteDocRemote(id); } catch { setDocs(await fetchDocs()); }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const patch = Object.fromEntries(Object.entries(draft).filter(([, v]) => v !== undefined));
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      const next = await saveSettingsRemote(patch);
      setStatus(next);
      setDraft({});
      setNote('Saved. Run the brief to pull from your sources.');
      onSaved();
    } catch {
      setNote('Save failed — is the Worker running?');
    } finally {
      setSaving(false);
    }
  };

  const meta = (id: string) => sources?.find((s) => s.source === id);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[130] bg-black/70 backdrop-blur-sm grid place-items-center p-4"
          onClick={onClose}
        >
          <motion.form
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
            className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl border border-solent-border bg-solent-surface shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-solent-border/60 bg-solent-surface">
              <div className="flex items-center gap-2">
                <Plug className="w-4 h-4 text-solent-mint" />
                <h2 className="text-sm font-semibold text-solent-text">Sources & credentials</h2>
              </div>
              <button type="button" onClick={onClose} className="text-solent-dim hover:text-solent-text" aria-label="Close sources">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-6">
              {GROUPS.map((g) => {
                const m = g.id !== 'llm' ? meta(g.id) : undefined;
                return (
                  <section key={g.id} className="rounded-lg border border-solent-border/60 overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2.5 bg-black/20 border-b border-solent-border/50">
                      <h3 className="text-xs font-semibold text-zinc-200">{g.title}</h3>
                      {m && (
                        <span className={`flex items-center gap-1 text-[10px] font-mono ${m.ok ? 'text-solent-mint' : m.configured ? 'text-solent-orange' : 'text-solent-dim'}`}>
                          {m.ok ? <CheckCircle2 className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
                          {m.ok ? `connected · ${m.count} items` : m.configured ? m.error ?? 'error' : 'not connected'}
                        </span>
                      )}
                    </div>
                    <p className="px-3 pt-2 text-[10px] text-solent-dim leading-relaxed">{g.hint}</p>
                    <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {g.fields.map((f) => {
                        const set = status[f.key];
                        const isSet = f.secret ? set === true : typeof set === 'string' && set !== '';
                        return (
                          <label key={f.key} className="block">
                            <span className="block text-[10px] font-mono text-solent-dim mb-1 uppercase tracking-wider">
                              {f.label} {isSet && <em className="not-italic text-solent-mint">· set</em>}
                            </span>
                            <input
                              type={f.secret ? 'password' : 'text'}
                              value={draft[f.key] ?? (f.secret ? '' : typeof set === 'string' ? set : '')}
                              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                              placeholder={f.secret && isSet ? '••••••••  (leave blank to keep)' : f.placeholder ?? ''}
                              className="w-full bg-black/30 border border-solent-border rounded px-2.5 py-1.5 text-xs text-zinc-200 outline-none focus:border-solent-mint/50 placeholder:text-solent-dim/60"
                            />
                          </label>
                        );
                      })}
                    </div>
                  </section>
                );
              })}

              {/* ---- Model picker: frontier-level presets ---- */}
              <section className="rounded-lg border border-solent-border/60 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2.5 bg-black/20 border-b border-solent-border/50">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200"><Brain className="w-3.5 h-3.5 text-solent-purple" /> Model picker</h3>
                  <span className="text-[9px] font-mono text-solent-dim">{currentModel || 'default'}</span>
                </div>
                <p className="px-3 pt-2 text-[10px] text-solent-dim leading-relaxed">
                  One model runs everything — the brief AND the CONDUCTOR orchestration. Presets are frontier-level at sane prices; reasoning effort applies to models that support it (Kimi K3, R1, Qwen3).
                </p>
                <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {models.map((m) => {
                    const active = currentModel === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setDraft((d) => ({ ...d, OPENROUTER_MODEL: m.id }))}
                        className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${active ? 'border-solent-mint/50 bg-solent-mint/[.06]' : 'border-solent-border hover:border-solent-border/80 bg-black/20'}`}
                      >
                        <span className="flex items-center gap-2">
                          <strong className={`text-[11px] font-semibold ${active ? 'text-solent-mint' : 'text-zinc-200'}`}>{m.name}</strong>
                          {m.reasoning && <span className="px-1.5 py-0.5 rounded bg-solent-purple/10 text-[8px] font-mono text-solent-purple uppercase">reasoning</span>}
                          <span className="ml-auto text-[8px] font-mono text-solent-dim">{m.price}</span>
                        </span>
                        <span className="block text-[9px] font-mono text-solent-dim mt-0.5">{m.vendor} · {m.tier}</span>
                        <span className="block text-[9px] text-solent-muted mt-1 leading-relaxed">{m.note}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="px-3 pb-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="block text-[10px] font-mono text-solent-dim mb-1 uppercase tracking-wider">Custom slug (any OpenRouter model)</span>
                    <input
                      type="text"
                      value={draft.OPENROUTER_MODEL ?? currentModel}
                      onChange={(e) => setDraft((d) => ({ ...d, OPENROUTER_MODEL: e.target.value }))}
                      placeholder="moonshotai/kimi-k3"
                      className="w-full bg-black/30 border border-solent-border rounded px-2.5 py-1.5 text-xs text-zinc-200 outline-none focus:border-solent-mint/50 placeholder:text-solent-dim/60"
                    />
                  </label>
                  <div>
                    <span className="block text-[10px] font-mono text-solent-dim mb-1 uppercase tracking-wider">Reasoning effort</span>
                    <div className="flex items-center gap-1">
                      {REASONING_LEVELS.map((lvl) => (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => setDraft((d) => ({ ...d, OPENROUTER_REASONING: lvl }))}
                          className={`flex-1 h-[30px] rounded border text-[10px] font-mono uppercase transition-colors ${
                            currentReasoning === lvl ? 'border-solent-purple/60 bg-solent-purple/10 text-solent-purple' : 'border-solent-border text-solent-dim hover:text-solent-text'
                          }`}
                        >
                          {lvl}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {/* ---- Context library: docs the model treats as ground truth ---- */}
              <section className="rounded-lg border border-solent-border/60 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2.5 bg-black/20 border-b border-solent-border/50">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200"><BookOpen className="w-3.5 h-3.5 text-solent-blue" /> Context library</h3>
                  <span className="text-[9px] font-mono text-solent-dim">{docs.length} doc{docs.length === 1 ? '' : 's'}</span>
                </div>
                <p className="px-3 pt-2 text-[10px] text-solent-dim leading-relaxed">
                  Paste strategy memos, product notes, investor context — anything the model should treat as ground truth. Injected compactly into every brief and CONDUCTOR chat (no extra model calls). You can also just paste a doc into the chat and ask CONDUCTOR to save it.
                </p>
                <div className="p-3 space-y-2">
                  {docs.map((d) => (
                    <div key={d.id} className="flex items-start gap-2 rounded border border-solent-border/60 bg-black/20 px-2.5 py-2">
                      <div className="min-w-0 flex-1">
                        <strong className="block text-[11px] font-medium text-zinc-300 truncate">{d.title}</strong>
                        <small className="block text-[9px] text-solent-dim truncate">{d.preview}… · {Math.round(d.size / 100) / 10}k chars</small>
                      </div>
                      <button type="button" onClick={() => removeDoc(d.id)} className="p-1 text-solent-dim hover:text-solent-orange transition-colors" title="Delete doc">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <input
                    type="text"
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                    placeholder="Doc title, e.g. 'Q3 strategy memo'"
                    className="w-full bg-black/30 border border-solent-border rounded px-2.5 py-1.5 text-xs text-zinc-200 outline-none focus:border-solent-blue/50 placeholder:text-solent-dim/60"
                  />
                  <textarea
                    value={docContent}
                    onChange={(e) => setDocContent(e.target.value)}
                    placeholder="Paste the content here…"
                    rows={4}
                    className="w-full bg-black/30 border border-solent-border rounded px-2.5 py-1.5 text-xs text-zinc-200 outline-none focus:border-solent-blue/50 placeholder:text-solent-dim/60 resize-y"
                  />
                  <button
                    type="button"
                    onClick={addDoc}
                    disabled={docSaving || !docTitle.trim() || !docContent.trim()}
                    className="flex items-center gap-1.5 px-3 h-8 rounded-md border border-solent-blue/40 text-solent-blue text-xs font-semibold hover:bg-solent-blue/10 disabled:opacity-50 transition-colors"
                  >
                    {docSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add to library
                  </button>
                </div>
              </section>
            </div>

            <div className="sticky bottom-0 flex items-center justify-between gap-3 p-4 border-t border-solent-border/60 bg-solent-surface">
              <span className="text-[10px] text-solent-dim">{note || 'Secrets are stored server-side and never echoed back.'}</span>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-4 h-8 rounded-md bg-solent-mint text-solent-bg text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save sources
              </button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
