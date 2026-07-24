import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * VOICE INPUT SKELETON — Web Speech API.
 *
 * Wraps the browser's SpeechRecognition (Chrome/Edge/Safari; `webkit` prefixed
 * in most builds) behind a small, stable hook so the UI never touches vendor
 * APIs directly. Designed as the foundation for the voice layer:
 *   - `supported` — feature-detect, so unsupported browsers degrade gracefully
 *   - `listening` — live mic state for UI affordances (pulse, colour)
 *   - interim + final transcripts stream into `onTranscript`
 *   - auto-stops on silence (browser behaviour) and on unmount
 *
 * Future (overhaul phase 2): push-to-talk hold, wake word, streaming to a
 * server-side transcriber for browsers without SpeechRecognition, and voice
 * command grammar ("run brief", "defer this", "open receive").
 */

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: any) => void) | null;
  onerror: ((ev: any) => void) | null;
  onend: (() => void) | null;
};

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface VoiceInputOptions {
  /** Called with the accumulating transcript (interim included) while speaking. */
  onTranscript: (text: string, isFinal: boolean) => void;
  /** BCP-47 language tag; defaults to the browser's own. */
  lang?: string;
  /** Called when recognition errors (mic denied, no speech, network…). */
  onError?: (message: string) => void;
}

export function useVoiceInput({ onTranscript, lang, onError }: VoiceInputOptions) {
  const [supported] = useState(() => getRecognitionCtor() !== null);
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  // Keep the latest callbacks without re-creating the recognizer.
  const cbRef = useRef({ onTranscript, onError });
  cbRef.current = { onTranscript, onError };

  const stop = useCallback(() => {
    recRef.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      cbRef.current.onError?.('Voice input is not supported in this browser yet.');
      return;
    }
    // A fresh instance per session avoids stale-state bugs across browsers.
    const rec = new Ctor();
    rec.lang = lang ?? (typeof navigator !== 'undefined' ? navigator.language : 'en-GB');
    rec.continuous = false; // one utterance per tap — push-to-talk comes later
    rec.interimResults = true;

    let finalText = '';
    rec.onresult = (ev: any) => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      const text = (finalText + interim).trim();
      if (text) cbRef.current.onTranscript(text, false);
    };
    rec.onerror = (ev: any) => {
      const code = String(ev?.error ?? 'unknown');
      const msg =
        code === 'not-allowed' || code === 'service-not-allowed'
          ? 'Microphone permission denied — allow mic access to dictate.'
          : code === 'no-speech'
            ? 'No speech detected.'
            : `Voice input error: ${code}`;
      cbRef.current.onError?.(msg);
      setListening(false);
    };
    rec.onend = () => {
      const text = finalText.trim();
      if (text) cbRef.current.onTranscript(text, true);
      setListening(false);
    };

    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      cbRef.current.onError?.('Could not start voice input.');
    }
  }, [lang]);

  const toggle = useCallback(() => (listening ? stop() : start()), [listening, start, stop]);

  useEffect(() => () => recRef.current?.abort(), []);

  return { supported, listening, start, stop, toggle };
}
