-- Neuer Ticker → GitHub Action „Kurse abrufen“ sofort starten (workflow_dispatch, Modus new).
-- workflow_dispatch statt repository_dispatch: Der Token braucht dann nur „Actions: write“,
-- nicht „Contents: write“ (mit dem man auch Code pushen könnte).
-- Optional: Ohne die Vault-Einträge 'github_dispatch_token' und 'github_repo' passiert nichts;
-- dann lädt der nächste reguläre Lauf (alle 30 min) den Ticker. 'github_ref' ist optional (Standard: pwa).
-- Idempotent: kann gefahrlos mehrfach ausgeführt werden.

create extension if not exists pg_net with schema extensions;

create or replace function public.symbols_dispatch_new()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    token text;
    repo  text;
    ref   text;
begin
    select decrypted_secret into token from vault.decrypted_secrets where name = 'github_dispatch_token' limit 1;
    select decrypted_secret into repo  from vault.decrypted_secrets where name = 'github_repo' limit 1;
    select coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'github_ref' limit 1), 'pwa') into ref;
    if token is null or repo is null then
        return new;
    end if;

    perform net.http_post(
        url     := 'https://api.github.com/repos/' || repo || '/actions/workflows/fetch.yml/dispatches',
        headers := jsonb_build_object(
            'Authorization', 'Bearer ' || token,
            'Accept', 'application/vnd.github+json',
            'X-GitHub-Api-Version', '2022-11-28',
            'User-Agent', 'stock-dashboard-supabase',
            'Content-Type', 'application/json'
        ),
        body    := jsonb_build_object('ref', ref, 'inputs', jsonb_build_object('mode', 'new', 'symbols', ''))
    );
    return new;
exception when others then
    -- Ein Fehler beim Benachrichtigen darf das Anlegen des Tickers nie verhindern
    raise warning 'symbols_dispatch_new: %', sqlerrm;
    return new;
end $$;

-- Nur Superuser/Service-Rolle sollen die Funktion direkt aufrufen können
revoke all on function public.symbols_dispatch_new() from public, anon, authenticated;

drop trigger if exists symbols_dispatch_new on public.symbols;
create trigger symbols_dispatch_new
    after insert on public.symbols
    for each row
    when (new.status = 'pending')
    execute function public.symbols_dispatch_new();
