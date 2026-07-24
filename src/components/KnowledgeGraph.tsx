import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clock3, GitBranch, Loader2, Maximize2, Minimize2, Orbit, RefreshCw, Share2, Users, X } from 'lucide-react';
import { fetchGraph, type GraphData, type GraphNode, type GraphNodeType } from '../lib/api';

type LayoutMode = 'force' | 'orbit' | 'people' | 'timeline';

const LAYOUTS: { id: LayoutMode; label: string; icon: React.ReactNode; hint: string }[] = [
  { id: 'force', label: 'Web', icon: <Share2 className="w-3 h-3" />, hint: 'force-directed relationship web' },
  { id: 'orbit', label: 'Orbit', icon: <Orbit className="w-3 h-3" />, hint: 'concentric rings by type — attention pulls inward' },
  { id: 'people', label: 'People', icon: <Users className="w-3 h-3" />, hint: 'person-centric: who sends what, grouped by source' },
  { id: 'timeline', label: 'Timeline', icon: <Clock3 className="w-3 h-3" />, hint: 'items placed left→right by time' },
];

/**
 * Knowledge graph panel — force-directed relationship tree over everything
 * SOLENT knows: sources → people → messages → derived priorities, signals,
 * drafts, memories and decisions. Pure client-side physics, zero credits.
 */

interface SimNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fixed?: boolean;
}

const TYPE_STYLE: Record<GraphNodeType, { color: string; label: string }> = {
  hub: { color: '#e5e7eb', label: 'Hub' },
  source: { color: '#7CFFB2', label: 'Sources' },
  channel: { color: '#4ade80', label: 'Channels' },
  person: { color: '#fb923c', label: 'People' },
  message: { color: '#64748b', label: 'Messages' },
  task: { color: '#38bdf8', label: 'Priorities' },
  signal: { color: '#a78bfa', label: 'Signals' },
  draft: { color: '#f472b6', label: 'Drafts' },
  memory: { color: '#fbbf24', label: 'Memories' },
  decision: { color: '#c084fc', label: 'Decisions' },
};

const EDGE_LABEL: Record<string, string> = {
  has: 'has', sent: 'sent', in: 'in', derived: 'derived from', about: 'about', logged: 'logged',
};

function radius(n: GraphNode): number {
  return 6 + Math.min(n.weight, 10) * 2.2;
}

