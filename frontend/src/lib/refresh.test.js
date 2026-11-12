import { describe, expect, it, vi } from 'vitest';
import { describeRefresh, requestRefresh } from './refresh';

describe('describeRefresh', () => {
  it('übersetzt die Antworten von request_refresh()', () => {
    expect(describeRefresh({ ok: true })).toEqual({ ok: true, text: 'Abruf gestartet – die Kurse sind in 1–2 Minuten da.' });
    expect(describeRefresh({ ok: false, reason: 'too-soon', retry_after: 200 }).text).toBe('Gerade erst abgerufen – wieder möglich in 4 Minuten.');
    expect(describeRefresh({ ok: false, reason: 'too-soon', retry_after: 30 }).text).toBe('Gerade erst abgerufen – wieder möglich in 1 Minute.');
    expect(describeRefresh({ ok: false, reason: 'not-configured' }).text).toMatch('Token fehlt');
    expect(describeRefresh({ ok: false, reason: 'not-authenticated' }).text).toMatch('anmelden');
  });

  it('erkennt eine fehlende Migration', () => {
    expect(describeRefresh(null, { code: 'PGRST202', message: 'Could not find the function public.request_refresh' }).text).toMatch('Migration 0003');
    expect(describeRefresh(null, { message: 'Netzwerkfehler' }).text).toMatch('Netzwerkfehler');
  });

  it('ruft die RPC-Funktion auf', async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: { ok: true }, error: null }) };
    expect((await requestRefresh(client)).ok).toBe(true);
    expect(client.rpc).toHaveBeenCalledWith('request_refresh');
  });
});
