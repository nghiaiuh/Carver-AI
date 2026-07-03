# Providers Folder

## Vai trò

`providers/` chứa adapter gọi dịch vụ bên ngoài mà worker dùng để thực thi job.

## Mục đích

- tách OpenAI call khỏi service orchestration
- chuẩn hóa lỗi provider
- giúp thay model hoặc thay provider mà ít đụng business flow

## Flow ngắn

1. Service build input cho provider.
2. Provider gọi API ngoài và trả raw result đã chuẩn hóa.
3. Mapper/service dùng result đó để persist output.
