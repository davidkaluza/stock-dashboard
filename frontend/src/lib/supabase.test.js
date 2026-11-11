import { describe, expect, it } from 'vitest';
import { normalizeUrl } from './supabase';

describe('normalizeUrl', () => {
  it('entfernt API-Pfade und Schrägstriche', () => {
    expect(normalizeUrl('https://x.supabase.co')).toBe('https://x.supabase.co');
    expect(normalizeUrl(' https://x.supabase.co/rest/v1/ ')).toBe('https://x.supabase.co');
    expect(normalizeUrl('https://x.supabase.co/')).toBe('https://x.supabase.co');
    expect(normalizeUrl(undefined)).toBe('');
  });
});
