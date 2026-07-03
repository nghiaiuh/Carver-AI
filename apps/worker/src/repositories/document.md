# Repositories Folder

## Vai trò

`repositories/` là lớp persistence của worker.

## Mục đích

- đọc / ghi database
- che giấu chi tiết Supabase query khỏi handler
- chuẩn hóa các thao tác như update trạng thái `ai_jobs`

## Flow ngắn

1. Handler hoặc service gọi repository.
2. Repository thực hiện query.
3. Result được trả về cho lớp orchestration.

## Ghi chú Phase 1

Phase 1 mới có repository cho `ai_jobs`.
Về sau có thể thêm:

- `asset-repository.ts`
- `snapshot-repository.ts`
