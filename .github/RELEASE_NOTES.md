**SogiT Studio v0.3.0 — một cảnh chứa nhiều shot, reference ngay trong Studio.**

Tải `SogiT Studio-0.3.0-win.zip`, giải nén toàn bộ, thoát bản cũ rồi chạy `SogiT Studio.exe`.

- Upload reference và nhập kịch bản trong cùng tab Studio.
- Một cảnh có nhiều shot: 0–2, 2–4, 4–6, 6–8 giây thành bốn shot trong một cảnh 8 giây.
- Tự đánh mã C001-S001, C001-S002…; cảnh tiếp theo C002-S001.
- Gợi ý reference theo tên/tên gọi khác; reference chung toàn phim, chung cảnh và riêng shot. Thumbnail có nút thêm/upload và bỏ ở từng shot.
- Card lớn theo cảnh, prompt/tài khoản/kết quả/nút tạo cho từng shot; tạo cả cảnh hoặc toàn dự án.
- Đổi thứ tự vẫn giữ ID/media/reference. Tải file có mã cảnh-shot; xuất phim và SRT theo đúng thứ tự.
- Mở dự án cũ và sao lưu bản gốc trước nâng cấp; giữ kết quả/reference đã chọn.

Build, 28 kiểm thử core, giao diện và desktop được kiểm tra. Tự động hóa Muse vẫn thử nghiệm: kiểm thử bằng trang giả lập, chưa xác minh phiên Muse thật của người dùng. Nếu lỗi nhận diện, xuất Báo cáo kết nối. Không tự gửi lại sau trạng thái chưa rõ; dừng chờ không hủy yêu cầu bên Muse.

Windows 10/11 x64, gói chưa ký số. FFmpeg/FFprobe cần cài riêng để dựng/xuất. Không xóa watermark nguồn; chưa có TTS/lip-sync tự động. Xem README để dùng chi tiết.
