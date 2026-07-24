import type { D1Database } from '@cloudflare/workers-types';

/**
 * CONTEXT LIBRARY — operator-fed knowledge (strategy memos, product notes,
 * investor updates, pasted docs). Stored raw in D1; injected COMPACTLY into
 * the brief and CONDUCTOR prompts so the model reasons with your context.
 *
 * Credit strategy: docs never trigger their own model calls. They ride along
 * inside the existing single-call prompts, clipped to a strict budget.
 */

export interface DocRow {
  id: number;
  title: string;
  kind: string;
  content: string;
  created_at: number;
  updated_at: number;
}

export interface DocMeta {
  id: number;
  title: string;
  kind: string;
  preview: string;
  size: number;
  created_at: number;
  updated_at: number;
}

export async function listDocs(db: D1Database): Promise<DocMeta[]> {
  const { results } = await db
    .prepare('SELECT id, title, kind, substr(content, 1, 140) AS preview, length(content) AS size, created_at, updated_at FROM docs ORDER BY updated_at DESC LIMIT 50')
    .all<DocMeta>();
  return results ?? [];
}

export async function getDoc(db: D1Database, id: number): Promise<DocRow | null> {
  return db.prepare('SELECT * FROM docs WHERE id = ?').bind(id).first<DocRow>();
}

export async function saveDoc(db: D1Database, title: string, content: string, kind = 'doc', id?: number): Promise<number> {
  const now = Date.now();
  if (id) {
    await db.prepare('UPDATE docs SET title = ?, content = ?, kind = ?, updated_at = ? WHERE id = ?').bind(title, content, kind, now, id).run();
    return id;
  }
  const res = await db
    .prepare('INSERT INTO docs (title, content, kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .bind(title, content, kind, now, now)
    .run();
  return Number(res.meta.last_row_id);
}

export async function deleteDoc(db: D1Database, id: number): Promise<void> {
  await db.prepare('DELETE FROM docs WHERE id = ?').bind(id).run();
}

/**
 * Compact context block for prompts. Budget-capped: newest docs first,
 * each clipped, total ≤ maxChars (~1.5k tokens at 6k chars).
 */
export async function docsForPrompt(db: D1Database, maxChars = 4000): Promise<string> {
  try {
    const { results } = await db
      .prepare('SELECT title, content FROM docs ORDER BY updated_at DESC LIMIT 8')
      .all<{ title: string; content: string }>();
    if (!results?.length) return '';
    const parts: string[] = [];
    let used = 0;
    for (const d of results) {
      const budget = Math.min(1200, maxChars - used);
      if (budget < 200) break;
      const body = d.content.replace(/\s+/g, ' ').trim().slice(0, budget);
      parts.push(`[${d.title}] ${body}`);
      used += body.length + d.title.length + 4;
    }
    return `OPERATOR CONTEXT LIBRARY (docs you were given — treat as ground truth):\n${parts.join('\n')}`;
  } catch {
    return '';
  }
}
