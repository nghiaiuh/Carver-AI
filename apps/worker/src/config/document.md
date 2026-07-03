# Config Folder

## Vai trò

`config/` là nơi chứa runtime configuration của worker.

## Mục đích

- đọc env cho worker
- validate các key bắt buộc
- gom cấu hình Redis, OpenAI, storage, logging về một chỗ

## Flow ngắn

1. Worker boot.
2. `config/` đọc env.
3. Các lớp `queue/`, `services/`, `providers/` dùng lại config đã chuẩn hóa.

## Ghi chú Phase 1

Ở Phase 1 folder này mới có tài liệu.
Khi dời OpenAI và storage execution sang worker, đây sẽ là nơi thêm các file như:

- `env.ts`
- `openai.ts`
- `storage.ts`
