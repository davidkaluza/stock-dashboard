// „Jetzt von Yahoo abrufen“: startet über die Datenbankfunktion request_refresh() die GitHub Action
// (Migration 0003). Höchstens alle 5 Minuten; danach liegen die Kurse nach ca. 1–2 Minuten in der Datenbank.

/** Antwort von request_refresh() bzw. Fehler → Meldung für die Anzeige */
export function describeRefresh(result, error) {
  if (error) {
    const missing = error.code === 'PGRST202' || /request_refresh/.test(error.message || '');
    return missing
      ? { ok: false, text: 'Noch nicht eingerichtet: Migration 0003 in Supabase ausführen (Anleitung E2).' }
      : { ok: false, text: `Abruf konnte nicht gestartet werden: ${error.message || error}` };
  }
  if (result?.ok) return { ok: true, text: 'Abruf gestartet – die Kurse sind in 1–2 Minuten da.' };
  switch (result?.reason) {
    case 'too-soon': {
      const min = Math.max(1, Math.ceil((result.retry_after || 60) / 60));
      return { ok: false, text: `Gerade erst abgerufen – wieder möglich in ${min} Minute${min === 1 ? '' : 'n'}.` };
    }
    case 'not-configured':
      return { ok: false, text: 'GitHub-Token fehlt im Supabase-Vault (Anleitung E2).' };
    case 'not-authenticated':
      return { ok: false, text: 'Bitte erneut anmelden.' };
    default:
      return { ok: false, text: 'Abruf konnte nicht gestartet werden.' };
  }
}

export async function requestRefresh(client) {
  const { data, error } = await client.rpc('request_refresh');
  return describeRefresh(data, error);
}
