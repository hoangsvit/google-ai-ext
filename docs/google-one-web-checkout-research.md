# Google One Web: SKU ẩn, quyền ưu đãi và luồng checkout (nghiên cứu)

Ngày: **23/11/2026**. Phạm vi: **5 file HAR và một file HTML do người dùng cung cấp**, mã nguồn extension đã merge vào \`main\`, tài liệu chính thức của Google. Không có một phiên Google One đăng nhập mới để kiểm thử đầu-cuối. Đây là **báo cáo kỹ thuật và flow trước khi tiếp tục code**, không phải cơ chế đặt mua tự động.

## 1. Kết quả quan trọng: SKU ẩn ĐÃ xuất hiện trong Play Commerce thật

Đối chiếu các yêu cầu \`SubscriptionsManagementUi/data/batchexecute\` trên \`one.google.com\` và \`PlayCommerceAcquireUi/data/batchexecute\` trên \`tokenized.play.google.com\`:

| HAR | Bằng chứng request/response | HTTP của \`PlayCommerceAcquireUi\` |
| --- | --- | --- |
| \`one.google.com.har\` | \`g1.20tb.v2\` ở RPC nội bộ \`bTEHyc\` rồi \`Ngbm\` | 200 |
| \`one.google.com(1).har\` | \`g1.20tb.v2\` | 200 |
| \`one.google.com(2).har\` | \`g1.play.sapphire\` và \`g1.play.2tb.ai.student\` trong các luồng \`Ngbm\` riêng; các dữ liệu ứng viên có ở \`wlBwOd\` | 200, 200 |
| \`one.google.com(3).har\` | \`g1.play.helium.student\` xuất hiện ở \`wlBwOd\`, \`bTEHyc\` và \`Ngbm\` | 200 |
| \`one.google.com(4).har\` | Hai RPC \`SubscriptionsManagementUi\` HTTP 200 nhưng **không chứa SKU** | Không có |

Mẫu luồng quan sát được cho \`g1.play.helium.student\`:

\`\`\`text
one.google.com / SubscriptionsManagementUi   RPC wlBwOd
    ↓ trả dữ liệu sản phẩm / ứng viên ưu đãi
one.google.com / SubscriptionsManagementUi   RPC bTEHyc
    ↓ phản hồi HTTP 200 (chưa xác nhận eligibility)
tokenized.play.google.com / PlayCommerceAcquireUi   RPC Ngbm
    ↓ phản hồi HTTP 200, có SKU trong dữ liệu Commerce
[HAR không ghi nhận một giao dịch thanh toán hoàn tất]
\`\`\`

Các mã \`wlBwOd\`, \`bTEHyc\`, \`Ngbm\` là **RPC nội bộ**, không phải tên API công khai hoặc endpoint có thể tin cậy để dựng giao dịch mới. HAR chứng minh SKU tham khảo đã từng được sử dụng để **khởi tạo luồng Commerce**, không chứng minh một tài khoản khác có thể yêu cầu cùng SKU hoặc gói đã được mua.

**Thay đổi quyết định thiết kế:** “SKU không có nút CTA trên bảng giá thông thường → không có checkout” là kết luận **sai**. Tuy nhiên, “đã thấy SKU trong HAR cũ → hiện đủ điều kiện mua” cũng **sai**.

## 2. Có API công khai để gửi tùy ý SKU ẩn từ extension không?

**Chưa tìm thấy API public dành cho người dùng Google One Web hoặc Chrome extension** với hợp đồng ổn định kiểu \`productId → eligibility / checkout\`. Điều tìm được là các RPC nội bộ trong HAR và các API có phạm vi khác:

- **Google Play Billing Library**: API dành cho app Android. \`queryProductDetailsAsync\` trả về những offer **đủ điều kiện cho người dùng**; để \`launchBillingFlow\` phải có \`ProductDetails\` và đúng \`offerToken\`. Google cảnh báo kết quả cache cũ có thể làm purchase thất bại. Không được coi đây là API Google One Web.
- **Payments Reseller Subscription API**: cung cấp quản lý subscription/intent cho **đối tác bán lại được Google cấp quyền**, không phải cho tài khoản Google One thông thường. \`partners.userSessions.generate\` yêu cầu danh tính partner và tạo user session có hạn; không thay được bằng SKU từ HAR.
- **\`partners.promotions.findEligible\`**: trang tham khảo chính thức ghi **“Currently, it is only enabled for YouTube.”** Không thể dùng API này để kiểm tra ưu đãi Google One.

Nguồn chính thức (truy cập ngày 23/11/2026):
- https://developer.android.com/google/play/billing/integrate
- https://developers.google.com/payments/reseller/subscription/reference/rest
- https://developers.google.com/payments/reseller/subscription/reference/rest/v1/partners.promotions/findEligible
- https://developers.google.com/payments/reseller/subscription/reference/rest/v1/partners.userSessions/generate
- https://developers.google.com/payments/reseller/subscription/reference/index/User.Signup.Integration/Partner.Managed.Signup.With.OAuth.Consent

**Kết luận:** Có **bằng chứng một đường khởi tạo Commerce nội bộ** cho SKU ẩn, nhưng hiện **chưa có hợp đồng API công khai** hay phương thức được xác minh để gửi **SKU bất kỳ** từ Chrome extension. Không triển khai replay POST \`f.req\` hay giả lập điều kiện ưu đãi.

## 3. Các thành phần request cần phân biệt

Trong HAR có các trường sản phẩm đã quan sát: \`productId\`, \`basePlanId\`, \`subscriptionOfferDetails\`, \`pricingPhases\`, \`offerId\` (khi tồn tại), giá/chu kỳ và **\`skuDetailsToken\`, \`offerIdToken\`** ở một số request \`SubscriptionsManagementUi\`. Lớp mạng còn phụ thuộc trạng thái phiên, cookie và các tham số nội bộ. **Không biết chính xác từng trường nào bắt buộc ở mọi RPC, token nào chỉ dùng một lần, hoặc có điều kiện CSRF/nonce phụ trợ hay không.**

Có thể đọc metadata an toàn để chẩn đoán, nhưng không được: đưa token lên GitHub; replay token của HAR cũ; lắp ghép thông tin phiên khác; thay SKU rồi xem đó là yêu cầu thanh toán hợp lệ.

Một khác biệt giá quan trọng: trong HAR (2), \`g1.play.2tb.ai.student\` có **hai base plan riêng biệt** (\`monthly\` 489.000 ₫ và \`monthly-transit\` 122.000 ₫). Sự tồn tại của hai giá không chứng minh phiên hiện tại được mua base plan thấp hơn.

## 4. Phản hồi chứng minh được điều gì?

| Tín hiệu | Kết luận được phép đưa ra | KHÔNG thể kết luận |
| --- | --- | --- |
| SKU trong HTML/HAR | SKU từng được quan sát | Tài khoản đủ điều kiện |
| RPC của Google trả HTTP 200 | Request được máy chủ phản hồi ở tầng HTTP | Offer được chấp nhận, mua thành công |
| Response Play Commerce chứa SKU | Luồng Commerce có dữ liệu SKU đó | Checkout chắc chắn hiện hay giá cuối đã duyệt |
| Checkout Google **thực sự hiển thị** đúng SKU, giá, điều kiện | Giao diện xem xét giao dịch đã mở | Giao dịch đã hoàn thành |
| UI Google trả thông báo **không đủ điều kiện** | Có bằng chứng từ chối trong phiên đó | Mọi tài khoản đều bị từ chối |
| Google xác nhận hoàn tất và trạng thái subscription xuất hiện | Có bằng chứng mua thành công | Không nên suy ra chỉ từ mã RPC |

Một \`batchexecute\` HTTP 200 có thể mang lỗi ứng dụng trong body. Phải dựa vào **thông điệp có cấu trúc được xác minh hoặc trạng thái UI của Google**, không chỉ HTTP hay sự trùng thời gian với click.

## 5. Flow đúng để duyệt trước khi code tiếp

\`\`\`mermaid
flowchart TD
    A["Google One: quan sát HTML / request / offer"] --> B["Chọn SKU: live hoặc lịch sử"]
    B --> C{"Google có cung cấp một luồng hợp lệ cho SKU đó trong phiên hiện tại?"}
    C -->|Đã xác minh| D["Người dùng tự kích hoạt luồng checkout chính thức"]
    C -->|Chưa biết| E["Nghiên cứu thụ động / ghi nhận metadata"]
    E --> F["Chưa xác minh: KHÔNG gửi request thanh toán tự tạo"]
    D --> G["Quan sát RPC và giao diện Google Play Commerce"]
    G --> H{"Kết quả từ Google?"}
    H -->|Hiển thị đúng SKU, giá, điều kiện| I["Checkout đã mở: CHƯA mua"]
    H -->|Google báo không đủ điều kiện| J["Không đủ điều kiện ở phiên này"]
    H -->|Không đủ bằng chứng| K["Không xác định: lưu trạng thái / lỗi"]
\`\`\`

### UI tối thiểu đề xuất (chưa code)

- Hai nhóm **SKU có bằng chứng Commerce trong HAR/phiên** và **SKU chỉ có trong catalog tham khảo**, không mặc định mọi SKU có thể đặt mua.
- Mỗi SKU hiển thị \`productId\`, \`basePlanId\`, giá quan sát, **nguồn**, lần cuối phát hiện và **mức bằng chứng**.
- Một hành động **Xem trạng thái/Thử luồng hợp lệ** chỉ bật khi có phương thức được Google cung cấp hoặc xác minh; nếu thiếu phải báo **"Chưa có phương thức gửi hợp lệ"**, không tạo POST giả và không gọi đó là Google từ chối.
- Kết quả thể hiện tách rời: **RPC trả HTTP**, **SKU đúng trong Commerce**, **checkout UI thực sự hiển thị**, **giao dịch hoàn thành**.
- Không thu thập/dump cookie, token hay dữ liệu thanh toán vào log.

## 6. Tiêu chí quyết định giai đoạn code tiếp theo

1. **Phải xác minh được** cách một phiên Google One hiện tại có thể chọn SKU ẩn *qua cơ chế do Google cung cấp* (đường ưu đãi chính thức, giao diện được bật cho tài khoản, hay luồng hợp tác được cấp quyền).
2. **Phải kiểm chứng riêng** thông tin checkout/UI đúng SKU và giá trước khi gọi một thao tác "thử" là có kết quả.
3. **Phải có mẫu kết quả từ chối/đủ điều kiện rõ nghĩa**; không suy ra từ HTTP 200/403.
4. Chưa có một điều trên thì phần liên quan giữ trạng thái **research-only**, không dùng API nội bộ như hợp đồng công khai.

**Kết luận hiện tại:** HAR cho thấy Google từng khởi tạo Commerce với SKU ẩn. Nhưng chưa xác minh được một phương thức gửi SKU ẩn *tùy ý* một cách hợp lệ từ extension. **PR #1 đã merge không được coi là đã hoàn thành tính năng này.**
