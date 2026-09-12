-- À exécuter une seule fois dans le SQL Editor d’un projet Supabase neuf.
-- Activer ensuite Authentication > Providers > Anonymous Sign-Ins.
begin;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists cockpit_private;
create table public.cockpit_games (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 state jsonb not null check (jsonb_typeof(state)='object') check (pg_column_size(state)<=1048576),
 revision bigint not null default 0 check(revision>=0),
 updated_at timestamptz not null default now()
);
create table cockpit_private.secrets (
 game_id uuid primary key references public.cockpit_games(id) on delete cascade,
 key_hash bytea not null
);
create table cockpit_private.viewers (
 game_id uuid not null references public.cockpit_games(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 primary key(game_id,user_id)
);
alter table public.cockpit_games enable row level security;
alter table cockpit_private.secrets enable row level security;
alter table cockpit_private.viewers enable row level security;
revoke all on public.cockpit_games from public,anon,authenticated;
grant select on public.cockpit_games to authenticated;
revoke all on cockpit_private.secrets,cockpit_private.viewers from public,anon,authenticated;
revoke all on schema cockpit_private from public,anon,authenticated;
grant usage on schema cockpit_private to authenticated;
create function cockpit_private.is_viewer(p_game_id uuid) returns boolean
 language sql stable security definer set search_path='' as $$
 select exists(select 1 from cockpit_private.viewers where game_id=p_game_id and user_id=auth.uid());
$$;
create policy cockpit_read on public.cockpit_games for select to authenticated
 using(owner_id=(select auth.uid()) or cockpit_private.is_viewer(id));

create function cockpit_private.create_game(p_state jsonb) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare v_game public.cockpit_games; v_key text;
begin
 if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
 v_key:=pg_catalog.encode(extensions.gen_random_bytes(32),'hex');
 insert into public.cockpit_games(owner_id,state) values(auth.uid(),p_state) returning * into v_game;
 insert into cockpit_private.secrets(game_id,key_hash) values(v_game.id,extensions.digest(v_key,'sha256'));
 return pg_catalog.jsonb_build_object('game',pg_catalog.to_jsonb(v_game),'key',v_key);
end; $$;
create function cockpit_private.join_game(p_game_id uuid,p_key text) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare v_game public.cockpit_games;
begin
 if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
 if length(p_key)<>64 or not exists(select 1 from cockpit_private.secrets where game_id=p_game_id and key_hash=extensions.digest(p_key,'sha256')) then
  raise exception 'invalid_invitation' using errcode='42501';
 end if;
 insert into cockpit_private.viewers(game_id,user_id) values(p_game_id,auth.uid()) on conflict do nothing;
 select * into strict v_game from public.cockpit_games where id=p_game_id;
 return pg_catalog.to_jsonb(v_game);
end; $$;
create function cockpit_private.save_game(p_game_id uuid,p_state jsonb,p_expected_revision bigint) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare v_game public.cockpit_games;
begin
 if auth.uid() is null or not exists(select 1 from public.cockpit_games where id=p_game_id and owner_id=auth.uid()) then
  raise exception 'owner_required' using errcode='42501';
 end if;
 update public.cockpit_games set state=p_state,revision=revision+1,updated_at=pg_catalog.now()
  where id=p_game_id and owner_id=auth.uid() and revision=p_expected_revision returning * into v_game;
 if not found then raise exception 'revision_conflict' using errcode='40001'; end if;
 return pg_catalog.to_jsonb(v_game);
end; $$;
create function public.cockpit_create_game(p_state jsonb) returns jsonb
 language sql security invoker set search_path='' as $$select cockpit_private.create_game(p_state);$$;
create function public.cockpit_join_game(p_game_id uuid,p_key text) returns jsonb
 language sql security invoker set search_path='' as $$select cockpit_private.join_game(p_game_id,p_key);$$;
create function public.cockpit_save_game(p_game_id uuid,p_state jsonb,p_expected_revision bigint) returns jsonb
 language sql security invoker set search_path='' as $$select cockpit_private.save_game(p_game_id,p_state,p_expected_revision);$$;
revoke execute on function cockpit_private.is_viewer(uuid),cockpit_private.create_game(jsonb),cockpit_private.join_game(uuid,text),cockpit_private.save_game(uuid,jsonb,bigint),public.cockpit_create_game(jsonb),public.cockpit_join_game(uuid,text),public.cockpit_save_game(uuid,jsonb,bigint) from public,anon,authenticated;
grant execute on function cockpit_private.is_viewer(uuid),cockpit_private.create_game(jsonb),cockpit_private.join_game(uuid,text),cockpit_private.save_game(uuid,jsonb,bigint),public.cockpit_create_game(jsonb),public.cockpit_join_game(uuid,text),public.cockpit_save_game(uuid,jsonb,bigint) to authenticated;
alter publication supabase_realtime add table public.cockpit_games;
commit;
