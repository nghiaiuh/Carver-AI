# Worker Architecture Document

## Mục đích của `apps/worker`

`apps/worker` là nơi xử lý các tác vụ nền của Carver AI theo mô hình queue-based background processing.

Worker tồn tại để:

- đưa các tác vụ AI nặng ra khỏi request/response của web
- tránh timeout ở API route
- gom toàn bộ orchestration dài hơi vào một nơi duy nhất
- cho phép retry, theo dõi trạng thái job, và mở rộng pipeline về sau
- giữ cho `apps/web` chỉ làm nhiệm vụ nhận yêu cầu, xác thực, tạo job, và hiển thị kết quả

Trong định hướng đúng của project:

- `apps/web` không nên gọi OpenAI image generation trực tiếp cho flow production
- `apps/worker` nên là nơi thực thi thật các bước generate / analyze / refine / export

---

## Hiện trạng worker

Hiện tại `apps/worker` còn rất gọn, mới có:

- `src/index.ts`
  - khởi tạo BullMQ worker
  - lắng nghe queue `carver-ai-jobs`
  - đọc `CarverAiJobPayload`
  - build brief từ snapshot và canvas graph context
  - compile prompt nếu job là `generate_concept` hoặc `refine_concept`
  - cập nhật trạng thái `ai_jobs` trong Supabase

Worker hiện **chưa** làm các việc sau:

- chưa gọi OpenAI Image API
- chưa upload generated image lên storage
- chưa tạo asset record cho ảnh output
- chưa ghi output snapshot mới về canvas
- chưa publish kết quả hoàn chỉnh để web chỉ việc poll/subcribe

Nói ngắn gọn:

- worker hiện đang xử lý phần `briefing / prompt preparation`
- chưa xử lý phần `real image execution pipeline`

---

## Vai trò của worker trong hệ thống tổng thể

Flow hiện tại của toàn hệ thống:

1. User thao tác trên canvas ở `apps/web`
2. Web gom context:
   - target image
   - connected source images
   - preset references
   - snapshot hiện tại
3. Web tạo `ai_job`
4. Web enqueue job vào Redis/BullMQ
5. Worker lấy job ra xử lý
6. Worker cập nhật `ai_jobs.status`
7. Web đọc trạng thái job và hiển thị lại cho user

Flow đích sau khi refactor generate:

1. Web validate request và tạo job
2. Worker build brief + compile prompt
3. Worker gọi model AI
4. Worker lưu output image vào storage
5. Worker ghi metadata asset / result vào DB
6. Worker cập nhật `ai_jobs` thành `succeeded` hoặc `failed`
7. Web poll/subcribe để render ảnh mới lên chat và canvas

---

## Các thành phần liên quan ngoài worker

### `apps/web`

Vai trò:

- UI canvas
- chat panel
- prompt composer
- API route tạo job
- poll trạng thái job

File liên quan:

- `apps/web/app/api/projects/[projectId]/ai-jobs/route.ts`
  - route tạo job và enqueue
- `apps/web/app/api/generate/route.ts`
  - route generate trực tiếp hiện tại, dự kiến sẽ được thu gọn hoặc thay thế

### `packages/shared`

Vai trò:

- chứa contract dùng chung giữa web và worker

File liên quan:

- `packages/shared/src/ai-jobs.ts`
  - `CarverAiJobPayload`
  - `CreateAiJobRequest`
  - `CanvasGenerationContext`
  - `GeneratedCanvasImage`

### `packages/queue`

Vai trò:

- định nghĩa queue name, queue factory, queue config Redis/BullMQ

File liên quan:

- `packages/queue/src/index.ts`

### `packages/ai`

Vai trò:

- build brief
- prompt engine
- graph-aware generation context logic

File liên quan:

- `packages/ai/src/connected-generation-brief.ts`
- `buildSnapshotAwareEditBrief(...)`
- `compileFinalPrompt(...)`

### `packages/db`

Vai trò:

- Supabase admin/server access
- DB typing và schema ownership

---

## Hạ tầng worker đang phụ thuộc

Worker hiện phụ thuộc vào:

- Redis
  - làm queue backend cho BullMQ
- Supabase
  - đọc/ghi bảng `ai_jobs`
- Shared contracts
  - để web và worker dùng cùng payload shape
