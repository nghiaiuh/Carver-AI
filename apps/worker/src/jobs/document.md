# Jobs Folder

## Vai trò

`jobs/` là lớp route theo `jobType`.

## Mục đích

- nhận `CarverAiJobPayload`
- quyết định handler nào sẽ xử lý
- giữ cho queue layer không biết chi tiết nghiệp vụ

## Flow ngắn

1. Queue nhận job từ BullMQ.
2. `jobs/process-ai-job.ts` đọc `job.data.jobType`.
3. Job được chuyển tới handler phù hợp trong `jobs/handlers/`.

## Ghi chú Phase 1

Phase 1 mới có handler đầu tiên cho generation-preparation path.
Các loại job khác vẫn tạm đi chung handler này để giữ nguyên hành vi cũ.
