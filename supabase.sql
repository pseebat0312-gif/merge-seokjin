-- Paste the whole file into your Supabase SQL Editor, then Run.
-- Safe to rerun; does not erase players or scores.
begin;
create table if not exists public.merge_players (
 id uuid primary key references auth.users(id) on delete cascade,
 nickname text not null check (char_length(nickname) between 1 and 16),
 best integer not null default 0 check (best between 0 and 1000000000),
 created_at timestamptz not null default now()
);
alter table public.merge_players enable row level security;
-- Access is through narrowly scoped functions only, not direct table writes.
revoke all on public.merge_players from anon, authenticated;
create index if not exists merge_players_best_idx on public.merge_players(best desc);
create or replace function public.merge_profile(p_name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null then raise exception '请先登录'; end if;
 if p_name is null or char_length(btrim(p_name)) not between 1 and 16 then raise exception '昵称应为 1–16 个字符'; end if;
 insert into public.merge_players(id,nickname) values(auth.uid(),btrim(p_name))
 on conflict(id) do update set nickname=excluded.nickname;
end; $$;
create or replace function public.merge_submit(p_score integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_best integer; v_rank bigint;
begin
 if auth.uid() is null then raise exception '请先登录'; end if;
 if p_score is null or p_score<0 or p_score>1000000000 or p_score%10<>0 then raise exception '无效成绩'; end if;
 update public.merge_players set best=greatest(best,p_score) where id=auth.uid() returning best into v_best;
 if not found then raise exception '请先设置昵称'; end if;
 select count(*)+1 into v_rank from public.merge_players where best>v_best;
 return jsonb_build_object('best',v_best,'rank',v_rank);
end; $$;
create or replace function public.merge_board() returns jsonb
language sql stable security definer set search_path = '' as $$
 with ranked as (
 select id,nickname,best,rank() over(order by best desc) as rank
 from public.merge_players
 ), leaders as (select * from ranked order by rank,nickname,id limit 100)
 select jsonb_build_object(
 'top',coalesce((select jsonb_agg(to_jsonb(leaders) order by rank,nickname,id) from leaders),'[]'::jsonb),
 'me',(select to_jsonb(ranked) from ranked where id=auth.uid()))
 where auth.uid() is not null;
$$;
revoke all on function public.merge_profile(text) from public,anon,authenticated;
revoke all on function public.merge_submit(integer) from public,anon,authenticated;
revoke all on function public.merge_board() from public,anon,authenticated;
grant execute on function public.merge_profile(text) to authenticated;
grant execute on function public.merge_submit(integer) to authenticated;
grant execute on function public.merge_board() to authenticated;
commit;
