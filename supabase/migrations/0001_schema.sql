-- Stock Dashboard PWA – Grundschema
-- Marktdaten: lesbar für angemeldete Nutzer, schreibbar nur mit Service-Key (umgeht RLS).
-- Nutzerdaten: nur für den Besitzer (auth.uid()).

-- ── Marktdaten ──────────────────────────────────────────────────

create table if not exists public.symbols (
    symbol      text primary key,
    name        text,
    currency    text,
    exchange    text,
    status      text not null default 'pending' check (status in ('pending', 'ok', 'unknown')),
    updated_at  timestamptz not null default now()
);

create table if not exists public.quotes (
    symbol      text primary key references public.symbols(symbol) on delete cascade,
    price       double precision,
    prev_close  double precision,
    change      double precision,
    change_pct  double precision,
    fetched_at  timestamptz not null default now()
);

create table if not exists public.daily_prices (
    symbol  text not null references public.symbols(symbol) on delete cascade,
    date    date not null,
    close   double precision not null,
    primary key (symbol, date)
);

create table if not exists public.stats (
    symbol      text primary key references public.symbols(symbol) on delete cascade,
    data        jsonb not null,
    fetched_at  timestamptz not null default now()
);

create table if not exists public.details (
    symbol      text primary key references public.symbols(symbol) on delete cascade,
    data        jsonb not null,
    fetched_at  timestamptz not null default now()
);

create table if not exists public.news (
    symbol        text not null references public.symbols(symbol) on delete cascade,
    id            text not null,
    title         text not null,
    publisher     text,
    link          text,
    published_at  timestamptz,
    primary key (symbol, id)
);
create index if not exists news_symbol_published_idx on public.news (symbol, published_at desc);

-- ── Nutzerdaten ─────────────────────────────────────────────────

create table if not exists public.user_tickers (
    user_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
    symbol    text not null check (symbol = upper(symbol) and length(symbol) between 1 and 32),
    added_at  timestamptz not null default now(),
    primary key (user_id, symbol)
);

create table if not exists public.alert_rules (
    id          bigint generated always as identity primary key,
    user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
    symbol      text not null,
    type        text not null check (type in ('day_change', 'threshold', 'news', 'reference')),
    params      jsonb not null default '{}'::jsonb,
    enabled     boolean not null default true,
    last_state  jsonb,
    updated_at  timestamptz not null default now(),
    unique (user_id, symbol, type)
);

create table if not exists public.push_subscriptions (
    id            bigint generated always as identity primary key,
    user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
    endpoint      text not null unique,
    p256dh        text not null,
    auth          text not null,
    device_label  text,
    created_at    timestamptz not null default now()
);

create table if not exists public.alert_log (
    id        bigint generated always as identity primary key,
    user_id   uuid not null references auth.users(id) on delete cascade,
    rule_id   bigint references public.alert_rules(id) on delete set null,
    symbol    text not null,
    title     text not null,
    body      text,
    sent_at   timestamptz not null default now()
);
create index if not exists alert_log_user_sent_idx on public.alert_log (user_id, sent_at desc);

-- ── Row Level Security ──────────────────────────────────────────

alter table public.symbols            enable row level security;
alter table public.quotes             enable row level security;
alter table public.daily_prices       enable row level security;
alter table public.stats              enable row level security;
alter table public.details            enable row level security;
alter table public.news               enable row level security;
alter table public.user_tickers       enable row level security;
alter table public.alert_rules        enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.alert_log          enable row level security;

-- Marktdaten: nur lesen, nur angemeldet
do $$
declare t text;
begin
    foreach t in array array['symbols', 'quotes', 'daily_prices', 'stats', 'details', 'news'] loop
        execute format('drop policy if exists "read market data" on public.%I', t);
        execute format('create policy "read market data" on public.%I for select to authenticated using (true)', t);
    end loop;
end $$;

-- Eigene Ticker, Regeln, Abos: alles, aber nur eigene Zeilen
do $$
declare t text;
begin
    foreach t in array array['user_tickers', 'alert_rules', 'push_subscriptions'] loop
        execute format('drop policy if exists "own rows" on public.%I', t);
        execute format(
            'create policy "own rows" on public.%I for all to authenticated '
            'using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    end loop;
end $$;

-- Verlauf: nur lesen (schreibt die Action)
drop policy if exists "own log" on public.alert_log;
create policy "own log" on public.alert_log for select to authenticated
    using (user_id = (select auth.uid()));

-- Die PWA setzt last_state nicht: bei Änderungen an Regeln durch Nutzer zurücksetzen
create or replace function public.alert_rules_reset_state()
returns trigger language plpgsql as $$
begin
    if auth.role() = 'authenticated' then
        new.last_state := null;
        new.updated_at := now();
    end if;
    return new;
end $$;

drop trigger if exists alert_rules_reset_state on public.alert_rules;
create trigger alert_rules_reset_state
    before insert or update on public.alert_rules
    for each row execute function public.alert_rules_reset_state();

-- ── Neuer Ticker → symbols-Zeile 'pending' ─────────────────────
-- security definer: die PWA darf symbols selbst nicht schreiben.

create or replace function public.user_tickers_ensure_symbol()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    insert into public.symbols (symbol, status) values (new.symbol, 'pending')
    on conflict (symbol) do nothing;
    return new;
end $$;

drop trigger if exists user_tickers_ensure_symbol on public.user_tickers;
create trigger user_tickers_ensure_symbol
    after insert on public.user_tickers
    for each row execute function public.user_tickers_ensure_symbol();
