-- Zuverlässiger Zeitplan und „Jetzt abrufen“-Knopf.
--
-- GitHub führt zeitgesteuerte Workflows nur nach Möglichkeit aus und lässt bei Last viele Läufe aus.
-- Deshalb startet Supabase (pg_cron) die Action per workflow_dispatch. Der GitHub-Zeitplan bleibt als Reserve.
-- Voraussetzung: Vault-Einträge 'github_dispatch_token' und 'github_repo' (siehe docs/einrichtung.md, E2).
-- Ohne sie passiert nichts. Enthält auch den Trigger „neuer Ticker“ aus 0002 (0002 ist damit optional).
-- Idempotent: kann gefahrlos mehrfach ausgeführt werden.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- ── Action starten ─────────────────────────────────────────────

create or replace function public.dispatch_fetch(mode text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    token text;
    repo  text;
    ref   text;
begin
    if mode not in ('quotes', 'nightly', 'new', 'test-push') then
        raise exception 'unbekannter Modus: %', mode;
    end if;
    select decrypted_secret into token from vault.decrypted_secrets where name = 'github_dispatch_token' limit 1;
    select decrypted_secret into repo  from vault.decrypted_secrets where name = 'github_repo' limit 1;
    select coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'github_ref' limit 1), 'pwa') into ref;
    if token is null or repo is null then
        return false;
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
        body    := jsonb_build_object('ref', ref, 'inputs', jsonb_build_object('mode', mode, 'symbols', ''))
    );
    return true;
end $$;

revoke all on function public.dispatch_fetch(text) from public, anon, authenticated;

-- Neuer Ticker nutzt dieselbe Funktion (ersetzt die Fassung aus 0002)
create or replace function public.symbols_dispatch_new()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
    perform public.dispatch_fetch('new');
    return new;
exception when others then
    raise warning 'symbols_dispatch_new: %', sqlerrm;
    return new;
end $$;

revoke all on function public.symbols_dispatch_new() from public, anon, authenticated;

drop trigger if exists symbols_dispatch_new on public.symbols;
create trigger symbols_dispatch_new
    after insert on public.symbols
    for each row
    when (new.status = 'pending')
    execute function public.symbols_dispatch_new();

-- ── „Jetzt abrufen“ aus der App (höchstens alle 5 Minuten) ───────

create table if not exists public.refresh_requests (
    id            bigint generated always as identity primary key,
    user_id       uuid not null default auth.uid(),
    requested_at  timestamptz not null default now()
);
alter table public.refresh_requests enable row level security;  -- nur über request_refresh() erreichbar

create or replace function public.request_refresh()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    last_at timestamptz;
    wait    integer;
begin
    if auth.uid() is null then
        return jsonb_build_object('ok', false, 'reason', 'not-authenticated');
    end if;
    select max(requested_at) into last_at from public.refresh_requests;
    if last_at is not null and last_at > now() - interval '5 minutes' then
        wait := ceil(extract(epoch from (last_at + interval '5 minutes' - now())));
        return jsonb_build_object('ok', false, 'reason', 'too-soon', 'retry_after', wait);
    end if;
    if not public.dispatch_fetch('quotes') then
        return jsonb_build_object('ok', false, 'reason', 'not-configured');
    end if;
    insert into public.refresh_requests (user_id) values (auth.uid());
    delete from public.refresh_requests where requested_at < now() - interval '7 days';
    return jsonb_build_object('ok', true);
end $$;

revoke all on function public.request_refresh() from public, anon;
grant execute on function public.request_refresh() to authenticated;

-- ── Zeitplan (UTC; Mo–Fr 6–21 Uhr ≈ 7–23 Uhr deutscher Zeit) ─────
-- cron.schedule mit gleichem Namen ersetzt einen vorhandenen Job.

select cron.schedule('stock-dashboard-quotes',  '*/30 6-21 * * 1-5', $$select public.dispatch_fetch('quotes')$$);
select cron.schedule('stock-dashboard-nightly', '0 2 * * *',         $$select public.dispatch_fetch('nightly')$$);
