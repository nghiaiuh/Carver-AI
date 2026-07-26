-- A BullMQ retry may resume after the output asset has been persisted. Ensure
-- one AI job can create at most one assistant-generated chat message even if a
-- stalled execution races with its redelivery.

create unique index if not exists chat_messages_ai_job_message_once
  on public.chat_messages (
    project_id,
    thread_id,
    ((metadata ->> 'jobId'))
  )
  where metadata ->> 'source' = 'ai-job'
    and metadata ? 'jobId';
