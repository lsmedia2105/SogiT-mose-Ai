Bản 0.2.0 bổ sung **tạo ảnh trực tiếp từ từng shot và hàng đợi Muse**.

Tải `SogiT Studio-0.2.0-win.zip` trong Assets, giải nén toàn bộ và chạy `SogiT Studio.exe`. Thoát bản cũ trước khi mở bản mới. Dự án cũ dùng lại được qua `project.sogit.json`.

- Nhập CẢNH/SCENE/SHOT, mốc thời gian, TXT/MD; tách ghi chú MASTER VISUAL LOCK; duyệt trước khi thêm hoặc thay danh sách shot.
- Muse chia shot qua phiên đăng nhập. Tạo ảnh từng shot/hàng loạt; tạo reference; gắn ảnh tham chiếu và tự lưu kết quả về dự án khi giao diện tương thích.
- Tạo video từng shot từ prompt/storyboard; MP4/WebM trực tiếp mới hỗ trợ tải tự động, blob/HLS cần tải thủ công.
- Nhật ký lưu trên ổ, một tác vụ mỗi lần, không tự gửi lại khi chưa rõ kết quả. Dừng chờ trong tool không hủy xử lý bên Muse.
- Có Báo cáo kết nối để chẩn đoán bộ nhận diện; không lấy nội dung chat, cookie, mật khẩu hoặc token.

**Tự động hóa Muse đang thử nghiệm:** đã test bằng trang giả lập trong Electron, chưa kiểm chứng phiên Muse thật của người dùng. Nếu Muse đổi DOM/model, có thể cần cập nhật bộ nhận diện. Thử một shot trước. Không hứa mọi tài khoản/model hoạt động ngay.

Windows 10/11 x64; gói chưa ký số. Không cần Node.js. FFmpeg/FFprobe cần cài riêng để ghép/xuất phim. Chưa có TTS/lip-sync tự động; không xóa watermark nguồn. AI upscale Real-ESRGAN cần GPU/models riêng, chưa kiểm thử GPU thực.

Xem README trong repository để dùng chi tiết. SHA256SUMS.txt dùng kiểm tra file tải xuống.