- AI package
  - build brief và compile prompt

Hạ tầng cần có khi worker xử lý generate thật:

- OpenAI API key
- storage target cho generated images
  - nên là bucket riêng cho generated assets
- DB tables / asset records
  - để liên kết output image với project và job

---

## Cấu trúc folder hiện tại

Hiện tại:

```txt
apps/worker/
  src/
    index.ts
  package.json
  tsconfig.json
```

Ưu điểm:

- rất đơn giản
- dễ nhìn ở giai đoạn MVP đầu

Nhược điểm:

- mọi trách nhiệm đang dồn vào một file
- khó mở rộng khi thêm generate/analyze/export
- khó test từng bước của pipeline
- dễ lẫn orchestration, provider call, DB update, error mapping

---

## Cấu trúc folder nên hướng tới khi refactor

Đề xuất mục tiêu cho `apps/worker/src`:

```txt
apps/worker/src/
  index.ts
  config/
    env.ts
  queue/
    worker.ts
    events.ts
  jobs/
    process-ai-job.ts
    handlers/
      generate-concept.ts
      refine-concept.ts
      analyze-reference.ts
      export.ts
  services/
    job-status-service.ts
    generation-service.ts
    asset-persistence-service.ts
  providers/
    openai/
      generate-image.ts
      map-openai-error.ts
  repositories/
    ai-job-repository.ts
    asset-repository.ts
    snapshot-repository.ts
  mappers/
    build-job-result.ts
    build-job-error.ts
  utils/
    logger.ts
    retry.ts
    mime.ts
```

### Vai trò từng folder

#### `config/`

Chứa:

- đọc env
- validate biến môi trường cần cho worker
- tránh để logic env nằm rải rác trong handler

#### `queue/`

Chứa:

- khởi tạo BullMQ worker
- đăng ký event `completed`, `failed`, `stalled`
- wiring giữa queue và job processor

#### `jobs/`

Chứa:

- entry xử lý một `CarverAiJobPayload`
- router theo `jobType`
- tách handler theo từng nghiệp vụ

Ví dụ:

- `generate-concept.ts`
- `refine-concept.ts`
- `analyze-reference.ts`
- `export.ts`

#### `services/`

Chứa orchestration cấp vừa:

- build generation input
- gọi provider
- persist output
- cập nhật job status theo từng stage

Service là lớp điều phối nghiệp vụ, không nên chứa code UI hay queue wiring.

#### `providers/`

Chứa code gọi dịch vụ bên ngoài:

- OpenAI Images
- sau này có thể thêm provider khác

Nguyên tắc:

- tách provider adapter khỏi business flow
- để sau này đổi model hoặc thêm provider ít đụng phần còn lại

#### `repositories/`

Chứa code truy cập DB/storage:

- đọc job
- update status
- tạo asset
- tạo snapshot output

Nguyên tắc:

- repository chỉ làm persistence
- không build prompt trong đây

#### `mappers/`

Chứa:

- chuẩn hóa output/result payload
- map lỗi provider thành error code nội bộ

Ví dụ:

- `rate_limit`
- `provider_invalid_request`
- `storage_upload_failed`
- `snapshot_create_failed`

#### `utils/`

Chứa helper nhỏ:

- logger
- mime helpers
- retry utilities
- time helpers

---

## Vai trò của `index.ts` sau refactor

`index.ts` nên chỉ còn các nhiệm vụ:

- boot worker process
- load config
- tạo worker instance
- đăng ký lifecycle logs/events

`index.ts` không nên:

- chứa logic build prompt dài
- chứa logic gọi OpenAI trực tiếp
- chứa logic upload storage
- chứa logic xử lý mọi loại job trong một file

---

## Mô hình job nên áp dụng

Một `ai_job` nên có lifecycle rõ ràng:

- `queued`
- `running`
- `succeeded`
- `failed`

Về sau có thể mở rộng thêm:

- `waiting_for_retry`
- `canceled`
- `partially_succeeded`

Mỗi job nên có:

- `job_type`
- `project_id`
- `created_by`
- `input_snapshot_id`
- `job_payload`
- `job_result`
- `error_code`
- `error_message`

Worker phải là nơi update các field runtime này một cách nhất quán.

---

## Flow xử lý lý tưởng cho job generate

### 1. Nhận job từ queue

