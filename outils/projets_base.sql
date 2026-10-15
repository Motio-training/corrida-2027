-- Plusieurs projets dans la même base Supabase (appliqué le 14 octobre 2026).
-- La Corrida 2027 est le premier projet ; ses données n'ont pas bougé
-- (état 'courant', versions existantes). Les autres projets ont leur état
-- sous l'identifiant 'p:<id>' et leurs versions marquées par la colonne projet.
-- Le même code secret protège tous les projets (table secret, inchangée).
-- Copie de l'état et des versions d'avant le changement : schéma sauvegarde
-- (non exposé par l'API).

create schema if not exists sauvegarde;
revoke all on schema sauvegarde from public, anon, authenticated;
create table sauvegarde.etat_20261014 as table public.etat;
create table sauvegarde.versions_20261014 as table public.versions;

-- les projets : réglages lisibles par tous, écriture par projet_admin seulement
create table public.projets (
  id text primary key check (id ~ '^[a-z0-9]([a-z0-9-]{0,46}[a-z0-9])?$'),
  nom text not null check (char_length(btrim(nom)) between 1 and 80),
  type text not null default 'course' check (type in ('course','nocturne','trail','marche','velo','autre')),
  date_evt text check (date_evt is null or date_evt ~ '^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$'),
  couleur text not null default '#F2B33D' check (couleur ~ '^#[0-9A-Fa-f]{6}$'),
  logo text check (logo is null or (logo like 'data:image/%' and length(logo) <= 400000)),
  zone jsonb not null,            -- {o,s,e,n} en degrés, lieu, c (centre du bourg)
  fond text not null default 'genere' check (fond in ('corrida','genere')),
  source text,                    -- projet copié à la création
  archive boolean not null default false,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now()
);
alter table public.projets enable row level security;
create policy "lecture publique des projets" on public.projets for select to anon, authenticated using (true);

-- données générées d'un projet (cle 'graphe' : réseau des rues IGN BD TOPO)
create table public.projets_donnees (
  projet text not null references public.projets(id) on delete cascade,
  cle text not null check (cle ~ '^[a-z0-9_-]{1,40}$'),
  data jsonb not null,
  maj timestamptz not null default now(),
  primary key (projet, cle)
);
alter table public.projets_donnees enable row level security;
create policy "lecture publique des données de projet" on public.projets_donnees for select to anon, authenticated using (true);

insert into public.projets (id, nom, type, date_evt, couleur, zone, fond, cree_le)
values ('corrida-2027', 'Corrida 2027', 'nocturne', '2027-01-29T19:00', '#F2B33D',
  jsonb_build_object('o', -0.24169922, 's', 46.39998810, 'e', -0.18676758, 'n', 46.42839216,
                     'lieu', 'Saint-Maixent-l''École', 'sous_titre', 'ENSOA · Saint-Maixent-l''École'),
  'corrida', '2026-09-11T06:31:06Z');

alter table public.versions add column projet text not null default 'corrida-2027' references public.projets(id) on delete cascade;
alter table public.versions drop constraint versions_maj_key;
alter table public.versions add constraint versions_projet_maj_key unique (projet, maj);
create index versions_projet_maj on public.versions (projet, maj desc);
alter table public.etat add column projet text references public.projets(id) on delete cascade;
update public.etat set projet = 'corrida-2027' where id = 'courant';

-- contrôle du code secret, interne (pas appelable depuis l'API)
create or replace function public.code_ok(code text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare h text;
begin
  select s.code_hash into h from public.secret s where s.id = 1;
  if h is null or code is null or h <> encode(extensions.digest(code, 'sha256'), 'hex') then
    perform pg_sleep(0.5);
    return false;
  end if;
  return true;
end $$;
revoke execute on function public.code_ok(text) from public, anon, authenticated;

-- enregistrer le travail d'un projet : état courant + version (200 gardées par projet)
create or replace function public.enregistrer_projet(code text, p_projet text, p jsonb, courant boolean default true)
returns text language plpgsql security definer set search_path = '' as $$
declare m text; eid text; pid text;
begin
  if not public.code_ok(code) then raise exception 'code refusé' using errcode = '28000'; end if;
  select x.id into pid from public.projets x where x.id = p_projet;
  if pid is null then raise exception 'projet inconnu' using errcode = 'P0002'; end if;
  if p is null or jsonb_typeof(p->'waypoints') <> 'array' then
    raise exception 'paquet invalide' using errcode = '22023';
  end if;
  m := coalesce(p->>'maj', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  eid := case when pid = 'corrida-2027' then 'courant' else 'p:' || pid end;
  if courant then
    insert into public.etat (id, maj, data, projet) values (eid, m, p, pid)
    on conflict (id) do update set maj = excluded.maj, data = excluded.data, modifie_le = now()
    where public.etat.maj <= excluded.maj;
  end if;
  insert into public.versions (projet, maj, data) values (pid, m, p) on conflict (projet, maj) do nothing;
  delete from public.versions where id in (
    select v.id from public.versions v where v.projet = pid order by v.maj desc offset 200);
  update public.projets set modifie_le = now() where id = pid;
  return m;
end $$;

-- les pages ouvertes avant le changement appellent encore enregistrer_corrida
create or replace function public.enregistrer_corrida(code text, p jsonb, courant boolean default true)
returns text language plpgsql security definer set search_path = '' as $$
begin
  return public.enregistrer_projet(code, 'corrida-2027', p, courant);
end $$;

-- créer (avec copie éventuelle d'un projet), modifier, archiver, restaurer,
-- ranger des données générées ; 'verifier' teste seulement le code
create or replace function public.projet_admin(code text, action text, args jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  base text; nid text; n int := 1; z jsonb; src text; m text; d jsonb;
begin
  if not public.code_ok(code) then raise exception 'code refusé' using errcode = '28000'; end if;
  args := coalesce(args, '{}'::jsonb);

  if action = 'verifier' then
    return jsonb_build_object('ok', true);

  elsif action = 'creer' then
    z := args->'zone';
    if z is null or jsonb_typeof(z) <> 'object'
       or (z->>'o')::float8 >= (z->>'e')::float8 or (z->>'s')::float8 >= (z->>'n')::float8
       or abs((z->>'o')::float8) > 180 or abs((z->>'e')::float8) > 180
       or abs((z->>'s')::float8) > 85 or abs((z->>'n')::float8) > 85 then
      raise exception 'zone invalide' using errcode = '22023';
    end if;
    base := lower(coalesce(args->>'nom', ''));
    base := replace(replace(base, 'œ', 'oe'), 'æ', 'ae');
    base := translate(base, 'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ', 'aaaaaaceeeeiiiinooooouuuuyy');
    base := btrim(regexp_replace(base, '[^a-z0-9]+', '-', 'g'), '-');
    base := btrim(left(base, 40), '-');
    if base = '' then base := 'projet'; end if;
    nid := base;
    while exists (select 1 from public.projets x where x.id = nid) loop
      n := n + 1; nid := base || '-' || n;
    end loop;
    src := nullif(args->>'source', '');
    if src is not null and not exists (select 1 from public.projets x where x.id = src) then src := null; end if;
    insert into public.projets (id, nom, type, date_evt, couleur, logo, zone, fond, source)
    values (nid, btrim(args->>'nom'), coalesce(nullif(args->>'type', ''), 'course'), nullif(args->>'date_evt', ''),
            coalesce(nullif(args->>'couleur', ''), '#F2B33D'), nullif(args->>'logo', ''), z,
            coalesce(nullif(args->>'fond', ''), 'genere'), src);
    if src is not null then
      m := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
      select e.data into d from public.etat e where e.projet = src;
      if d is not null then
        d := jsonb_set(d, '{maj}', to_jsonb(m));
        insert into public.etat (id, maj, data, projet) values ('p:' || nid, m, d, nid);
        insert into public.versions (projet, maj, data) values (nid, m, d);
      end if;
      if coalesce((args->>'copier_donnees')::boolean, false) then
        insert into public.projets_donnees (projet, cle, data)
        select nid, x.cle, x.data from public.projets_donnees x where x.projet = src;
      end if;
    end if;
    return jsonb_build_object('id', nid);

  elsif action = 'modifier' then
    update public.projets set
      nom = coalesce(nullif(btrim(args->>'nom'), ''), nom),
      type = coalesce(nullif(args->>'type', ''), type),
      date_evt = case when args ? 'date_evt' then nullif(args->>'date_evt', '') else date_evt end,
      couleur = coalesce(nullif(args->>'couleur', ''), couleur),
      logo = case when args ? 'logo' then nullif(args->>'logo', '') else logo end,
      modifie_le = now()
    where id = args->>'id';
    if not found then raise exception 'projet inconnu' using errcode = 'P0002'; end if;
    return jsonb_build_object('ok', true);

  elsif action in ('archiver', 'restaurer') then
    if args->>'id' = 'corrida-2027' then raise exception 'la Corrida 2027 reste toujours affichée' using errcode = 'P0001'; end if;
    update public.projets set archive = (action = 'archiver'), modifie_le = now() where id = args->>'id';
    if not found then raise exception 'projet inconnu' using errcode = 'P0002'; end if;
    return jsonb_build_object('ok', true);

  elsif action = 'donnees' then
    if not exists (select 1 from public.projets x where x.id = args->>'id') then
      raise exception 'projet inconnu' using errcode = 'P0002';
    end if;
    if args->'data' is null or length((args->'data')::text) > 25000000 then
      raise exception 'données absentes ou trop lourdes' using errcode = '22023';
    end if;
    insert into public.projets_donnees (projet, cle, data) values (args->>'id', args->>'cle', args->'data')
    on conflict (projet, cle) do update set data = excluded.data, maj = now();
    return jsonb_build_object('ok', true);
  end if;

  raise exception 'action inconnue' using errcode = '22023';
end $$;
