# Yêu cầu và quyết định — SogiT Studio

## Mục tiêu đã thống nhất

Ứng dụng cửa sổ riêng trên Windows, dùng được trên nhiều cấu hình máy, hỗ trợ phim storytelling kết hợp lời dẫn và hội thoại. Quản lý một/nhiều tài khoản Muse; reference upload hoặc AI hỗ trợ tạo; tự nhập hoặc AI viết kịch bản/prompt; lưu dự án trên ổ; hậu kỳ QHD/UHD và đầu ra không tự chèn watermark.

Ảnh người dùng cung cấp cho thấy Muse ở `https://muse.ai/`, tài khoản có giới hạn tuần và 1 tỷ token bổ sung, thư viện ảnh/video và thao tác tạo video mở chat. Ảnh không xác minh API, cách tính token, model, giới hạn đồng thời, hỗ trợ reference hoặc quyền tải không watermark. Không khẳng định các khả năng này khi chưa có chứng cứ runtime/tài liệu.

## Đã triển khai trong bản 0.2.0

| Thành phần | Phạm vi |
| --- | --- |
| Desktop | Electron, React, TypeScript, giao diện tiếng Việt, đóng gói Windows x64 |
| Dự án | Chọn thư mục, JSON lưu atomic, nhập media vào assets, tự lưu, mở lại |
| Kịch bản | Tự viết, ví dụ, nhận diện scene/shot/timecode, tách ghi chú chung, preview và chọn thêm/thay danh sách; chia cảnh dài theo thời lượng |
| AI văn bản | Chat Completions compatible, model/endpoint riêng, duyệt kết quả, key qua kho mã hóa OS |
| Reference | Hồ sơ nhân vật/bối cảnh/trang phục/đạo cụ/phong cách, ảnh đại diện, khóa, gán nhiều hồ sơ/cảnh |
| Tạo reference bằng AI | Tạo qua phiên chat Muse, nhận ảnh khi bộ nhận diện tương thích; không gọi API ảnh không rõ nguồn |
| Phân cảnh | Nội dung, thời lượng, góc/chuyển động máy, cảm xúc, lời dẫn/hội thoại, tài khoản, trạng thái, sắp xếp, nhân bản |
| Prompt | Ghép mẫu từ hồ sơ/scene hoặc AI viết; chỉnh sửa; copy/xuất TXT |
| Muse | Phiên riêng, probe ô chat, gửi một lần, gắn reference qua ô file, chờ câu trả lời, tải ảnh/video trực tiếp; fallback thủ công và báo cáo DOM không chứa nội dung chat |
| Video | Tạo ảnh storyboard và video qua UI Muse (thử nghiệm); nhiều bản, xem, duyệt/chọn bản cho shot |
| Âm thanh | Nhập file lời dẫn/hội thoại và nhạc; gán cảnh; trộn lúc xuất |
| Hậu kỳ | FFmpeg CPU, ghép/cắt/giữ khung hình, chọn tỷ lệ/FPS/kích thước, MP4, SRT theo cảnh |
| Upscale | Lanczos thông thường đã test; tích hợp executable Real-ESRGAN tùy chọn chưa test GPU |
| Tài nguyên | Đề xuất profile theo RAM, giới hạn luồng, 1 tác vụ hậu kỳ, hủy và xem log |

## Chưa triển khai / cần dữ liệu để triển khai

1. **Muse runtime thật**: đã có adapter UI và kiểm thử Electron fixture; cần xác minh DOM/model/upload/kết quả trên phiên Muse thật của người dùng. Không có tài khoản ở cloud để chứng minh. Có Báo cáo kết nối (class/role/tag, không chat/cookie/token) và selector nâng cao để cập nhật. Không đoán endpoint, không giả số dư. Video blob/HLS cần tải thủ công.
2. **Giọng nói tự động và lip-sync**: chọn nhà cung cấp/model, ngôn ngữ và giọng, chi phí, quyền sử dụng. Hiện dùng audio file chuẩn bị sẵn; chưa có giọng cố định tự sinh.
3. **Phân tích liên tục bằng hình ảnh**: khuôn mặt, trang phục, đạo cụ; cần model kiểm tra, ngưỡng và bộ ví dụ đánh giá. Hiện người dùng duyệt thủ công.
4. **Timeline tương tác**: kéo thả và căn audio ở mức khung hình, tự duck nhạc, phụ đề từng câu, chuyển cảnh, xuất XML/EDL cho phần mềm dựng.
5. **Sinh video local**: chọn model theo VRAM, quản lý tải model và giấy phép; không gộp vào bản nhẹ.
6. **Dự toán chi phí và truy vấn trạng thái Muse sau crash**: chưa có API trạng thái/idempotency. Đã có hàng đợi UI tuần tự, nhật ký trên ổ và dừng sau lỗi; việc gửi đang dở được đánh dấu gián đoạn/chưa rõ kết quả, không tự gửi lại. Không tuyên bố tự tiếp tục tác vụ sau crash.
7. **Đóng gói/ký số/cập nhật tự động**: kiểm tra trên Windows 10/11 thật, Intel/AMD/NVIDIA và các cấu hình RAM khác nhau trước khi tuyên bố hỗ trợ rộng.

## Tham khảo

Đã đọc README qua Git để tìm hướng triển khai; không chạy các model này và không sao chép source của các dự án sau:

- [Tauri](https://github.com/tauri-apps/tauri): tham khảo desktop. Bản đầu chọn Electron để triển khai cửa sổ Muse có phiên riêng.
- [ComfyUI](https://github.com/Comfy-Org/ComfyUI): quy trình ảnh/video/API; hướng tích hợp engine về sau.
- [Wan2.1](https://github.com/Wan-Video/Wan2.1) và [WanVideoWrapper](https://github.com/kijai/ComfyUI-WanVideoWrapper): tham khảo sinh video/local.
- [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN): phục hồi/upscale, cần đánh giá nhấp nháy theo thời gian.
- [Video2X](https://github.com/k4yt3x/video2x): tham khảo pipeline; AGPL-3.0, không nhúng mã dự án vào ứng dụng này.
- [FFmpeg](https://ffmpeg.org/): gọi executable do người dùng cài, chưa phân phối binary.

Việc dùng model/API/binary có giấy phép riêng. Bản đầu không tuyên bố quyền thương mại cho nội dung tạo ra hay gói model không đi kèm.
