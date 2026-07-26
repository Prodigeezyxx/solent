import assert from 'node:assert/strict';
import test from 'node:test';
import { applyReplyEvidence, parseAddressList, providerTimestamp, type SourceResult } from '../src/connectors';
import { reconcileTasksFromReplies } from '../src/loops';

test('parses Zoho-style display-name address headers without dropping email', () => {
  assert.deepEqual(parseAddressList('"Doe, Jane" <Jane.Doe@example.com>, John Smith <john@example.com>'), [
    { name: 'Doe, Jane', email: 'jane.doe@example.com' },
    { name: 'John Smith', email: 'john@example.com' },
  ]);
});

test('normalises epoch seconds, milliseconds, and ISO timestamps', () => {
  assert.equal(providerTimestamp('1721736000'), '2024-07-23T12:00:00.000Z');
  assert.equal(providerTimestamp('1721736000000'), '2024-07-23T12:00:00.000Z');
  assert.equal(providerTimestamp('2024-07-23T12:00:00Z'), '2024-07-23T12:00:00.000Z');
});

test('reply evidence only resolves inbound messages older than the sent reply', () => {
  const result: SourceResult = {
    source: 'zoho',
    ok: true,
    configured: true,
    items: [
      {
        source: 'zoho', ref: 'older', channel: 'Inbox', from: 'Jane', fromId: 'jane@example.com',
        title: 'Question', text: 'Can you confirm?', ts: '2026-07-20T10:00:00Z', isDm: true,
        mentionsMe: false, needsAttention: true, attentionReason: 'direct ask',
      },
      {
        source: 'zoho', ref: 'newer', channel: 'Inbox', from: 'Jane', fromId: 'jane@example.com',
        title: 'New question', text: 'One more thing', ts: '2026-07-22T10:00:00Z', isDm: true,
        mentionsMe: false, needsAttention: true, attentionReason: 'direct ask',
      },
    ],
    myReplies: [{
      source: 'zoho', counterpartyId: 'JANE@example.com', counterparty: 'Jane', ts: '2026-07-21T10:00:00Z',
    }],
  };

  applyReplyEvidence([result]);

  assert.equal(result.items[0].repliedSince, true);
  assert.equal(result.items[0].needsAttention, false);
  assert.equal(result.items[1].repliedSince, undefined);
  assert.equal(result.items[1].needsAttention, true);
});

test('sent evidence completes linked and safe legacy reply tasks only', async () => {
  const tasks = [
    { id: 1, title: 'Reply to Jane', context: 'Confirm the launch', source: 'zoho', source_ref: 'older', counterparty_id: 'jane@example.com', created_at: Date.parse('2026-07-20T11:00:00Z'), done: 0 },
    { id: 2, title: 'Answer Jane about launch', context: null, source: null, source_ref: null, counterparty_id: null, created_at: Date.parse('2026-07-20T11:00:00Z'), done: 0 },
    { id: 3, title: 'Fix logo consistency', context: 'Jane mentioned it', source: null, source_ref: null, counterparty_id: null, created_at: Date.parse('2026-07-20T11:00:00Z'), done: 0 },
  ];
  const fakeDb = {
    prepare(sql: string) {
      const statement = {
        values: [] as unknown[],
        bind(...values: unknown[]) { this.values = values; return this; },
        async all() { return { results: tasks.filter((task) => !task.done) }; },
        async run() {
          if (sql.includes('UPDATE tasks')) {
            const id = Number(this.values[3]);
            const task = tasks.find((candidate) => candidate.id === id);
            if (task) task.done = 1;
          }
          return {};
        },
      };
      return statement;
    },
    async batch(statements: { run: () => Promise<unknown> }[]) {
      return Promise.all(statements.map((statement) => statement.run()));
    },
  };
  const result: SourceResult = {
    source: 'zoho', ok: true, configured: true,
    items: [{
      source: 'zoho', ref: 'older', channel: 'Inbox', from: 'Jane', fromId: 'jane@example.com',
      title: 'Question', text: 'Can you confirm?', ts: '2026-07-20T10:00:00Z', isDm: true,
      mentionsMe: false, needsAttention: false, repliedSince: true,
    }],
    myReplies: [{ source: 'zoho', counterpartyId: 'jane@example.com', counterparty: 'Jane', ts: '2026-07-21T10:00:00Z' }],
  };

  const count = await reconcileTasksFromReplies(fakeDb as never, [result]);

  assert.equal(count, 2);
  assert.equal(tasks[0].done, 1);
  assert.equal(tasks[1].done, 1);
  assert.equal(tasks[2].done, 0, 'non-communication work must never close from a reply alone');
});