export default function KnowledgeGraph({ onRunBrief, briefRunning }: { onRunBrief: () => void; briefRunning: boolean }) {
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SimNode | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [hiddenTypes, setHiddenTypes] = useState<Set<GraphNodeType>>(new Set());
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [layout, setLayout] = useState<LayoutMode>('force');
  const [fullscreen, setFullscreen] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<SimNode[]>([]);
  const [, force] = useState(0); // re-render ticker
  const dragRef = useRef<{ id: string | null; panning: boolean; lastX: number; lastY: number }>({ id: null, panning: false, lastX: 0, lastY: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const g = await fetchGraph();
      setGraph(g);
      // Seed positions: hub centre, sources ring, rest scattered by type angle.
      const W = 900, H = 600;
      simRef.current = g.nodes.map((n, i) => {
        const angle = (i / Math.max(g.nodes.length, 1)) * Math.PI * 2;
        const dist = n.type === 'hub' ? 0 : n.type === 'source' ? 120 : 220 + (i % 5) * 30;
        return { ...n, x: W / 2 + Math.cos(angle) * dist, y: H / 2 + Math.sin(angle) * dist, vx: 0, vy: 0, fixed: n.type === 'hub' };
      });
      const hub = simRef.current.find((n) => n.type === 'hub');
      if (hub) { hub.x = W / 2; hub.y = H / 2; }
    } catch {
      setGraph(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Esc exits fullscreen
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const e of graph?.edges ?? []) {
      if (!map.has(e.from)) map.set(e.from, new Set());
      if (!map.has(e.to)) map.set(e.to, new Set());
      map.get(e.from)!.add(e.to);
      map.get(e.to)!.add(e.from);
    }
    return map;
  }, [graph]);

  // ---- Deterministic layouts (orbit / people / timeline) --------------------
  useEffect(() => {
    if (!graph || graph.empty || layout === 'force') return;
    const W = 900, H = 600;
    const nodes = simRef.current;
    const place = (n: SimNode, x: number, y: number) => { n.x = x; n.y = y; n.vx = 0; n.vy = 0; };

    if (layout === 'orbit') {
      // Concentric rings: hub → sources → channels+people → messages → derived/logged.
      const ringOf: Record<string, number> = {
        hub: 0, source: 1, channel: 2, person: 2, message: 3, task: 4, signal: 4, draft: 4, memory: 4, decision: 4,
      };
      const rings = new Map<number, SimNode[]>();
      for (const n of nodes) {
        const r = n.attention ? Math.max(1, (ringOf[n.type] ?? 4) - 1) : ringOf[n.type] ?? 4;
        if (!rings.has(r)) rings.set(r, []);
        rings.get(r)!.push(n);
      }
      const RADII = [0, 90, 175, 255, 330];
      for (const [ring, list] of rings) {
        list.sort((a, b) => (a.group ?? '').localeCompare(b.group ?? '') || a.type.localeCompare(b.type));
        list.forEach((n, i) => {
          const angle = (i / list.length) * Math.PI * 2 - Math.PI / 2;
          place(n, W / 2 + Math.cos(angle) * RADII[Math.min(ring, 4)], H / 2 + Math.sin(angle) * RADII[Math.min(ring, 4)]);
        });
      }
    } else if (layout === 'people') {
      // Person-centric lanes: sources across the top, people as columns, their messages below.
      const sources = nodes.filter((n) => n.type === 'source');
      const people = nodes.filter((n) => n.type === 'person');
      const rest = nodes.filter((n) => !['source', 'person', 'message', 'hub'].includes(n.type));
      const hub = nodes.find((n) => n.type === 'hub');
      if (hub) place(hub, 60, 40);
      sources.forEach((s, i) => place(s, 200 + i * 180, 40));
      const colW = Math.max(70, (W - 80) / Math.max(people.length, 1));
      people
        .sort((a, b) => (a.group ?? '').localeCompare(b.group ?? '') || b.weight - a.weight)
        .forEach((p, i) => {
          const x = 50 + colW / 2 + i * colW;
          place(p, Math.min(x, W - 40), 130);
          // that person's messages fall in a column beneath them
          const msgs = nodes.filter((n) => n.type === 'message' && (adjacency.get(p.id)?.has(n.id) ?? false));
          msgs.forEach((m, j) => place(m, Math.min(x, W - 40) + ((j % 2) * 14 - 7), 195 + j * 46));
        });
      // orphan messages + derived nodes along the bottom
      const placedMsg = new Set(people.flatMap((p) => [...(adjacency.get(p.id) ?? [])]));
      nodes.filter((n) => n.type === 'message' && !placedMsg.has(n.id)).forEach((m, i) => place(m, 60 + i * 60, H - 130));
      rest.forEach((n, i) => place(n, 60 + (i % 12) * 68, H - 60 - Math.floor(i / 12) * 40));
    } else if (layout === 'timeline') {
      // Time on X: older left, newer right. Untimed structural nodes pinned as a left rail.
      const timed = nodes.filter((n) => n.ts);
      const untimed = nodes.filter((n) => !n.ts);
      const times = timed.map((n) => n.ts!);
      const min = Math.min(...times, Date.now() - 86_400_000);
      const max = Math.max(...times, Date.now());
      const span = Math.max(max - min, 1);
      const laneY: Record<string, number> = { message: 170, task: 300, signal: 380, draft: 420, memory: 460, decision: 520 };
      const seen = new Map<number, number>(); // x-bucket collision offsets
      timed.forEach((n) => {
        const x = 120 + ((n.ts! - min) / span) * (W - 180);
        const bucket = Math.round(x / 30) * 1000 + Math.round((laneY[n.type] ?? 240) / 10);
        const off = seen.get(bucket) ?? 0;
        seen.set(bucket, off + 1);
        place(n, x, (laneY[n.type] ?? 240) + off * 34);
      });
      untimed.forEach((n, i) => place(n, 46, 60 + i * 34));
    }
    force((v) => v + 1);
  }, [graph, layout, adjacency]);

  // ---- Force simulation ----------------------------------------------------
  useEffect(() => {
    if (!graph || graph.empty || layout !== 'force') return;
    let frame = 0;
    let running = true;
    const edges = graph.edges;
    const tick = () => {
      if (!running) return;
      const nodes = simRef.current;
      const byId = new Map(nodes.map((n) => [n.id, n]));
      // Repulsion (O(n²) is fine at ≤~90 nodes)
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          let dx = a.x - b.x, dy = a.y - b.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
          const f = 1600 / d2;
          const d = Math.sqrt(d2);
          const fx = (dx / d) * f, fy = (dy / d) * f;
          if (!a.fixed) { a.vx += fx; a.vy += fy; }
          if (!b.fixed) { b.vx -= fx; b.vy -= fy; }
        }
      }
      // Spring attraction along edges
      for (const e of edges) {
        const a = byId.get(e.from), b = byId.get(e.to);
        if (!a || !b) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const target = a.type === 'hub' || b.type === 'hub' ? 150 : 90;
        const f = (d - target) * 0.012;
        const fx = (dx / d) * f, fy = (dy / d) * f;
        if (!a.fixed) { a.vx += fx; a.vy += fy; }
        if (!b.fixed) { b.vx -= fx; b.vy -= fy; }
      }
      // Gentle centring + integrate
      for (const n of nodes) {
        if (n.fixed || dragRef.current.id === n.id) { n.vx = 0; n.vy = 0; continue; }
        n.vx += (450 - n.x) * 0.0006;
        n.vy += (300 - n.y) * 0.0006;
        n.vx *= 0.85; n.vy *= 0.85;
        n.x += n.vx; n.y += n.vy;
      }
      force((v) => v + 1);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const stop = setTimeout(() => { running = false; cancelAnimationFrame(frame); }, 8000); // settle then stop burning CPU
    return () => { running = false; cancelAnimationFrame(frame); clearTimeout(stop); };
  }, [graph, layout]);

  // ---- Interaction ----------------------------------------------------------
  const toWorld = (clientX: number, clientY: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * 900;
    const py = ((clientY - rect.top) / rect.height) * 600;
    return { x: (px - view.x) / view.k, y: (py - view.y) / view.k };
  };

  const onPointerDown = (e: React.PointerEvent, node?: SimNode) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    if (node) {
      dragRef.current = { id: node.id, panning: false, lastX: e.clientX, lastY: e.clientY };
    } else {
      dragRef.current = { id: null, panning: true, lastX: e.clientX, lastY: e.clientY };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (d.id) {
      const p = toWorld(e.clientX, e.clientY);
      const n = simRef.current.find((x) => x.id === d.id);
      if (n) { n.x = p.x; n.y = p.y; force((v) => v + 1); }
    } else if (d.panning) {
      const rect = svgRef.current!.getBoundingClientRect();
      setView((v) => ({ ...v, x: v.x + ((e.clientX - d.lastX) / rect.width) * 900, y: v.y + ((e.clientY - d.lastY) / rect.height) * 600 }));
      dragRef.current = { ...d, lastX: e.clientX, lastY: e.clientY };
    }
  };

  const onPointerUp = () => { dragRef.current = { id: null, panning: false, lastX: 0, lastY: 0 }; };

  const onWheel = (e: React.WheelEvent) => {
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    setView((v) => {
      const k = Math.min(Math.max(v.k * factor, 0.35), 3.5);
      const rect = svgRef.current!.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * 900;
      const py = ((e.clientY - rect.top) / rect.height) * 600;
      return { k, x: px - ((px - v.x) / v.k) * k, y: py - ((py - v.y) / v.k) * k };
    });
  };

  const toggleType = (t: GraphNodeType) => {
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  };

  const visible = simRef.current.filter((n) => !hiddenTypes.has(n.type));
  const visibleIds = new Set(visible.map((n) => n.id));
  const visibleEdges = (graph?.edges ?? []).filter((e) => visibleIds.has(e.from) && visibleIds.has(e.to));
  const focusSet = hovered ? new Set([hovered, ...(adjacency.get(hovered) ?? [])]) : null;

  const typeCounts = useMemo(() => {
    const counts = new Map<GraphNodeType, number>();
    for (const n of graph?.nodes ?? []) counts.set(n.type, (counts.get(n.type) ?? 0) + 1);
    return counts;
  }, [graph]);

  return (
    <div className={fullscreen ? 'fixed inset-0 z-[130] bg-solent-bg flex flex-col' : 'h-full flex flex-col relative'}>
      <div className={`flex items-center justify-between gap-3 px-6 pt-${fullscreen ? '4' : '6'} pb-2 flex-wrap`}>
        <div>
          <p className="text-solent-dim font-mono text-[10px] tracking-widest mb-1 flex items-center gap-1.5"><GitBranch className="w-3.5 h-3.5" /> KNOWLEDGE GRAPH</p>
          {!fullscreen && <h1 className="text-xl font-semibold tracking-tight text-solent-text">How everything connects.</h1>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Layout switcher — four ways to see the same graph */}
          <div className="flex items-center rounded-md border border-solent-border overflow-hidden">
            {LAYOUTS.map((l) => (
              <button
                key={l.id}
                onClick={() => { setLayout(l.id); setView({ x: 0, y: 0, k: 1 }); }}
                title={l.hint}
                className={`flex items-center gap-1.5 px-2.5 h-8 text-[10px] font-mono uppercase tracking-wider transition-colors border-r border-solent-border last:border-r-0 ${
                  layout === l.id ? 'bg-solent-mint/10 text-solent-mint' : 'text-solent-dim hover:text-solent-text'
                }`}
              >
                {l.icon} {l.label}
              </button>
            ))}
          </div>
          <button
            onClick={load}
            className="flex items-center gap-1.5 px-3 h-8 rounded-md border border-solent-border text-solent-dim text-xs hover:text-solent-mint hover:border-solent-mint/40 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Rebuild
          </button>
          <button
            onClick={() => setFullscreen((f) => !f)}
            title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            className="flex items-center gap-1.5 px-3 h-8 rounded-md border border-solent-border text-solent-dim text-xs hover:text-solent-mint hover:border-solent-mint/40 transition-colors"
          >
            {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            {fullscreen ? 'Exit' : 'Expand'}
          </button>
        </div>
      </div>

      {/* Type filter legend */}
      <div className="flex items-center gap-1.5 px-6 pb-3 flex-wrap">
        {(Object.keys(TYPE_STYLE) as GraphNodeType[]).filter((t) => t !== 'hub' && (typeCounts.get(t) ?? 0) > 0).map((t) => (
          <button
            key={t}
            onClick={() => toggleType(t)}
            className={`flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-wider rounded-full border px-2 py-0.5 transition-opacity ${hiddenTypes.has(t) ? 'opacity-35 border-solent-border text-solent-dim' : 'border-solent-border text-zinc-300'}`}
          >
            <i className="w-2 h-2 rounded-full" style={{ backgroundColor: TYPE_STYLE[t].color }} />
            {TYPE_STYLE[t].label}
            <span className="text-solent-dim">{typeCounts.get(t)}</span>
          </button>
        ))}
      </div>

      <div className={`flex-1 min-h-0 ${fullscreen ? 'mx-3 mb-3' : 'mx-6 mb-6'} rounded-xl border border-solent-border bg-solent-surface/60 relative overflow-hidden`}>
        {loading && (
          <div className="absolute inset-0 grid place-items-center z-10">
            <Loader2 className="w-6 h-6 text-solent-mint animate-spin" />
          </div>
        )}

        {!loading && (!graph || graph.empty) && (
          <div className="absolute inset-0 grid place-items-center z-10 p-8">
            <div className="text-center max-w-sm">
              <GitBranch className="w-8 h-8 text-solent-dim mx-auto mb-3" />
              <p className="text-solent-muted text-sm mb-1">The graph is empty.</p>
              <p className="text-solent-dim text-xs mb-4">Run the one-shot brief — sources, people, messages, priorities, and signals will appear here as a living relationship tree.</p>
              <button
                onClick={onRunBrief}
                disabled={briefRunning}
                className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md bg-solent-mint text-solent-bg text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {briefRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Run brief
              </button>
            </div>
          </div>
        )}

        <svg
          ref={svgRef}
          viewBox="0 0 900 600"
          className="w-full h-full cursor-grab active:cursor-grabbing touch-none select-none"
          onPointerDown={(e) => onPointerDown(e)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onWheel={onWheel}
          role="img"
          aria-label="Knowledge graph of sources, people, messages, and derived work"
        >
          <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
            {visibleEdges.map((e, i) => {
              const a = simRef.current.find((n) => n.id === e.from);
              const b = simRef.current.find((n) => n.id === e.to);
              if (!a || !b) return null;
              const dim = focusSet && !(focusSet.has(e.from) && focusSet.has(e.to));
              return (
                <line
                  key={i}
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={e.kind === 'derived' ? '#7CFFB2' : e.kind === 'about' ? '#f472b6' : '#334155'}
                  strokeOpacity={dim ? 0.08 : e.kind === 'derived' ? 0.5 : 0.35}
                  strokeWidth={e.kind === 'derived' ? 1.4 : 1}
                  strokeDasharray={e.kind === 'about' ? '3 3' : undefined}
                />
              );
            })}
            {visible.map((n) => {
              const style = TYPE_STYLE[n.type];
              const r = radius(n);
              const dim = focusSet && !focusSet.has(n.id);
              const isSel = selected?.id === n.id;
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x},${n.y})`}
                  opacity={dim ? 0.2 : 1}
                  className="cursor-pointer"
                  onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, n); }}
                  onPointerEnter={() => setHovered(n.id)}
                  onPointerLeave={() => setHovered(null)}
                  onClick={() => setSelected(n)}
                >
                  {(isSel || n.type === 'hub') && <circle r={r + 5} fill="none" stroke={style.color} strokeOpacity={0.4} strokeWidth={1.5} />}
                  {n.attention && (
                    <circle r={r + 4} fill="none" stroke="#f87171" strokeOpacity={0.75} strokeWidth={1.3}>
                      <animate attributeName="r" values={`${r + 3};${r + 7};${r + 3}`} dur="2.2s" repeatCount="indefinite" />
                      <animate attributeName="stroke-opacity" values="0.75;0.15;0.75" dur="2.2s" repeatCount="indefinite" />
                    </circle>
                  )}
                  <circle r={r} fill={style.color} fillOpacity={n.type === 'message' ? 0.35 : 0.22} stroke={n.attention ? '#f87171' : style.color} strokeWidth={1.4} />
                  {n.type !== 'message' && (
                    <text
                      y={r + 11}
                      textAnchor="middle"
                      fill={dim ? '#475569' : '#cbd5e1'}
                      fontSize={n.type === 'hub' ? 11 : 8.5}
                      fontFamily="ui-monospace, monospace"
                    >
                      {n.label.length > 26 ? `${n.label.slice(0, 25)}…` : n.label}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/* Detail card */}
        {selected && (
          <div className="absolute right-3 top-3 w-64 rounded-lg border border-solent-border bg-solent-surface/95 backdrop-blur shadow-2xl p-3 z-20">
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <span className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-wider" style={{ color: TYPE_STYLE[selected.type].color }}>
                <i className="w-2 h-2 rounded-full" style={{ backgroundColor: TYPE_STYLE[selected.type].color }} />
                {selected.type}
              </span>
              <button onClick={() => setSelected(null)} className="text-solent-dim hover:text-solent-text" aria-label="Close detail">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <h3 className="text-xs font-semibold text-zinc-200 leading-snug mb-1">{selected.label}</h3>
            {selected.detail && <p className="text-[10px] text-solent-muted leading-relaxed mb-2">{selected.detail}</p>}
            <div className="border-t border-solent-border/50 pt-2">
              <span className="block text-[9px] font-mono uppercase tracking-wider text-solent-dim mb-1">Connections</span>
              {[...(adjacency.get(selected.id) ?? [])].slice(0, 6).map((id) => {
                const n = simRef.current.find((x) => x.id === id);
                if (!n) return null;
                const edge = graph?.edges.find((e) => (e.from === selected.id && e.to === id) || (e.to === selected.id && e.from === id));
                return (
                  <button key={id} onClick={() => setSelected(n)} className="w-full flex items-center gap-1.5 py-0.5 text-left group">
                    <i className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: TYPE_STYLE[n.type].color }} />
                    <span className="text-[10px] text-zinc-400 group-hover:text-solent-mint truncate transition-colors">{n.label}</span>
                    <span className="ml-auto text-[8px] font-mono text-solent-dim shrink-0">{EDGE_LABEL[edge?.kind ?? 'has']}</span>
                  </button>
                );
              })}
              {(adjacency.get(selected.id)?.size ?? 0) === 0 && <p className="text-[10px] text-solent-dim">No connections.</p>}
            </div>
          </div>
        )}

        {/* Timeline axis hint */}
        {layout === 'timeline' && !loading && graph && !graph.empty && (
          <div className="absolute inset-x-12 top-2 flex justify-between text-[9px] font-mono text-solent-dim z-10 pointer-events-none">
            <span>← older</span><span>time →</span><span>now</span>
          </div>
        )}
        <span className="absolute left-3 bottom-2.5 text-[9px] font-mono text-solent-dim z-10">
          {LAYOUTS.find((l) => l.id === layout)?.hint} · drag nodes · scroll to zoom · drag to pan
        </span>
      </div>
    </div>
  );
}
