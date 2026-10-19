# SogiT Studio

Ứng dụng desktop Windows cho phim storytelling có lời dẫn và hội thoại. Giao diện tiếng Việt, dự án nằm trên ổ đĩa, tham chiếu được gán theo cảnh. Bản đầu **v0.2.0**.

## Dùng trên Windows

Tải gói Windows tại **[GitHub Releases](https://github.com/lsmedia2105/SogiT-mose-Ai/releases/latest)**. Chọn `SogiT Studio-0.2.0-win.zip` trong **Assets**. Nếu bản Release chưa xuất hiện, xem tiến độ ở **[Actions](https://github.com/lsmedia2105/SogiT-mose-Ai/actions/workflows/windows-release.yml)**. Workflow chạy khi đẩy tag `v*`, kiểm thử core trên Linux rồi build Windows và đăng ZIP lên Release; có thể chạy lại thủ công theo tag.

Gói thử nghiệm: `release/SogiT Studio-0.2.0-win.zip`. Giải nén **toàn bộ** rồi chạy `SogiT Studio.exe`; không chạy executable bên trong ZIP. Không cần Node.js để dùng gói này. Windows 10/11 64-bit; không bắt buộc NVIDIA cho quản lý dự án và thao tác cloud. Gói chưa ký số và chưa được thử trên máy Windows thực.

1. Tạo dự án, chọn thư mục lưu trên ổ có đủ dung lượng.
2. Vào **Kịch bản & thế giới**, dán kịch bản hoặc nhập TXT/MD. Bấm **Tách & duyệt shot**: nhận diện `CẢNH n`, `SCENE n`, `SHOT n`, mốc thời gian; tách MASTER VISUAL LOCK thành ghi chú chung. Cảnh dài có thể chia theo thời lượng, cần duyệt lại hành động. Chọn thêm shot hoặc thay danh sách cũ; file media được giữ. Muốn AI chia shot, chọn tài khoản và bấm **Muse chia shot**; kết quả cũng phải duyệt trước khi thêm.
3. Vào **Kho reference**, thêm hồ sơ nhân vật/bối cảnh, nhập ảnh đã duyệt và khóa hồ sơ nếu muốn.
4. Trong **Studio phân cảnh**, mở cảnh để chọn reference, chỉnh góc máy, lời dẫn, hội thoại và thời lượng. Bấm **Ghép từ hồ sơ** để tạo prompt theo mẫu, hoặc tự sửa prompt.
5. Thêm tên tài khoản trong **Tài khoản AI**, mở cửa sổ Muse và tự đăng nhập. Mỗi tài khoản có phiên riêng.
6. Chọn tài khoản ở thanh **Sản xuất trực tiếp qua Muse**, bấm **Kiểm tra Muse**. Sau đó bấm **Tạo ảnh shot** trên từng card hoặc **Tạo ảnh N shot** để chạy tuần tự. Trong chi tiết shot có **Tạo ảnh trên Muse**, **Tạo video Muse** và các phiên bản ảnh/video. Reference đã chọn được đính kèm qua ô tải file khi nhận diện được. Kết quả tải thành công được sao chép vào dự án; chọn bản video và bấm **Duyệt & dùng bản này**. Nút copy/mở Muse thủ công vẫn có để dùng khi tự động hóa chưa tương thích.
7. Nhập file lời dẫn/hội thoại/nhạc qua **Thư viện media**, gán vào cảnh và xuất tại **Hậu kỳ & xuất phim**.

Không được giả định token Muse tương đương số ảnh/video hoặc dùng được ở API khác. Chưa có API Muse được xác minh. Bản 0.2.0 bổ sung tự động hóa giao diện chat: gửi yêu cầu, đính kèm reference, chờ và tải kết quả khi nhận diện được DOM và file media. Đây là tích hợp thử nghiệm; chưa xác minh với phiên Muse thật của người dùng. Không đọc số dư token, không vượt giới hạn và không loại bỏ watermark.


## Tạo trực tiếp trên Muse — đọc trước lần đầu

1. Thoát bản cũ trước khi mở bản cập nhật. Đừng xóa thư mục dữ liệu ứng dụng nếu muốn giữ phiên đăng nhập. Mở dự án cũ bằng file `project.sogit.json`.
2. Trong **Tài khoản AI**, mở/đăng nhập Muse, vào chat có ô Message trống. Bấm **Kiểm tra**. Không đăng nhập lại nếu phiên đã còn hiệu lực.
3. Thử **một shot** trước khi chạy cả danh sách. Bấm tạo dùng hạn mức tài khoản và gửi mô tả/ref của shot lên Muse. Không thao tác ô chat trong lúc tool đang chạy.
4. Ảnh kết quả xuất hiện trên card và mục **Ảnh storyboard**. Tạo lại giữ bản cũ; bấm một ảnh để chọn bản dùng cho shot. **Tạo video Muse** đính kèm cả ảnh storyboard đã chọn và reference.
5. Trong kho reference, mở hồ sơ chưa khóa rồi bấm **Lưu & tạo ảnh reference trên Muse**. Khi có ảnh mới, chọn ảnh đại diện đã duyệt và lưu.
6. Nếu báo không tìm thấy ô chat/vùng trả lời, về **Tài khoản AI → Báo cáo kết nối**. JSON chỉ chứa cấu trúc bộ nhận diện (tag/class/role), không lấy nội dung chat, cookie, mật khẩu hoặc token. Có thể gửi file này để cập nhật bộ nhận diện. Cài đặt có CSS selector nâng cao nhưng không cần tự đoán.

Tích hợp chỉ tự động thao tác UI, không có endpoint Muse nội bộ được đoán hoặc gọi. Model và chế độ tạo ảnh/video phải được tài khoản Muse hỗ trợ. Nếu Muse hỏi lại bằng chữ, không trả media hoặc dùng UI khác, tác vụ có thể dừng và cần kiểm tra trực tiếp.

**An toàn hàng đợi:** mỗi tác vụ gửi một lần, xử lý tuần tự, dừng ở lỗi đầu tiên. Không tự đổi tài khoản để vượt quota, không tự gửi lại sau timeout. **Dừng chờ / hàng đợi không hủy tác vụ bên Muse**. Nếu trạng thái “chưa rõ kết quả” hoặc “bị gián đoạn”, xem Muse trước khi bấm tạo lại. Shot chưa rõ kết quả bị loại khỏi lượt hàng loạt mặc định. Nhật ký nằm tại `.sogit/muse-history.json` trong dự án. Trạng thái chưa hoàn tất khi mở lại được đánh dấu gián đoạn, không tự chạy lại.

Tải tự động hỗ trợ PNG/JPEG/WebP, MP4/WebM trực tiếp; video blob/HLS chưa hỗ trợ, tải thủ công rồi nhập vào cảnh. Giới hạn 40 MB/ảnh, 500 MB/video. Tải thất bại không được báo là đã tạo thành công.

Ví dụ kịch bản có sẵn shot:

```text
MASTER VISUAL LOCK
Điện ảnh hiện thực, làng biển Việt Nam, Linh luôn mặc áo khoác xanh.

CẢNH 1 — Trở về
SHOT 1 | 00:00–00:08
MÔ TẢ: Linh đứng trước ngôi nhà cũ bên biển.
CỠ CẢNH: Toàn cảnh
MÁY QUAY: Tiến chậm
LỜI DẪN: Mười năm sau, cô trở về.
IMAGE PROMPT: Cinematic wide shot of Linh outside a weathered seaside home.

SHOT 2 | 00:08–00:16
MÔ TẢ: Cận tay Linh mở lá thư trên bàn gỗ.
HỘI THOẠI: Linh: Cha vẫn chờ con sao?
```

## Công cụ hậu kỳ

Trong **Cài đặt**, chọn `ffmpeg.exe` và `ffprobe.exe`, hoặc thêm chúng vào PATH. Tải từ [FFmpeg](https://ffmpeg.org/download.html). Cần bản FFmpeg có encoder `libx264` và AAC. Hai công cụ này **không được đóng gói sẵn**.

- Xuất MP4 theo thứ tự cảnh; tỷ lệ 16:9, 9:16, 1:1, 2.39:1; FPS 24/25/30.
- HD, Full HD, QHD (2560×1440 với 16:9), UHD (3840×2160 với 16:9). Tỷ lệ dọc đảo chiều; tỷ lệ vuông và scope dùng cạnh dài tương ứng.
- Clip dài được cắt theo thời lượng cảnh; clip ngắn được giữ khung hình cuối. Chỉ xuất khi mỗi cảnh đã chọn một phiên bản video.
- Không có file thoại riêng: giữ âm thanh nguồn nếu có. Có file lời dẫn/hội thoại: thay âm thanh nguồn bằng các file này. Hai file bắt đầu cùng lúc; cần chuẩn bị file có khoảng lặng đúng vị trí. Nhạc nền lặp ở âm lượng cố định.
- Phụ đề SRT hiện theo toàn bộ thời lượng từng cảnh; chưa căn từng từ/câu, chưa chèn vào hình.
- Lanczos là **resize thông thường**, không phải AI phục hồi chi tiết.
- AI upscale tùy chọn dùng [Real-ESRGAN-ncnn-vulkan](https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan/releases): chọn executable và thư mục có `realesrgan-x4plus.param`/`.bin`, GPU/driver Vulkan tương thích. Xử lý tuần tự, tile 128, mỗi clip tối đa 120 giây. Kiểm tra dung lượng ổ tạm trước: ảnh PNG trung gian có thể chiếm hàng chục GB. Chưa kiểm chứng chạy engine này trên GPU Windows.
- Không tự chèn watermark; dấu có sẵn trong video nguồn được giữ nguyên.

## AI viết kịch bản/prompt (tùy chọn)

Kết nối endpoint tương thích `POST /chat/completions` tại **Cài đặt**, nhập base URL (thường kết thúc `/v1`), model và API key của nhà cung cấp. HTTPS bắt buộc, trừ HTTP localhost cho server local. **Không tự dùng hạn mức Muse**.

Khi bấm AI, văn bản kịch bản, hồ sơ phim, mô tả reference và cảnh liên quan được gửi tới endpoint đã chọn; ảnh/video không gửi qua chức năng này. Kết quả luôn được mở để duyệt trước khi áp dụng. API key được lưu bằng Electron `safeStorage`; từ chối lưu khi không có kho mã hóa an toàn. Không ghi key vào dự án hoặc trình duyệt preview.

## Cấu hình máy và dữ liệu

- Tiết kiệm: mặc định với RAM dưới 12 GB; hậu kỳ 2 luồng FFmpeg. Các chế độ còn lại dùng 4 luồng. Mỗi lần chỉ một tác vụ hậu kỳ.
- RAM 12–23 GB mặc định Cân bằng; từ 24 GB mặc định Chất lượng. Đây là cấu hình đề xuất, không phải chứng nhận khả năng GPU. Chưa cài engine sinh ảnh/video local.
- Giao diện vẫn dùng được khi không có GPU rời. Dựng 4K có thể chậm trên CPU; AI upscale yêu cầu phần cứng riêng.
- Dự án gồm `project.sogit.json` và `assets/`. Sao chép **cả thư mục** để chuyển máy. File nhập được sao chép, không phụ thuộc file gốc. File media không bị xóa khi bỏ cảnh/reference.
- Tự lưu sau 650 ms; trạng thái lưu luôn hiển thị. Xuất/làm việc với Muse sẽ lưu trước. Khi thấy **Lưu thất bại**, khắc phục quyền/dung lượng rồi **Lưu ngay**, không đóng ứng dụng.
- Cấu hình, tên tài khoản và phiên Muse nằm trong thư mục dữ liệu ứng dụng Electron của người dùng Windows, tách khỏi dự án. Xóa tài khoản trong Studio sẽ đóng cửa sổ và xóa dữ liệu phiên đó.
- Không hỗ trợ nhiều tiến trình cùng sửa một dự án. Tác vụ đang chạy bị hủy khi thoát; chưa tự tiếp tục sau sự cố. File đầu ra được tạo tạm rồi thay thế đích sau khi thành công.

## Phát triển từ mã nguồn

Node.js 22 hoặc 24 LTS và npm. Từ thư mục repository:

```powershell
npm ci
npm run desktop
```

Chỉ xem giao diện trong trình duyệt:

```powershell
npm run dev
```

Bản trình duyệt dùng IndexedDB cho metadata/media; không có phiên Muse độc lập, API key hoặc xử lý video native. Nút mở dự án mở lại dự án được lưu gần nhất; dữ liệu có thể mất khi xóa site data. JSON tải xuống chỉ có thông tin, không có media. Dùng desktop để quản lý dự án trên ổ đĩa.

```powershell
npm run build
npm test
npm run dist:win
```

`npm test` có kiểm thử tích hợp media, yêu cầu FFmpeg và FFprobe. `npm run test:ui` yêu cầu Vite đang chạy và Chromium (`CHROMIUM_PATH` có thể đổi đường dẫn; mặc định `/usr/bin/chromium` cho cloud Linux). Hướng dẫn cloud: [docs/CLOUD_SETUP.md](docs/CLOUD_SETUP.md).

Gói ZIP dùng trực tiếp, có thể build trên Linux:

```sh
npx electron-builder --win zip --x64 --config.win.signAndEditExecutable=false
```

Các file đóng gói nằm trong `release/` (gitignored). Build NSIS trên Windows bằng `npm run dist:win`. Muốn phân phối rộng cần kiểm thử Windows thực, ký số và rà soát giấy phép các công cụ/model được đóng gói thêm.

## Tình trạng xác minh

- TypeScript + Vite production build: đạt.
- 23 kiểm thử domain, lưu/mở dự án, đường dẫn, API compatible mock và FFmpeg thực: đạt.
- Kiểm thử UI Chromium: tạo dự án, nhập kịch bản, gán/khóa reference, tạo prompt, lưu/mở lại cả ảnh, thêm tên tài khoản và xuất SRT: đạt.
- Desktop Electron trên Linux, giao diện build từ file, IPC, media protocol, phiên tài khoản tách biệt với trang giả lập và xuất FFmpeg: đạt.
- Tự động hóa Muse trên trang giả lập qua Electron: kiểm tra bản nháp, gắn file reference, click gửi, lấy ảnh/video mới, bảo vệ kết quả trước autosave cũ, nhận kịch bản, dừng hàng đợi không gửi lại: đạt.
- Các phần chạy Windows executable trên máy Windows, đăng nhập và tác vụ Muse thực, dịch vụ AI thật, GPU Real-ESRGAN: cần xác minh riêng; không suy ra từ các test trên.

Xem [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) về phạm vi hiện tại và các bước phát triển tiếp.