Input:

- `jobId`
- `projectId`
- `prompt`
- `snapshot`
- `targetNodeId`
- `canvasGraphContext`

### 2. Đánh dấu job running

Update DB:

- `status = running`
- clear lỗi cũ nếu có

### 3. Build brief và compile prompt

Nguồn:

- snapshot
- canvas graph context
- prompt text

Output:

- `editBrief`
- `compiledPrompt`

### 4. Gọi provider generate

Input:

- enhanced prompt
- generation settings
- image/reference context nếu provider hỗ trợ

Output:

- raw generated image
- provider metadata

### 5. Lưu asset output

Bao gồm:

- upload image lên storage
- tạo record asset
- gắn với project/job/user

### 6. Tạo kết quả trả về cho web

Bao gồm:

- generated image info
- assistant message nếu cần
- prompt meta
- asset ids

### 7. Update job succeeded

Ghi:

- `status = succeeded`
- `job_result = ...`
- `provider = ...`

### 8. Nếu lỗi thì update failed

Ghi:

- `status = failed`
- `error_code`
- `error_message`

---

## Boundary rất quan trọng

### Những gì nên ở `apps/web`

- xác thực request
- verify quyền project
- tạo row `ai_jobs`
- enqueue job
- poll/subcribe kết quả
- render output lên chat/canvas

### Những gì không nên ở `apps/web`

- gọi image provider trực tiếp cho flow production
- orchestration nhiều bước
- upload output asset sau generate
- retry logic

### Những gì nên ở `apps/worker`

- prompt execution pipeline
- provider integration
- persistence output
- job status lifecycle
- retry / failure handling

### Những gì không nên ở `apps/worker`

- React/UI state
- canvas interaction logic
- quyền truy cập browser-side

---

## Nguyên tắc refactor worker

1. Không rewrite lớn một lần.
2. Tách theo trách nhiệm trước, rồi mới chuyển logic generate.
3. Giữ nguyên contract đang chạy nếu chưa cần đổi.
4. Mọi payload dùng chung phải nằm ở `packages/shared`.
5. Mọi queue setup dùng chung phải nằm ở `packages/queue`.
6. Mọi brief/prompt logic dùng chung phải nằm ở `packages/ai`.
7. `apps/worker` chỉ orchestration và execution.

---

## Thứ tự triển khai khuyến nghị

### Phase 1

Refactor cấu trúc worker mà chưa đổi hành vi lớn:

- tách `index.ts`
- tạo `jobs/`, `services/`, `repositories/`, `providers/`
- giữ nguyên behavior hiện tại: build brief + compile prompt + update job

### Phase 2

Chuyển generate thật từ web route sang worker:

- web chỉ tạo job
- worker gọi OpenAI Images
- worker lưu kết quả vào `ai_jobs.job_result`

### Phase 3

Persist output asset:

- upload storage
- tạo asset record
- trả metadata chuẩn cho web

### Phase 4

Canvas/chat integration hoàn chỉnh:

- web poll/subcribe job
- ảnh output hiện trong chat
- ảnh output chèn vào canvas

### Phase 5

Stability:

- retry policy
- error mapping
- structured logs
- metrics/observability nếu cần

---

## Checklist bảo trì

Khi sửa worker, luôn kiểm tra:

- contract `CarverAiJobPayload` có còn đồng bộ với web không
- `ai_jobs.job_payload` và `job_result` có serialize được không
- worker có update status đủ mọi nhánh lỗi không
- provider errors có được map rõ ràng không
- logic generate có làm lộ secret hoặc signed URL không
- output image có gắn ownership/project đúng không
- snapshot cũ có vẫn tương thích không

---

## Kết luận ngắn

Worker của Carver AI nên là:

- nơi chạy các pipeline AI nền
- nơi quản lý lifecycle của `ai_jobs`
- nơi thực thi generate/refine/analyze/export thật
- nơi giữ orchestration sạch, tách khỏi UI và request route

Hiện tại worker mới ở giai đoạn đầu.
Refactor đúng hướng là:

- tách cấu trúc theo trách nhiệm
- sau đó chuyển dần logic generate thật từ `apps/web/app/api/generate/route.ts` sang worker
- cuối cùng để web chỉ còn nhiệm vụ tạo job và hiển thị kết quả
