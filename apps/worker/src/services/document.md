# Services Folder

## Vai trò

`services/` là lớp orchestration cấp giữa.

## Mục đích

- ghép nhiều bước nghiệp vụ nhỏ lại thành flow rõ ràng
- gọi repository khi cần update trạng thái
- build result nghiệp vụ trước khi persist

## Flow ngắn

1. Handler gọi service.
2. Service chuẩn hóa logic dùng lại.
3. Repository thực hiện persistence.

## Ghi chú Phase 1

Phase 1 chỉ wrap logic cũ:

- update trạng thái job
- build brief
- compile prompt metadata

Chưa có OpenAI image execution trong folder này.
