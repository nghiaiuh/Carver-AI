# Mappers Folder

## Vai trò

`mappers/` là nơi chuẩn hóa object nội bộ thành shape lưu DB hoặc trả về cho web.

## Mục đích

- map provider output
- map internal error sang error code ổn định
- tách transform logic khỏi handler

## Flow ngắn

1. Service nhận raw result.
2. Mapper chuyển thành shape chuẩn.
3. Repository lưu shape đó vào DB.

## Ghi chú Phase 1

Phase 1 folder này mới có tài liệu.
Khi worker bắt đầu generate ảnh thật, đây là nơi hợp lý cho:

- `build-job-result.ts`
- `build-job-error.ts`
