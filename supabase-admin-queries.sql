-- 仅在 Supabase Dashboard 的 SQL Editor 中运行。
-- 用于站长查看账号概况；不要把这段查询做成公开网页接口。

-- 账号名称、注册时间、最后登录时间、最后同步时间。
select
  u.id as user_id,
  coalesce(
    ls.account_name,
    u.raw_user_meta_data ->> 'display_name',
    '未命名账号'
  ) as account_name,
  u.created_at as registered_at,
  u.last_sign_in_at,
  ls.updated_at as last_synced_at
from auth.users as u
left join public.learning_states as ls
  on ls.user_id = u.id
order by u.created_at desc;

-- 学习概况：已学词数、测试题数、任务完成数和当前是否有任务。
select
  ls.account_name,
  ls.updated_at as last_synced_at,
  jsonb_object_length(coalesce(ls.state -> 'learned', '{}'::jsonb)) as learned_words,
  coalesce((ls.state #>> '{stats,questions}')::integer, 0) as tested_questions,
  coalesce((ls.state #>> '{stats,missionsCompleted}')::integer, 0) as completed_missions,
  (ls.state -> 'activePack') is not null as has_active_mission
from public.learning_states as ls
order by ls.updated_at desc;
