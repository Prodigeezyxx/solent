import { useEffect, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, Circle, Loader2, Plug, X } from 'lucide-react';
import { fetchSettings, saveSettingsRemote, type BriefSourceMeta, type SettingsStatus } from '../lib/api';

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
    title: 'Gmail — personal inbox',
    hint: 'Google Cloud OAuth client (Gmail API, scope gmail.readonly) + a refresh token from the OAuth consent flow.',
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
    hint: 'OpenRouter key. ONE model call per pass, cached. Kimi-ready — set the model to moonshotai/kimi-k2 (or any OpenRouter slug); JSON parsing tolerates models without response_format support.',
    fields: [
      { key: 'OPENROUTER_API_KEY', label: 'OpenRouter API key', secret: true },
      { key: 'OPENROUTER_MODEL', label: 'Model (optional)', placeholder: 'moonshotai/kimi-k2' },
      { key: 'BRIEF_TTL_MINUTES', label: 'Cache window, minutes (default 30)', placeholder: '30' },
    ],
  },
];

export default function SourcesModal({ isOpen, onClose, sources, onSaved }: SourcesModalProps) {
  const [status, setStatus] = useState<SettingsStatus>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setDraft({});
    setNote('');
    fetchSettings().then(setStatus).catch(() => setNote('Could not load settings — is the Worker running?'));
  }, [isOpen]);

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
            className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl border border-nexus-border bg-nexus-surface shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-nexus-border/60 bg-nexus-surface">
              <div className="flex items-center gap-2">
                <Plug className="w-4 h-4 text-nexus-mint" />
                <h2 className="text-sm font-semibold text-nexus-text">Sources & credentials</h2>
              </div>
              <button type="button" onClick={onClose} className="text-nexus-dim hover:text-nexus-text" aria-label="Close sources">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-6">
              {GROUPS.map((g) => {
                const m = g.id !== 'llm' ? meta(g.id) : undefined;
                return (
                  <section key={g.id} className="rounded-lg border border-nexus-border/60 overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2.5 bg-black/20 border-b border-nexus-border/50">
                      <h3 className="text-xs font-semibold text-zinc-200">{g.title}</h3>
                      {m && (
                        <span className={`flex items-center gap-1 text-[10px] font-mono ${m.ok ? 'text-nexus-mint' : m.configured ? 'text-nexus-orange' : 'text-nexus-dim'}`}>
                          {m.ok ? <CheckCircle2 className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
                          {m.ok ? `connected · ${m.count} items` : m.configured ? m.error ?? 'error' : 'not connected'}
                        </span>
                      )}
                    </div>
                    <p className="px-3 pt-2 text-[10px] text-nexus-dim leading-relaxed">{g.hint}</p>
                    <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {g.fields.map((f) => {
                        const set = status[f.key];
                        const isSet = f.secret ? set === true : typeof set === 'string' && set !== '';
                        return (
                          <label key={f.key} className="block">
                            <span className="block text-[10px] font-mono text-nexus-dim mb-1 uppercase tracking-wider">
                              {f.label} {isSet && <em className="not-italic text-nexus-mint">· set</em>}
                            </span>
                            <input
                              type={f.secret ? 'password' : 'text'}
                              value={draft[f.key] ?? (f.secret ? '' : typeof set === 'string' ? set : '')}
                              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                              placeholder={f.secret && isSet ? '••••••••  (leave blank to keep)' : f.placeholder ?? ''}
                              className="w-full bg-black/30 border border-nexus-border rounded px-2.5 py-1.5 text-xs text-zinc-200 outline-none focus:border-nexus-mint/50 placeholder:text-nexus-dim/60"
                            />
                          </label>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>

            <div className="sticky bottom-0 flex items-center justify-between gap-3 p-4 border-t border-nexus-border/60 bg-nexus-surface">
              <span className="text-[10px] text-nexus-dim">{note || 'Secrets are stored server-side and never echoed back.'}</span>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-4 h-8 rounded-md bg-nexus-mint text-nexus-bg text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
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
