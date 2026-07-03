# Queue Folder

## Vai trò

`queue/` chịu trách nhiệm wiring giữa BullMQ và phần xử lý nghiệp vụ của worker.

## Mục đích

- tạo worker instance
- gắn processor vào queue
- đăng ký event completed / failed

## Flow ngắn

1. `index.ts` gọi `createAiJobWorker()`.
2. `queue/worker.ts` tạo BullMQ worker với processor trung tâm.
3. `queue/events.ts` gắn log lifecycle cho worker.

## Ghi chú Phase 1

Folder này chỉ làm bootstrap queue.
Nó không nên chứa logic build prompt, update DB, hay gọi provider.
