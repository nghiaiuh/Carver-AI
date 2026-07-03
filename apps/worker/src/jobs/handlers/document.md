# Handlers Folder

## Vai trò

`jobs/handlers/` chứa logic xử lý theo từng `jobType`.

## Mục đích

- mỗi file đại diện cho một nhóm nghiệp vụ cụ thể
- handler gọi service và repository, không nên tự ôm mọi thứ

## Flow ngắn

1. `process-ai-job.ts` route vào handler.
2. Handler điều phối flow xử lý.
3. Service build result.
4. Repository persist trạng thái.

## Ghi chú Phase 1

Hiện mới có handler đầu tiên cho generation preparation path.
Về sau sẽ tách thêm các handler chuyên biệt cho:

- `refine-concept`
- `analyze-reference`
- `export`
