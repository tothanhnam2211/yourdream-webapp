(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.YourdreamErrorScaffolding = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ERROR_TYPE_IDS = [
    'COPYING_ERROR',
    'SIGN_ERROR',
    'ARITHMETIC_ERROR',
    'METHOD_GAP',
    'DIAGRAM_ERROR',
  ];

  const ORIGIN_LAYERS = {
    INPUT_DATA_AND_SETUP: {
      code: 'INPUT_DATA_AND_SETUP',
      label_vi: 'Tầng 1 · Dữ liệu đầu vào & Dựng hình/Ký hiệu ban đầu',
      description_vi:
        'Lỗi phát sinh ngay khi đọc đề, chép biểu thức, tóm tắt số liệu hoặc vẽ hình/đặt ký hiệu trước khi lập luận.',
    },
    REASONING_AND_METHOD: {
      code: 'REASONING_AND_METHOD',
      label_vi: 'Tầng 2 · Chọn phương pháp & Lập luận biến đổi dấu/chiều',
      description_vi:
        'Lỗi phát sinh khi chọn cách tiếp cận, đặt điều kiện xác định, chuyển vế, phá ngoặc âm hoặc đổi chiều bất phương trình.',
    },
    COMPUTATION_AND_EVALUATION: {
      code: 'COMPUTATION_AND_EVALUATION',
      label_vi: 'Tầng 3 · Tính toán số học, Rút gọn & Thay số',
      description_vi:
        'Lỗi phát sinh ở bước thực hiện phép tính cộng/trừ/nhân/chia, khai triển hằng đẳng thức hoặc thay số tính giá trị.',
    },
  };

  // Priority order when resolving multiple errors at the same step:
  // Input/Setup errors (COPYING_ERROR, DIAGRAM_ERROR) -> Method/Reasoning (METHOD_GAP, SIGN_ERROR) -> Computation (ARITHMETIC_ERROR)
  const CORE_ERROR_TYPES = {
    COPYING_ERROR: {
      error_type: 'COPYING_ERROR',
      code_number: 1,
      priority_rank: 1,
      origin_layer: 'INPUT_DATA_AND_SETUP',
      origin_label_vi: ORIGIN_LAYERS.INPUT_DATA_AND_SETUP.label_vi,
      label_vi: 'COPYING_ERROR — Chép lại đề hoặc biểu thức sai',
      short_label_vi: 'Chép sai đề / biểu thức',
      detection_question:
        'Em hãy đặt ngón tay đối chiếu từng hệ số, dấu phép toán (+, −) và số liệu giữa đề bài gốc với dòng đầu tiên em vừa viết: có số hạng, dấu ngoặc hoặc dữ kiện nào bị chép lệch, hoán đổi vị trí hoặc bỏ sót không?',
      hints: [
        'Mức 1 (Đối chiếu từng cụm): Đọc chậm đề bài gốc và gạch chân từng cặp số liệu đi liền với ẩn (hoặc từng phân thức) trước khi viết dòng biến đổi đầu tiên.',
        'Mức 2 (Soát dấu nối & dấu ngoặc): Kiểm tra dấu nối giữa các phân thức/hạng tử và đảm bảo khi thế một đa thức vào vị trí của ẩn thì phải có dấu ngoặc đơn bao quanh.',
        'Mức 3 (Khóa dòng đầu vào): Viết lại nguyên vẹn biểu thức hoặc tóm tắt dữ kiện gốc từ đề bài, dò ngược từ phải sang trái rồi mới thực hiện phép biến đổi ở dòng kế tiếp.',
      ],
      self_correction_activity:
        'Đối chiếu từng ký tự giữa đề bài gốc và dòng mở đầu của bước hiện tại, khoanh tròn hệ số/dấu bị chép lệch hoặc thiếu ngoặc rồi chọn/nhập lại biểu thức khớp 100% với đề.',
      model_correction:
        'Luôn viết dòng đầu vào khớp nguyên vẹn với giả thiết đề bài (bọc ngoặc đơn khi thế biểu thức như x + 3(2x - 5) = 6; giữ đúng hệ số từng loại vé 2x + 3y = 290 và cộng đủ chi phí cố định).',
      exam_prevention_rule:
        'Quy tắc 5 giây đầu bài: Sau khi chép đề hoặc lập phương trình đầu tiên, dừng bút 5 giây dò ngược từ phải sang trái từng con số và dấu trước khi giải tiếp.',
    },
    SIGN_ERROR: {
      error_type: 'SIGN_ERROR',
      code_number: 2,
      priority_rank: 4,
      origin_layer: 'REASONING_AND_METHOD',
      origin_label_vi: ORIGIN_LAYERS.REASONING_AND_METHOD.label_vi,
      label_vi: 'SIGN_ERROR — Sai dấu, chuyển vế, phân phối dấu âm',
      short_label_vi: 'Sai dấu / chuyển vế / chia số âm',
      detection_question:
        'Khi chuyển một hạng tử qua dấu "=", phá dấu ngoặc có dấu "−" đằng trước, hoặc chia hai vế bất phương trình cho một số âm, em đã đổi dấu toàn bộ các hạng tử bên trong (hoặc đổi chiều bất phương trình) chưa?',
      hints: [
        'Mức 1 (Khoanh tròn dấu âm): Mọi tử thức hoặc cụm đa thức đứng sau dấu "−" đều phải được đặt trong ngoặc tròn (...) trước khi phá ngoặc.',
        'Mức 2 (Quy tắc chuyển vế & chia số âm): Chuyển vế qua "=", ">", "<" phải đổi dấu hạng tử; khi chia hai vế bất phương trình cho hệ số âm (như −5 < 0 hoặc −7 < 0) thì bắt buộc phải đổi chiều bất phương trình.',
        'Mức 3 (Kiểm tra từng hạng tử sau phá ngoặc): Với −k(A − B) = −kA + kB, kiểm tra riêng dấu của hạng tử thứ hai (+kB) xem đã đổi từ "−" sang "+" chưa.',
      ],
      self_correction_activity:
        'Viết lại bước trung gian có dấu ngoặc tròn sau dấu "−" (hoặc đánh dấu mũi tên đổi chiều khi chia cho số âm), tự đổi dấu từng hạng tử rồi kiểm tra lại bước hiện tại.',
      model_correction:
        'Giữ bước trung gian có ngoặc: (x + 1) - (3x - 5) = x + 1 - 3x + 5 = -2x + 6; và khi giải -5x > -7, chia hai vế cho (-5) < 0 phải đổi chiều thành x < 7/5.',
      exam_prevention_rule:
        'Quy tắc Đèn đỏ Dấu trừ: Thấy dấu "−" trước phân thức, trước ngoặc hoặc trước hệ số của ẩn trong bất phương trình → khoanh tròn dấu "−" ngay trên giấy nháp trước khi biến đổi.',
    },
    ARITHMETIC_ERROR: {
      error_type: 'ARITHMETIC_ERROR',
      code_number: 3,
      priority_rank: 5,
      origin_layer: 'COMPUTATION_AND_EVALUATION',
      origin_label_vi: ORIGIN_LAYERS.COMPUTATION_AND_EVALUATION.label_vi,
      label_vi: 'ARITHMETIC_ERROR — Sai phép tính, rút gọn, thay số',
      short_label_vi: 'Sai phép tính / rút gọn / thay số',
      detection_question:
        'Phương pháp và quy tắc dấu của em đã đúng hướng; em hãy kiểm tra lại phép nhân phân phối, hệ số 2ab trong hằng đẳng thức hoặc phép cộng/trừ/rút gọn phân số ở bước này xem có bị nhẩm lệch không?',
      hints: [
        'Mức 1 (Tách bước tính nháp): Viết riêng phép cộng/trừ hệ số hoặc quy đồng phân số ra giấy nháp thay vì tính nhẩm gộp hai bước.',
        'Mức 2 (Kiểm tra hằng đẳng thức & ước chung): Với (a ± b)² = a² ± 2ab + b², kiểm tra kỹ hệ số 2ab; với phân số, chia cả tử và mẫu cho ước chung lớn nhất.',
        'Mức 3 (Thế ngược kiểm nghiệm): Thay nghiệm (x; y) hoặc giá trị vừa tính được ngược lại vào phương trình đầu bước để đối chiếu vế trái và vế phải.',
      ],
      self_correction_activity:
        'Tính lại từng phép cộng/trừ/nhân/chia trên nháp, rút gọn về phân số tối giản và thế ngược vào biểu thức đầu bước trước khi nhập lại đáp số.',
      model_correction:
        'Thực hiện tách bạch từng phép tính số học, giữ kết quả dưới dạng số nguyên hoặc phân số tối giản (ví dụ: 9/2, 3/5, 24/5, 18/5) và luôn thế ngược nghiệm vào đề gốc.',
      exam_prevention_rule:
        'Quy tắc Thế ngược 10 giây: Mọi nghiệm phương trình/hệ phương trình hoặc giá trị rút gọn tìm được đều phải thay nhẩm lại vào biểu thức đầu bước trước khi sang bước tiếp theo.',
    },
    METHOD_GAP: {
      error_type: 'METHOD_GAP',
      code_number: 4,
      priority_rank: 3,
      origin_layer: 'REASONING_AND_METHOD',
      origin_label_vi: ORIGIN_LAYERS.REASONING_AND_METHOD.label_vi,
      label_vi: 'METHOD_GAP — Không biết bắt đầu hoặc chọn phương pháp',
      short_label_vi: 'Thiếu hướng bắt đầu / sai phương pháp',
      detection_question:
        'Ở bước này, dạng toán chuẩn là gì (đặt nhân tử chung A·B = 0, tìm ĐKXĐ mẫu khác 0 trước khi khử mẫu, lập bất phương trình theo giới hạn tối đa ≤, hay biến đổi tương đương) và điều kiện nào của ẩn phải được bảo toàn?',
      hints: [
        'Mức 1 (Nhận diện cấu trúc biểu thức): Quan sát xem biểu thức có nhân tử chung, có ẩn ở mẫu số, hay có cụm từ khóa ràng buộc ("không vượt quá", "tối đa", "ĐKXĐ") không.',
        'Mức 2 (Chọn phép biến đổi bảo toàn tập nghiệm): Không chia hai vế cho nhân tử chứa ẩn (sẽ làm mất nghiệm); với phương trình chứa ẩn ở mẫu, phải đặt ĐKXĐ cho mẫu thức khác 0 trước khi quy đồng.',
        'Mức 3 (Đối chiếu điều kiện cuối bước): Sau khi giải ra giá trị của ẩn, bắt buộc đối chiếu với ĐKXĐ hoặc điều kiện thực tế (x ∈ N*, a + b ≤ 1) trước khi kết luận.',
      ],
      self_correction_activity:
        'Xem lại nhánh phương pháp của bước hiện tại trên Sơ đồ tư duy, chọn đúng quy tắc giải (đặt nhân tử chung / khóa ĐKXĐ mẫu ≠ 0 / chọn đúng dấu ≤) rồi thực hiện lại bước giải.',
      model_correction:
        'Xác định đúng phương pháp trước khi tính: đưa về phương trình tích A(x)·B(x) = 0 thay vì rút gọn nhân tử chứa ẩn; đặt ĐKXĐ mẫu khác 0 và đối chiếu loại nghiệm ngoại lai.',
      exam_prevention_rule:
        'Quy tắc Khóa phương pháp: Trước khi tính toán, viết 1 dòng nhận diện phương pháp ("ĐKXĐ mẫu ≠ 0", "Đưa về A·B = 0", "Không vượt quá ⇒ ≤") ở đầu câu.',
    },
    DIAGRAM_ERROR: {
      error_type: 'DIAGRAM_ERROR',
      code_number: 5,
      priority_rank: 2,
      origin_layer: 'INPUT_DATA_AND_SETUP',
      origin_label_vi: ORIGIN_LAYERS.INPUT_DATA_AND_SETUP.label_vi,
      label_vi: 'DIAGRAM_ERROR — Vẽ hình, đặt điểm, ký hiệu hoặc thể hiện quan hệ hình học sai',
      short_label_vi: 'Sai hình vẽ / đặt điểm / ký hiệu hình học',
      detection_question:
        'Trên hình vẽ hoặc sơ đồ quan hệ của em, đỉnh góc vuông, chân đường cao và vị trí cạnh đối – cạnh kề – cạnh huyền (hoặc hình chiếu BH, CH) đối với góc đang xét đã được ký hiệu và sắp thứ tự đỉnh tương ứng đúng chưa?',
      hints: [
        'Mức 1 (Đánh dấu góc vuông & cạnh huyền): Khoanh rõ ký hiệu góc vuông 90° trên hình (tại chân tường, tại đỉnh A và tại chân đường cao H ∈ BC) để xác định ngay cạnh huyền đối diện góc vuông.',
        'Mức 2 (Xác định Đối – Kề – Hình chiếu theo góc): Từ góc đang xét (góc nghiêng α hoặc góc C), cạnh nhìn thẳng sang là Cạnh đối, cạnh sát bên là Cạnh kề; đoạn BH là hình chiếu của AB trên BC.',
        'Mức 3 (Viết thẳng cột 3 đỉnh đồng dạng): Xếp thứ tự đỉnh △HBA ∽ △ABC sao cho góc vuông ứng với góc vuông (H ↔ A), góc chung ứng với góc chung (B ↔ B) rồi mới lập tỉ số cạnh.',
      ],
      self_correction_activity:
        'Hoàn thành bảng "Đối chiếu Giả thiết – Ký hiệu – Hình vẽ trước khi giải", kiểm tra lại vị trí cạnh đối/cạnh kề/cạnh huyền và thứ tự đỉnh tam giác đồng dạng rồi chọn lại đáp án.',
      model_correction:
        'Ký hiệu rõ ∠A = 90°, AH ⊥ BC (H ∈ BC); với góc nghiêng α ở chân thang: cos α = kề/huyền = 2,5/5 = 1/2 ⇒ α = 60°; với △HBA ∽ △ABC (g.g): HB/AB = BA/BC ⇒ AB² = BH·BC.',
      exam_prevention_rule:
        'Quy tắc Hình học 3 chốt: Luôn đánh dấu góc vuông trên hình, ghi tên Cạnh đối / Cạnh kề / Cạnh huyền theo góc cần tính và viết 3 cặp đỉnh đồng dạng thẳng cột trước khi lập tỉ số.',
    },
  };

  const VERIFICATION_BOUNDARY_NOTICE =
    'Giới hạn kiểm định minh bạch: Hệ thống chỉ chẩn đoán lỗi khi có bằng chứng xác định từ lựa chọn gắn mã chẩn đoán (diagnosis_code), kiểm tra giá trị hữu tỉ/đối dấu, nhật ký mở gợi ý (HINT_OPENED) hoặc mục tự kiểm hình học. Hệ thống KHÔNG tự tuyên bố nhận diện lỗi từ văn bản tự luận tự do hay ảnh chụp hình vẽ tay khi chưa có bộ kiểm định phù hợp.';

  // Explicit mapping from every diagnosis_code in Batch 02A & Fixture to one of the 5 core error types
  const DIAGNOSIS_CODE_MAP = {
    // Batch 02A — Bài I (YD-G09-MID1-01:G01)
    C05_ISOLATE_NEGATIVE_Y_SIGN_ERROR: {
      error_type: 'SIGN_ERROR',
      trap_title: 'Bỏ quên dấu trừ trước ẩn y khi rút y từ 2x − y = 5',
      detection_question:
        'Trong phương trình 2x − y = 5, dấu đứng ngay trước y là dấu "+" hay dấu "−"? Nếu −y = 5 − 2x thì khi nhân cả hai vế với (−1), dấu của 5 và −2x đổi thế nào?',
      hints: [
        'Mức 1: Quan sát kỹ phương trình (1): 2x − y = 5, hệ số của y là −1 chứ không phải +1.',
        'Mức 2: Chuyển −y sang vế phải và 5 sang vế trái: 2x − 5 = y.',
        'Mức 3: Thay thế y = 2x − 5 vào x + 3y = 6 phải viết có ngoặc: x + 3(2x − 5) = 6.',
      ],
      self_correction_activity:
        'Viết lại phép chuyển vế 2x − y = 5 ⇔ 2x − 5 = y rồi thế y = (2x − 5) vào phương trình (2).',
      model_correction:
        'Từ 2x − y = 5 ⇒ y = 2x − 5. Thế vào x + 3y = 6 được x + 3(2x − 5) = 6.',
    },
    C05_TRANSPOSE_CONSTANT_SIGN_ERROR: {
      error_type: 'SIGN_ERROR',
      trap_title: 'Chuyển vế hằng số 5 quên đổi dấu thành y = 2x + 5',
      detection_question:
        'Khi chuyển số +5 từ vế phải sang vế trái của 2x − y = 5 để rút y = 2x − 5, dấu của số 5 phải đổi thành gì?',
      hints: [
        'Mức 1: Quy tắc chuyển vế: chuyển một hạng tử từ vế này sang vế kia phải đổi dấu hạng tử đó.',
        'Mức 2: Từ 2x − y = 5, chuyển −y sang phải thành +y và chuyển +5 sang trái thành −5.',
        'Mức 3: Kết quả rút đúng là y = 2x − 5, suy ra x + 3(2x − 5) = 6.',
      ],
      self_correction_activity:
        'Kiểm tra lại bằng cách thay x = 3 vào y = 2x − 5 (được y = 1, thỏa mãn 2·3 − 1 = 5) và chọn lại phương án đúng.',
      model_correction:
        '2x − y = 5 ⇔ y = 2x − 5 ⇒ x + 3(2x − 5) = 6.',
    },
    C05_MISSING_PARENTHESES_ON_SUBSTITUTION: {
      error_type: 'COPYING_ERROR',
      trap_title: 'Chép thiếu dấu ngoặc đơn khi thế đa thức y = 2x − 5 vào 3y',
      detection_question:
        'Trong phương trình x + 3y = 6, hệ số 3 nhân với toàn bộ biểu thức y = (2x − 5) hay chỉ nhân với mỗi số hạng 2x?',
      hints: [
        'Mức 1: Khi thay một ẩn bằng một biểu thức gồm nhiều hạng tử, bắt buộc phải đặt biểu thức đó trong dấu ngoặc đơn (...).',
        'Mức 2: Nếu viết 3·2x − 5 thì số 3 chưa nhân với −5, làm sai lệch phương trình gốc.',
        'Mức 3: Viết đúng là x + 3(2x − 5) = 6 (khi khai triển sẽ là x + 6x − 15 = 6).',
      ],
      self_correction_activity:
        'Thêm cặp dấu ngoặc đơn bao quanh (2x − 5) ngay sau hệ số 3 để được x + 3(2x − 5) = 6.',
      model_correction:
        'Thế y = 2x − 5 vào x + 3y = 6 phải viết x + 3(2x − 5) = 6.',
    },
    C06_NEGATIVE_PAREN_SIGN_ERROR: {
      error_type: 'SIGN_ERROR',
      trap_title: 'Phân phối dấu âm sai khi khai triển −2(y + 3)',
      detection_question:
        'Khi nhân (−2) với từng hạng tử trong ngoặc (y + 3), tích (−2)·(+3) mang dấu cộng hay dấu trừ?',
      hints: [
        'Mức 1: Nhân một số âm với một tổng: −2(y + 3) = (−2)·y + (−2)·3 = −2y − 6.',
        'Mức 2: Đưa −6 sang vế phải của 5x − 2y − 6 = −1: 5x − 2y = −1 + 6 = 5.',
        'Mức 3: Kết hợp với phương trình thứ nhất 2x + 2y = 16 ta được hệ chuẩn {2x + 2y = 16; 5x − 2y = 5}.',
      ],
      self_correction_activity:
        'Khai triển lại −2(y + 3) = −2y − 6, chuyển −6 sang vế phải thành +6 để tính −1 + 6 = 5.',
      model_correction:
        '5x − 2(y + 3) = −1 ⇔ 5x − 2y − 6 = −1 ⇔ 5x − 2y = 5.',
    },
    C06_TRANSPOSE_CONSTANT_EQ1_ERROR: {
      error_type: 'ARITHMETIC_ERROR',
      trap_title: 'Tính nhẩm sai hằng số vế phải khi thu gọn phương trình thứ nhất',
      detection_question:
        'Ở phương trình thứ nhất 2(x + y) − 3 = 13, khi chuyển −3 sang vế phải thì 13 + 3 bằng bao nhiêu?',
      hints: [
        'Mức 1: Khai triển vế trái: 2(x + y) − 3 = 2x + 2y − 3.',
        'Mức 2: Chuyển −3 sang vế phải: 2x + 2y = 13 + 3 = 16 (không phải 13 − 3 = 10).',
        'Mức 3: Hệ phương trình dạng chuẩn là {2x + 2y = 16; 5x − 2y = 5}.',
      ],
      self_correction_activity:
        'Tính lại 13 + 3 = 16 ở vế phải phương trình (1) rồi chọn hệ phương trình chuẩn.',
      model_correction:
        '2(x + y) − 3 = 13 ⇔ 2x + 2y = 16.',
    },
    C06_VARIABLE_Y_SIGN_LOST: {
      error_type: 'COPYING_ERROR',
      trap_title: 'Chép nhầm dấu "−" trước 2(y + 3) thành "+2y" ở phương trình thứ hai',
      detection_question:
        'Đối chiếu đề bài gốc của Ý 2: trước cụm 2(y + 3) trong 5x − 2(y + 3) = −1 là dấu trừ hay dấu cộng?',
      hints: [
        'Mức 1: Đề bài cho 5x − 2(y + 3) = −1, tức là hệ số của y sau khi phá ngoặc phải là −2y.',
        'Mức 2: Nếu chép thành +2y thì khi cộng đại số với 2x + 2y = 16 sẽ không triệt tiêu được ẩn y.',
        'Mức 3: Giữ đúng −2y để được phương trình 5x − 2y = 5.',
      ],
      self_correction_activity:
        'Đối chiếu lại đề gốc 5x − 2(y + 3) = −1, sửa dấu của 2y thành −2y.',
      model_correction:
        'Hệ chuẩn sau khai triển là {2x + 2y = 16; 5x − 2y = 5}.',
    },

    // Batch 02A — Bài II (YD-G09-MID1-01:G02)
    C08_SUBTRACT_BINOMIAL_SIGN_ERROR: {
      error_type: 'SIGN_ERROR',
      trap_title: 'Quên đổi dấu −(3x − 5) khi đặt nhân tử chung (2x − 3)',
      detection_question:
        'Sau khi đặt (2x − 3) làm nhân tử chung, trong ngoặc vuông [(x + 1) − (3x − 5)] khi bỏ ngoặc tròn thì −(−5) đổi thành +5 hay −5?',
      hints: [
        'Mức 1: Đặt nhân tử chung: (2x − 3)[(x + 1) − (3x − 5)] = 0.',
        'Mức 2: Phá ngoặc sau dấu trừ: (x + 1) − 3x + 5 = −2x + 6 (không phải −2x − 4).',
        'Mức 3: Phương trình tích đúng là (2x − 3)(−2x + 6) = 0.',
      ],
      self_correction_activity:
        'Viết bước trung gian [(x + 1) − (3x − 5)] = x + 1 − 3x + 5 = −2x + 6 rồi chọn lại phương trình tích.',
      model_correction:
        '(2x − 3)(x + 1) − (2x − 3)(3x − 5) = 0 ⇔ (2x − 3)(−2x + 6) = 0.',
    },
    C08_ADD_INSTEAD_OF_SUBTRACT_FACTOR: {
      error_type: 'COPYING_ERROR',
      trap_title: 'Chép nhầm phép trừ giữa hai tích thành phép cộng (x + 1) + (3x − 5)',
      detection_question:
        'Giữa hai cụm (2x − 3)(x + 1) và (2x − 3)(3x − 5) trong đề bài là dấu trừ "−" hay dấu cộng "+"?',
      hints: [
        'Mức 1: Đề bài cho phép trừ giữa hai tích: A·B − A·C = A·(B − C).',
        'Mức 2: Nếu cộng (x + 1) + (3x − 5) = 4x − 4 là đã nhìn nhầm dấu "−" thành dấu "+".',
        'Mức 3: Thực hiện phép trừ: (x + 1) − (3x − 5) = −2x + 6.',
      ],
      self_correction_activity:
        'Khoanh tròn dấu "−" giữa hai tích trên đề bài và tính lại (x + 1) − (3x − 5) = −2x + 6.',
      model_correction:
        '(2x − 3)[(x + 1) − (3x − 5)] = (2x − 3)(−2x + 6) = 0.',
    },
    C08_ILLEGAL_DIVISION_BY_VARIABLE_FACTOR: {
      error_type: 'METHOD_GAP',
      trap_title: 'Chia cả hai vế cho nhân tử chứa ẩn (2x − 3) làm mất nghiệm x = 3/2',
      detection_question:
        'Biểu thức (2x − 3) có thể bằng 0 khi x = 3/2 không? Nếu chia cả hai vế cho một biểu thức có thể bằng 0 thì ta sẽ bị mất nghiệm nào?',
      hints: [
        'Mức 1: Không bao giờ chia hai vế của phương trình cho một biểu thức chứa ẩn khi chưa xét trường hợp biểu thức đó bằng 0.',
        'Mức 2: Giữ nguyên vế phải bằng 0 và đặt nhân tử chung (2x − 3) để đưa về phương trình tích A·B = 0.',
        'Mức 3: Khi đó A·B = 0 ⇔ 2x − 3 = 0 hoặc −2x + 6 = 0, bảo toàn đủ cả hai nghiệm x = 3/2 và x = 3.',
      ],
      self_correction_activity:
        'Không gạch bỏ (2x − 3) ở hai vế; hãy đặt (2x − 3) làm nhân tử chung để đưa về (2x − 3)(−2x + 6) = 0.',
      model_correction:
        'Đưa về phương trình tích (2x − 3)(−2x + 6) = 0 ⇔ x = 3/2 hoặc x = 3.',
    },
    C09_SUBTRACT_NUMERATOR_PAREN_SIGN_ERROR: {
      error_type: 'SIGN_ERROR',
      trap_title: 'Quên đổi dấu khi khử mẫu phân thức có dấu trừ −(x − 2)',
      detection_question:
        'Khi quy đồng phân thức −1/x với mẫu chung x(x − 2), tử thức là −(x − 2): sau khi bỏ ngoặc thì −(−2) bằng +2 hay −2?',
      hints: [
        'Mức 1: Phân thức thứ hai có dấu trừ phía trước: −(x − 2)/[x(x − 2)].',
        'Mức 2: Khi khử mẫu, phải viết x(x + 2) − (x − 2) = 2 ⇔ x² + 2x − x + 2 = 2.',
        'Mức 3: Thu gọn hai vế: x² + x = 0.',
      ],
      self_correction_activity:
        'Đặt (x − 2) trong ngoặc sau dấu trừ: x(x + 2) − (x − 2) = 2 rồi khai triển lại.',
      model_correction:
        'ĐKXĐ: x ≠ 0, x ≠ 2. Khử mẫu: x(x + 2) − (x − 2) = 2 ⇔ x² + x = 0.',
    },
    C09_CONFUSE_NUMERATOR_WITH_DENOMINATOR_DOMAIN: {
      error_type: 'METHOD_GAP',
      trap_title: 'Nhầm điều kiện xác định của mẫu thức với tử thức (x + 2 ≠ 0)',
      detection_question:
        'Điều kiện xác định của phân thức A/B yêu cầu tử thức A ≠ 0 hay mẫu thức B ≠ 0?',
      hints: [
        'Mức 1: Phân thức A/B xác định khi và chỉ khi mẫu thức B ≠ 0 (tử thức A có thể bằng 0).',
        'Mức 2: Các mẫu thức trong phương trình là (x − 2), x và x(x − 2).',
        'Mức 3: Do đó ĐKXĐ đúng là x ≠ 0 và x ≠ 2.',
      ],
      self_correction_activity:
        'Chỉ cho các mẫu thức x ≠ 0 và x − 2 ≠ 0, không đặt điều kiện cho tử thức x + 2.',
      model_correction:
        'ĐKXĐ: x ≠ 0 và x ≠ 2; khử mẫu thu gọn được x(x + 2) − (x − 2) = 2 ⇔ x² + x = 0.',
    },
    C09_ADD_INSTEAD_OF_SUBTRACT_FRACTION: {
      error_type: 'COPYING_ERROR',
      trap_title: 'Chép nhầm dấu trừ trước phân thức 1/x thành dấu cộng khi khử mẫu',
      detection_question:
        'Trong đề bài (x + 2)/(x − 2) − 1/x = 2/[x(x − 2)], trước phân thức 1/x là dấu trừ hay dấu cộng?',
      hints: [
        'Mức 1: Đối chiếu lại đề bài: giữa (x + 2)/(x − 2) và 1/x là phép trừ.',
        'Mức 2: Khi quy đồng mẫu chung x(x − 2), tử thức vế trái phải là x(x + 2) − (x − 2).',
        'Mức 3: Khai triển: x² + 2x − x + 2 = 2 ⇔ x² + x = 0.',
      ],
      self_correction_activity:
        'Sửa dấu "+" trước (x − 2) thành dấu "−": x(x + 2) − (x − 2) = 2.',
      model_correction:
        'ĐKXĐ: x ≠ 0, x ≠ 2; phương trình sau khử mẫu là x(x + 2) − (x − 2) = 2 ⇔ x² + x = 0.',
    },
    C11_FORGOT_TO_FLIP_INEQUALITY_SIGN: {
      error_type: 'SIGN_ERROR',
      trap_title: 'Chia hai vế bất phương trình −5x > −7 cho số âm (−5) nhưng quên đổi chiều',
      detection_question:
        'Từ −5x > −7, khi chia cả hai vế cho (−5) là một số âm, chiều của dấu bất phương trình ">" phải giữ nguyên hay đổi thành "<"?',
      hints: [
        'Mức 1: Quy tắc bất đẳng thức: nhân hoặc chia hai vế với cùng một số âm thì phải ĐỔI CHIỀU bất phương trình.',
        'Mức 2: Quy đồng mẫu dương 6: 2(2x + 1) − 3(3x − 2) > 1 ⇔ 4x + 2 − 9x + 6 > 1 ⇔ −5x > −7.',
        'Mức 3: Chia hai vế cho (−5) < 0: x < (−7)/(−5) = 7/5.',
      ],
      self_correction_activity:
        'Khoanh tròn hệ số âm (−5) trong −5x > −7 và đổi chiều dấu ">" thành "<" để được x < 7/5.',
      model_correction:
        '−5x > −7 ⇔ x < 7/5 (đổi chiều vì chia hai vế cho −5 < 0).',
    },
    C11_SUBTRACT_FRACTION_PAREN_SIGN_ERROR: {
      error_type: 'SIGN_ERROR',
      trap_title: 'Quên đổi dấu −3(3x − 2) thành −9x + 6 khi quy đồng bất phương trình',
      detection_question:
        'Khi quy đồng mẫu số 6 cho cụm −(3x − 2)/2, tử thức nhân với −3 là −3(3x − 2): tích (−3)·(−2) bằng +6 hay −6?',
      hints: [
        'Mức 1: Đặt tử thức (3x − 2) trong ngoặc trước khi nhân với −3: 2(2x + 1) − 3(3x − 2) > 1.',
        'Mức 2: Khai triển: 4x + 2 − 9x + 6 > 1 ⇔ −5x + 8 > 1 ⇔ −5x > −7.',
        'Mức 3: Chia cho −5 < 0 được x < 7/5.',
      ],
      self_correction_activity:
        'Viết rõ 2(2x + 1) − 3(3x − 2) > 1, đổi −3·(−2) thành +6 rồi giải lại.',
      model_correction:
        '2(2x + 1) − 3(3x − 2) > 1 ⇔ 4x + 2 − 9x + 6 > 1 ⇔ −5x > −7 ⇔ x < 7/5.',
    },
    C11_BOTH_PAREN_AND_FLIP_ERRORS: {
      error_type: 'SIGN_ERROR',
      trap_title: 'Sai kép cả dấu ngoặc −3(3x − 2) và quên đổi chiều khi chia cho (−5)',
      detection_question:
        'Em hãy kiểm tra lần lượt 2 chốt dấu: (1) −3(3x − 2) đã đổi thành −9x + 6 chưa? (2) Chia −5x > −7 cho (−5) < 0 đã đổi chiều thành x < 7/5 chưa?',
      hints: [
        'Mức 1: Chốt 1 (Phá ngoặc): 2(2x + 1) − 3(3x − 2) = 4x + 2 − 9x + 6 = −5x + 8.',
        'Mức 2: Chuyển vế: −5x > 1 − 8 ⇔ −5x > −7.',
        'Mức 3: Chốt 2 (Chia số âm): Chia hai vế cho (−5) < 0 phải đổi chiều thành x < 7/5.',
      ],
      self_correction_activity:
        'Sửa lần lượt dấu +6 khi phá ngoặc −3(3x − 2) và đổi chiều bất phương trình khi chia cho −5.',
      model_correction:
        '2(2x + 1) − 3(3x − 2) > 1 ⇔ −5x > −7 ⇔ x < 7/5.',
    },

    // Batch 02A — Bài III (YD-G09-MID1-01:G03)
    C07_SWAPPED_COEFFICIENTS_OF_X_AND_Y: {
      error_type: 'COPYING_ERROR',
      trap_title: 'Gắn nhầm hệ số giữa số vé người lớn (x) và số vé học sinh (y)',
      detection_question:
        'Nếu gọi x là giá 1 vé người lớn và y là giá 1 vé học sinh, thì "2 vé người lớn và 3 vé học sinh hết 290 nghìn đồng" phải viết là 2x + 3y = 290 hay 3x + 2y = 290?',
      hints: [
        'Mức 1: Đối chiếu từng cụm từ trong đề: "2 vé người lớn" → 2x; "3 vé học sinh" → 3y.',
        'Mức 2: Đợt 2: "3 vé người lớn và 5 vé học sinh hết 460 nghìn đồng" → 3x + 5y = 460.',
        'Mức 3: Hệ phương trình đúng là {2x + 3y = 290; 3x + 5y = 460} (với x, y > 0).',
      ],
      self_correction_activity:
        'Ghi rõ dưới mỗi con số trong đề: 2 (người lớn → x), 3 (học sinh → y) rồi chọn lại hệ phương trình.',
      model_correction:
        'Gọi giá 1 vé người lớn là x, giá 1 vé học sinh là y (x, y > 0, nghìn đồng) ⇒ {2x + 3y = 290; 3x + 5y = 460}.',
    },
    C07_SWAPPED_TOTAL_AMOUNTS: {
      error_type: 'COPYING_ERROR',
      trap_title: 'Chép nhầm tổng số tiền 290 và 460 giữa hai trường hợp mua vé',
      detection_question:
        'Tổng số tiền 290 nghìn đồng đi với cặp (2 vé người lớn, 3 vé học sinh) hay đi với cặp (3 vé người lớn, 5 vé học sinh)?',
      hints: [
        'Mức 1: Đọc lại câu 1 của Bài III: 2 vé người lớn + 3 vé học sinh = 290 (nghìn đồng).',
        'Mức 2: 3 vé người lớn + 5 vé học sinh = 460 (nghìn đồng).',
        'Mức 3: Không hoán đổi hai vế phải 290 và 460 của hai phương trình.',
      ],
      self_correction_activity:
        'Đối chiếu từng dòng giả thiết với vế phải tương ứng (290 và 460) rồi chọn lại hệ đúng.',
      model_correction:
        '{2x + 3y = 290; 3x + 5y = 460} (x, y > 0).',
    },
    C07_SUBTRACT_INSTEAD_OF_SUM_COST: {
      error_type: 'METHOD_GAP',
      trap_title: 'Dùng phép trừ thay vì phép cộng khi tính tổng số tiền mua hai loại vé',
      detection_question:
        'Khi mua cả hai loại vé (vé người lớn và vé học sinh) hết tổng cộng 290 nghìn đồng, ta phải cộng hay trừ số tiền của hai loại vé?',
      hints: [
        'Mức 1: Tổng chi phí mua vé bằng tiền vé người lớn CỘNG tiền vé học sinh.',
        'Mức 2: Do đó phải lập phương trình 2x + 3y = 290 và 3x + 5y = 460.',
        'Mức 3: Giải hệ này sẽ tìm được y = 50 và x = 70.',
      ],
      self_correction_activity:
        'Đổi phép toán giữa tiền vé người lớn và tiền vé học sinh thành phép cộng (+).',
      model_correction:
        'Tổng tiền mua vé: {2x + 3y = 290; 3x + 5y = 460}.',
    },
    C12_CONFUSE_AT_MOST_WITH_STRICT_LESS: {
      error_type: 'METHOD_GAP',
      trap_title: 'Nhầm cụm từ "không vượt quá 3 550" thành dấu "<" thay vì "≤"',
      detection_question:
        'Cụm từ "tổng kinh phí không vượt quá 3 550 nghìn đồng" có cho phép tổng kinh phí bằng đúng 3 550 nghìn đồng không?',
      hints: [
        'Mức 1: "Không vượt quá M" (hoặc "tối đa M") nghĩa là nhỏ hơn hoặc bằng M (≤ M).',
        'Mức 2: Tổng chi phí gồm: 4 vé giáo viên (4·70 = 280) + n vé học sinh (50n) + tiền thuê xe (1200) = 50n + 1480.',
        'Mức 3: Bất phương trình đúng là 50n + 1480 ≤ 3550.',
      ],
      self_correction_activity:
        'Đổi dấu "<" thành "≤" cho điều kiện "không vượt quá 3 550 nghìn đồng".',
      model_correction:
        'Tổng chi phí: 50n + 4·70 + 1200 ≤ 3550 ⇔ 50n + 1480 ≤ 3550.',
    },
    C12_REVERSED_BUDGET_INEQUALITY_DIRECTION: {
      error_type: 'METHOD_GAP',
      trap_title: 'Đặt ngược chiều bất phương trình giới hạn kinh phí thành "≥ 3550"',
      detection_question:
        'Khi ngân sách tối đa của đoàn chỉ có 3 550 nghìn đồng, tổng số tiền chi ra phải nhỏ hơn hoặc bằng (≤) hay lớn hơn hoặc bằng (≥) 3 550?',
      hints: [
        'Mức 1: Chi phí thực tế không được vượt quá ngân sách cho phép.',
        'Mức 2: Vì vậy vế trái (tổng chi phí 50n + 1480) phải nhỏ hơn hoặc bằng (≤) 3550.',
        'Mức 3: Từ 50n + 1480 ≤ 3550 mới tìm được giá trị lớn nhất của n.',
      ],
      self_correction_activity:
        'Đổi chiều bất phương trình từ ≥ sang ≤ để biểu diễn giới hạn ngân sách tối đa.',
      model_correction:
        '50n + 1480 ≤ 3550 (với n ∈ N*).',
    },
    C12_OMITTED_FIXED_TEACHER_TICKET_COST: {
      error_type: 'COPYING_ERROR',
      trap_title: 'Đọc sót chi phí 4 vé giáo viên (4 × 70 = 280 nghìn đồng) trong đề bài',
      detection_question:
        'Đọc lại đề Ý 2 Bài III: ngoài tiền thuê xe 1 200 nghìn đồng và n vé học sinh, đoàn còn có mấy giáo viên đi cùng (tính theo giá vé người lớn)?',
      hints: [
        'Mức 1: Đề bài nêu rõ: "Đoàn dự kiến gồm 4 giáo viên (tính vé người lớn) và n học sinh, đồng thời thuê xe hết 1 200 nghìn đồng".',
        'Mức 2: Tiền vé của 4 giáo viên là 4 × 70 = 280 (nghìn đồng); cộng với tiền xe 1 200 là 1 480 (nghìn đồng).',
        'Mức 3: Tổng kinh phí là 50n + 1480 ≤ 3550.',
      ],
      self_correction_activity:
        'Cộng thêm khoản 4 × 70 = 280 nghìn đồng tiền vé của 4 giáo viên vào chi phí cố định (1200 + 280 = 1480).',
      model_correction:
        'Chi phí cố định gồm tiền xe và 4 vé giáo viên: 1200 + 4·70 = 1480 ⇒ 50n + 1480 ≤ 3550.',
    },

    // Batch 02A — Bài IV Hình học (YD-G09-MID1-01:G04)
    C14_CONFUSE_ADJACENT_WITH_OPPOSITE_SIDE: {
      error_type: 'DIAGRAM_ERROR',
      trap_title: 'Nhầm cạnh kề mặt đất (2,5 m) thành cạnh đối của góc nghiêng α trên hình vẽ',
      detection_question:
        'Trên hình vẽ tam giác vuông tạo bởi tường, mặt đất và chiếc thang: góc nghiêng α nằm ở chân thang (giữa thang và mặt đất), vậy đoạn mặt đất 2,5 m nằm sát góc α là cạnh kề hay cạnh đối của góc α?',
      hints: [
        'Mức 1: Vẽ tam giác vuông: bức tường thẳng đứng là cạnh đối diện góc α, mặt đất (2,5 m) là cạnh kề góc α, chiều dài thang (5 m) là cạnh huyền.',
        'Mức 2: Biết cạnh kề (2,5 m) và cạnh huyền (5 m), tỉ số lượng giác liên kết Kề và Huyền là cos α = kề / huyền.',
        'Mức 3: cos α = 2,5 / 5 = 1/2 ⇒ α = 60°.',
      ],
      self_correction_activity:
        'Đối chiếu hình vẽ ở mục "Kiểm tra Giả thiết – Ký hiệu – Hình vẽ": ghi nhãn "Cạnh kề = 2,5 m" sát góc α và "Cạnh huyền = 5 m" trên chiếc thang, rồi chọn lại tỉ số cos α.',
      model_correction:
        'Trong tam giác vuông: cos α = (khoảng cách chân thang đến tường) / (chiều dài thang) = 2,5 / 5 = 1/2 ⇒ α = 60°.',
    },
    C14_CONFUSE_HYPOTENUSE_WITH_LEG: {
      error_type: 'DIAGRAM_ERROR',
      trap_title: 'Đặt nhầm chiều dài chiếc thang 5 m thành cạnh góc vuông thay vì cạnh huyền',
      detection_question:
        'Chiếc thang đặt dựa nghiêng vào bức tường vuông góc với mặt đất thì chiếc thang nằm đối diện góc vuông 90° ở chân tường — vậy chiếc thang là cạnh huyền hay cạnh góc vuông?',
      hints: [
        'Mức 1: Góc vuông 90° nằm tại giao điểm của bức tường thẳng đứng và mặt đất phẳng.',
        'Mức 2: Chiếc thang dài 5 m nối đỉnh tường với chân thang trên mặt đất nên là CẠNH HUYỀN (không phải cạnh đối).',
        'Mức 3: Do đó phải dùng cos α = kề / huyền = 2,5 / 5 = 1/2 ⇒ α = 60° (không dùng tan α).',
      ],
      self_correction_activity:
        'Đánh dấu ký hiệu góc vuông tại chân tường trên hình vẽ để thấy rõ chiếc thang 5 m là cạnh huyền, rồi chọn cos α = 2,5/5 = 1/2.',
      model_correction:
        'Thang dài 5 m là cạnh huyền, chân thang cách tường 2,5 m là cạnh kề ⇒ cos α = 2,5/5 = 1/2 ⇒ α = 60°.',
    },
    C13_SPECIAL_ANGLE_COSINE_VALUE_ERROR: {
      error_type: 'ARITHMETIC_ERROR',
      trap_title: 'Tính đúng cos α = 1/2 nhưng tra nhầm số đo góc đặc biệt thành 30° thay vì 60°',
      detection_question:
        'Trong bảng tỉ số lượng giác của các góc đặc biệt (30°, 45°, 60°): góc nhọn α nào có cos α = 1/2 (và góc nào có cos = √3/2)?',
      hints: [
        'Mức 1: Nhớ quy tắc hai góc phụ nhau: cos 60° = sin 30° = 1/2, còn cos 30° = sin 60° = √3/2.',
        'Mức 2: Vì cos α = 2,5 / 5 = 1/2 nên số đo góc α phải bằng 60°.',
        'Mức 3: Kiểm tra lại: khi α = 60°, cạnh kề bằng nửa cạnh huyền (2,5 m = 1/2 · 5 m).',
      ],
      self_correction_activity:
        'Đối chiếu lại bảng giá trị lượng giác góc đặc biệt: cos 60° = 1/2 ⇒ α = 60°.',
      model_correction:
        'cos α = 2,5 / 5 = 1/2 ⇒ α = 60°.',
    },
    C15_CONFUSE_PROJECTION_BH_WITH_CH: {
      error_type: 'DIAGRAM_ERROR',
      trap_title: 'Nhìn nhầm vị trí hai đoạn hình chiếu BH và CH trên cạnh huyền BC',
      detection_question:
        'Trên cạnh huyền BC có đường cao AH (H ∈ BC): đoạn hình chiếu nằm sát đỉnh B và cạnh AB là đoạn BH hay đoạn CH?',
      hints: [
        'Mức 1: Quan sát hình vẽ △ABC vuông tại A, đường cao AH: điểm H chia BC thành BH (kề với AB) và CH (kề với AC).',
        'Mức 2: Xét △HBA và △ABC có ∠B chung và ∠BHA = ∠BAC = 90° ⇒ △HBA ∽ △ABC (g.g).',
        'Mức 3: Lập tỉ số từ đỉnh tương ứng: HB / AB = BA / BC ⇒ AB² = BH · BC (còn AC² = CH · BC).',
      ],
      self_correction_activity:
        'Kiểm tra lại vị trí điểm B, H, C trên hình vẽ và thứ tự đỉnh △HBA ∽ △ABC để suy ra AB² = BH · BC.',
      model_correction:
        '△HBA ∽ △ABC (g.g) ⇒ HB/AB = BA/BC ⇒ AB² = BH · BC.',
    },
    C15_MISMATCHED_HYPOTENUSE_IN_SIMILARITY: {
      error_type: 'DIAGRAM_ERROR',
      trap_title: 'Xếp sai thứ tự đỉnh tương ứng khi lập tỉ số đồng dạng giữa △HBA và △ABC',
      detection_question:
        'Trong △HBA (vuông tại H) và △ABC (vuông tại A), cạnh huyền của △HBA là cạnh nào và cạnh huyền của △ABC là cạnh nào?',
      hints: [
        'Mức 1: Đỉnh góc vuông của △HBA là H (vị trí thứ 1), đỉnh góc vuông của △ABC là A (vị trí thứ 1).',
        'Mức 2: Cạnh huyền của △HBA là BA (vị trí 2–3), cạnh huyền của △ABC là BC (vị trí 2–3).',
        'Mức 3: Tỉ số hai cạnh tương ứng vị trí (1–2) và (2–3) là HB / AB = BA / BC ⇒ AB² = BH · BC.',
      ],
      self_correction_activity:
        'Viết hai tam giác thẳng cột H-B-A và A-B-C, nối cặp đỉnh (1-2) HB ↔ AB và (2-3) BA ↔ BC rồi lập lại tỉ số.',
      model_correction:
        'Xét △HBA và △ABC có ∠BHA = ∠BAC = 90°, ∠B chung ⇒ △HBA ∽ △ABC (g.g) ⇒ AB/BC = BH/AB ⇒ AB² = BH · BC.',
    },
    C15_SWAPPED_HYPOTENUSE_AND_LEG_AC: {
      error_type: 'DIAGRAM_ERROR',
      trap_title: 'Nhầm cạnh góc vuông AC với cạnh huyền BC của tam giác vuông ABC',
      detection_question:
        'Tam giác ABC vuông tại A thì cạnh huyền (đối diện góc vuông A) là cạnh BC hay cạnh AC?',
      hints: [
        'Mức 1: Vì △ABC vuông tại A nên BC là cạnh huyền, còn AB và AC là hai cạnh góc vuông.',
        'Mức 2: Trong △HBA ∽ △ABC, tỉ số cạnh huyền của hai tam giác là BA / BC (không phải BA / AC).',
        'Mức 3: Do đó AB / BC = BH / AB ⇒ AB² = BH · BC.',
      ],
      self_correction_activity:
        'Nhìn lại góc vuông tại A trên hình vẽ để xác định cạnh huyền đối diện là BC, từ đó sửa tỉ số thành AB/BC = BH/AB.',
      model_correction:
        '△HBA ∽ △ABC (g.g) ⇒ AB/BC = BH/AB ⇒ AB² = BH · BC.',
    },

    // Batch 02A — Bài V Bất đẳng thức VDC (YD-G09-MID1-01:G05)
    S07_EXPAND_SQUARE_COEFFICIENT_2AB_ERROR: {
      error_type: 'ARITHMETIC_ERROR',
      trap_title: 'Khai triển hằng đẳng thức (a + b)² thiếu hệ số 2ab nên trừ 4ab bị sai',
      detection_question:
        'Khi khai triển (a + b)² = a² + 2ab + b² rồi trừ đi 4ab ở vế trái, hiệu (a² + 2ab + b²) − 4ab bằng a² − 2ab + b² hay a² − ab + b²?',
      hints: [
        'Mức 1: Nhớ chính xác hằng đẳng thức bình phương của một tổng: (a + b)² = a² + 2ab + b².',
        'Mức 2: Trừ 4ab: a² + 2ab + b² − 4ab = a² − 2ab + b² = (a − b)².',
        'Mức 3: Vì (a − b)² ≥ 0 với mọi a, b > 0 nên bất đẳng thức 1/a + 1/b ≥ 4/(a + b) luôn đúng.',
      ],
      self_correction_activity:
        'Viết đầy đủ (a + b)² − 4ab = (a² + 2ab + b²) − 4ab = a² − 2ab + b² = (a − b)² ≥ 0.',
      model_correction:
        '(a + b)/ab ≥ 4/(a + b) ⇔ (a + b)² ≥ 4ab (vì a, b > 0) ⇔ (a − b)² ≥ 0 (luôn đúng).',
    },
    S07_REVERSED_SQUARE_INEQUALITY: {
      error_type: 'SIGN_ERROR',
      trap_title: 'Chuyển vế hoặc đổi chiều sai dẫn tới (a − b)² ≤ 0',
      detection_question:
        'Từ (a + b)² ≥ 4ab, khi chuyển 4ab từ vế phải sang vế trái thành (a + b)² − 4ab thì dấu bất đẳng thức là "≥ 0" hay "≤ 0"?',
      hints: [
        'Mức 1: Chuyển vế một hạng tử không làm đổi chiều bất đẳng thức: A ≥ B ⇔ A − B ≥ 0.',
        'Mức 2: Do đó (a + b)² ≥ 4ab ⇔ (a + b)² − 4ab ≥ 0 ⇔ (a − b)² ≥ 0.',
        'Mức 3: Bình phương của mọi số thực luôn không âm: (a − b)² ≥ 0 với mọi a, b.',
      ],
      self_correction_activity:
        'Giữ nguyên chiều ≥ khi chuyển 4ab sang vế trái: (a + b)² − 4ab ≥ 0 ⇔ (a − b)² ≥ 0.',
      model_correction:
        '1/a + 1/b ≥ 4/(a + b) ⇔ (a + b)² − 4ab ≥ 0 ⇔ (a − b)² ≥ 0 (luôn đúng với mọi a, b > 0).',
    },
    S07_ILLEGAL_FRACTION_DENOMINATOR_ADDITION: {
      error_type: 'METHOD_GAP',
      trap_title: 'Áp dụng sai quy tắc cộng hai phân thức khác mẫu (cộng mẫu với mẫu)',
      detection_question:
        'Muốn cộng hai phân thức 1/a + 1/b (khác mẫu số), ta phải quy đồng mẫu số chung a·b hay được phép cộng mẫu với mẫu thành 2/(a + b)?',
      hints: [
        'Mức 1: Cộng hai phân thức khác mẫu phải quy đồng về mẫu chung a·b: 1/a + 1/b = (a + b)/(ab).',
        'Mức 2: Vì a, b > 0 nên ab > 0 và a + b > 0; nhân chéo hai vế dương của (a + b)/(ab) ≥ 4/(a + b) được (a + b)² ≥ 4ab.',
        'Mức 3: Thu gọn về (a − b)² ≥ 0 (luôn đúng, dấu "=" xảy ra khi a = b).',
      ],
      self_correction_activity:
        'Quy đồng đúng 1/a + 1/b = (a + b)/(ab) rồi biến đổi tương đương về (a − b)² ≥ 0.',
      model_correction:
        'Với a, b > 0: 1/a + 1/b = (a + b)/(ab) ≥ 4/(a + b) ⇔ (a + b)² ≥ 4ab ⇔ (a − b)² ≥ 0.',
    },

    // EXAM-GRAPH-02 / Fixture diagnosis codes mapping
    CONFUSE_POLYNOMIAL_DENOMINATOR_WITH_RADICAND: { error_type: 'METHOD_GAP' },
    CONFUSE_POLYNOMIAL_DENOMINATOR_WITH_DENOMINATOR_RADICAL: { error_type: 'METHOD_GAP' },
    SET_NONZERO_CONDITION_ON_NUMERATOR: { error_type: 'COPYING_ERROR' },
    OMIT_NONZERO_DENOMINATOR_AT_BOUNDARY: { error_type: 'METHOD_GAP' },
    OMIT_NONNEGATIVE_RADICAND_CONDITION: { error_type: 'METHOD_GAP' },
    REVERSED_RADICAND_SIGN: { error_type: 'SIGN_ERROR' },
    FORGET_FLIP_INEQUALITY_SIGN_ON_NEGATIVE_DIVISION: { error_type: 'SIGN_ERROR' },
    NON_STRICT_INEQUALITY_INCLUDES_ZERO_DENOMINATOR: { error_type: 'METHOD_GAP' },
    SIGN_ERROR_IN_RATIO_OF_NEGATIVES: { error_type: 'SIGN_ERROR' },
    MISCOMPARE_FRACTION_5_7_WITH_1: { error_type: 'ARITHMETIC_ERROR' },
    CONFUSE_DOMAIN_INTERSECTION_WITH_UNION: { error_type: 'METHOD_GAP' },
    RELAX_UPPER_BOUND_5_7_TO_1: { error_type: 'METHOD_GAP' },
    INCLUDE_ZERO_DENOMINATOR_BOUNDARY_5_7: { error_type: 'METHOD_GAP' },
    REVERSED_INEQUALITY_DIRECTION_FINAL: { error_type: 'SIGN_ERROR' },
    DEFAULT_TO_STANDARD_SQRTX_DOMAIN: { error_type: 'COPYING_ERROR' },
    DROP_EXCLUSION_AFTER_CANCELLATION: { error_type: 'METHOD_GAP' },
    OMIT_NONNEGATIVE_RADICAND_X_GE_0: { error_type: 'METHOD_GAP' },
    CONFUSE_SQRTX_EQ_2_WITH_X_EQ_PM2: { error_type: 'ARITHMETIC_ERROR' },
    FORGET_SQUARE_ROOT_OF_CONSTANT_4: { error_type: 'ARITHMETIC_ERROR' },
    REVERSED_ORDER_X_MINUS_4: { error_type: 'SIGN_ERROR' },
    CONFUSE_DIFF_OF_SQUARES_WITH_SQUARE_OF_DIFFERENCE: { error_type: 'METHOD_GAP' },
    SIGN_ERROR_ON_THIRD_FRACTION: { error_type: 'SIGN_ERROR' },
    OMIT_THIRD_NUMERATOR_TERM: { error_type: 'COPYING_ERROR' },
    ARITHMETIC_ERROR_ADDING_CONSTANTS: { error_type: 'ARITHMETIC_ERROR' },
    CANCEL_FACTOR_AT_EXCLUDED_VALUE_X4: { error_type: 'METHOD_GAP' },
    SIGN_REVERSAL_WHEN_FACTORING_2: { error_type: 'SIGN_ERROR' },
    COEFFICIENT_DIVISION_ERROR_FACTORING_4: { error_type: 'ARITHMETIC_ERROR' },
    OMIT_EXCLUDED_POINT_X4_IN_CONCLUSION: { error_type: 'METHOD_GAP' },
    CANCEL_WRONG_DENOMINATOR_FACTOR: { error_type: 'ARITHMETIC_ERROR' },
    UNWARRANTED_NEGATIVE_SIGN_ON_CANCELLATION: { error_type: 'SIGN_ERROR' },
    CONFUSE_X_NE_4_WITH_SQRTX_NE_4: { error_type: 'METHOD_GAP' },
    SKIP_MANDATORY_DOMAIN_CHECK: { error_type: 'METHOD_GAP' },
    INCLUDE_EXCLUDED_VALUE_X4_AS_ROOT: { error_type: 'METHOD_GAP' },
    ALLOW_X_EQ_0_ZERO_DENOMINATOR_IN_B: { error_type: 'METHOD_GAP' },
    OMIT_POSITIVE_X_CONDITION: { error_type: 'METHOD_GAP' },
    CONFUSE_NONZERO_DENOMINATOR_WITH_POSITIVE_DENOMINATOR: { error_type: 'METHOD_GAP' },
    FACTOR_OUT_X_INSTEAD_OF_SQRTX: { error_type: 'ARITHMETIC_ERROR' },
    CONFUSE_X_MINUS_SQRTX_WITH_X_MINUS_1: { error_type: 'COPYING_ERROR' },
    LEAVE_X_INSTEAD_OF_SQRTX_INSIDE_PAREN: { error_type: 'ARITHMETIC_ERROR' },
    FORGET_MULTIPLY_SECOND_NUMERATOR_BY_SQRTX: { error_type: 'ARITHMETIC_ERROR' },
    SIGN_ERROR_PLUS_INSTEAD_OF_MINUS_2SQRTX: { error_type: 'SIGN_ERROR' },
    SIGN_ERROR_ON_CONSTANT_PLUS_1: { error_type: 'SIGN_ERROR' },
    DROP_EXCLUSION_X_NE_1_AFTER_SIMPLIFYING_B: { error_type: 'METHOD_GAP' },
    INVALID_CANCELLATION_OF_SQRTX: { error_type: 'ARITHMETIC_ERROR' },
    INVERT_NUMERATOR_AND_DENOMINATOR_OF_B: { error_type: 'COPYING_ERROR' },
    DROP_EXCLUSION_X_NE_1_IN_PRODUCT_P: { error_type: 'METHOD_GAP' },
    RETAIN_CANCELED_FACTOR_INSTEAD_OF_SQRTX: { error_type: 'ARITHMETIC_ERROR' },
    SPLIT_FRACTION_DIVISION_ERROR: { error_type: 'METHOD_GAP' },
    SUBTRACT_1_WITHOUT_COMMON_DENOMINATOR: { error_type: 'ARITHMETIC_ERROR' },
    SIGN_ERROR_ADDING_SQRTX_INSTEAD_OF_SUBTRACTING: { error_type: 'SIGN_ERROR' },
    CONFUSE_P_MINUS_1_WITH_P_MINUS_2: { error_type: 'COPYING_ERROR' },
    CONFUSE_WITH_SQUARE_OF_SQRTX_MINUS_1: { error_type: 'ARITHMETIC_ERROR' },
    OMIT_CONSTANT_REMAINDER_3_4_IN_COMPLETING_SQUARE: { error_type: 'ARITHMETIC_ERROR' },
    FAIL_TO_COMPLETE_SQUARE_FOR_SIGN_ANALYSIS: { error_type: 'METHOD_GAP' },
    REVERSED_COMPARISON_FROM_POSITIVE_DIFFERENCE: { error_type: 'SIGN_ERROR' },
    EXPAND_CONCLUSION_BEYOND_ORIGINAL_DOMAIN: { error_type: 'METHOD_GAP' },
  };

  // Geometry Pre-Solve Verification Checklist (for geometry exercises like YD-G09-MID1-01:G04)
  const GEOMETRY_PRECHECKS = {
    'YD-G09-MID1-01:G04': {
      item_id: 'YD-G09-MID1-01:G04',
      title: 'Bước đối chiếu Giả thiết – Ký hiệu – Hình vẽ trước khi giải Hình học (Bài IV)',
      notice:
        'Trước khi bấm tính tỉ số lượng giác hoặc chứng minh tam giác đồng dạng, học sinh tự đối chiếu 4 chốt hình học dưới đây trên giấy nháp (Hệ thống không tự chấm ảnh hình vẽ tay):',
      checks: [
        {
          check_id: 'GEO_CHK_01_RIGHT_ANGLES',
          label: 'Chốt 1 (Góc vuông & Cạnh huyền): Đã đánh dấu ký hiệu vuông góc 90° tại chân tường (Ý 1), tại đỉnh A và tại chân đường cao H ∈ BC (Ý 2); xác định đúng thang dài 5 m và cạnh BC là cạnh huyền.',
          prevents_error_type: 'DIAGRAM_ERROR',
        },
        {
          check_id: 'GEO_CHK_02_LADDER_ANGLE',
          label: 'Chốt 2 (Góc nghiêng α của thang): Góc α tạo bởi thang và mặt đất nên đoạn mặt đất 2,5 m là Cạnh kề của α, thang 5 m là Cạnh huyền ⇒ dùng tỉ số cos α = kề/huyền = 2,5/5.',
          prevents_error_type: 'DIAGRAM_ERROR',
        },
        {
          check_id: 'GEO_CHK_03_PROJECTIONS',
          label: 'Chốt 3 (Vị trí điểm H & Hình chiếu): Điểm H nằm trên BC sao cho đoạn BH nằm phía đỉnh B (kề cạnh AB = 6 cm), đoạn CH nằm phía đỉnh C (kề cạnh AC = 8 cm); đối với góc C thì cạnh đối là AB = 6 cm.',
          prevents_error_type: 'DIAGRAM_ERROR',
        },
        {
          check_id: 'GEO_CHK_04_SIMILARITY_ORDER',
          label: 'Chốt 4 (Thứ tự đỉnh đồng dạng): Viết thẳng cột △HBA ∽ △ABC theo đúng cặp góc bằng nhau (∠H = ∠A = 90°, ∠B chung) trước khi suy ra tỉ số HB/AB = BA/BC ⇔ AB² = BH·BC.',
          prevents_error_type: 'DIAGRAM_ERROR',
        },
      ],
    },
  };

  function isGeometryGraph(graph) {
    if (!graph) return false;
    if (GEOMETRY_PRECHECKS[graph.item_id]) return true;
    const txt = `${graph.title || ''} ${graph.prompt || ''} ${graph.subtitle || ''}`;
    return /tam giác|đường cao|vuông tại|tỉ số lượng giác|cos\b|sin\b|tan\b|\\triangle|\\backsim/i.test(txt);
  }

  function getGeometryPrecheck(graph) {
    if (!graph) return null;
    if (GEOMETRY_PRECHECKS[graph.item_id]) return GEOMETRY_PRECHECKS[graph.item_id];
    if (!isGeometryGraph(graph)) return null;
    return {
      item_id: graph.item_id,
      title: 'Bước đối chiếu Giả thiết – Ký hiệu – Hình vẽ trước khi giải Hình học',
      notice:
        'Đối chiếu giả thiết, ký hiệu góc vuông, vị trí các điểm và thứ tự đỉnh tương ứng trên hình vẽ nháp trước khi giải:',
      checks: GEOMETRY_PRECHECKS['YD-G09-MID1-01:G04'].checks,
    };
  }

  function parseRationalNumber(raw) {
    if (typeof raw !== 'string' && typeof raw !== 'number') return null;
    const s = String(raw).trim().replace(/\s+/g, '');
    if (!s) return null;
    if (/^[+-]?\d+$/.test(s)) return Number(s);
    const m = /^([+-]?\d+)\/([+-]?\d+)$/.exec(s);
    if (m) {
      const num = Number(m[1]);
      const den = Number(m[2]);
      if (den === 0) return null;
      return num / den;
    }
    const dec = /^([+-]?\d+)[.,](\d+)$/.exec(s);
    if (dec) return Number(`${dec[1]}.${dec[2]}`);
    return null;
  }

  function classifyCodeOrHeuristic(code, stepObj, rawAnswerJson, resultStatus) {
    if (code && Object.hasOwn(DIAGNOSIS_CODE_MAP, code)) {
      const mapped = DIAGNOSIS_CODE_MAP[code];
      const core = CORE_ERROR_TYPES[mapped.error_type];
      return {
        error_type: core.error_type,
        origin_layer: core.origin_layer,
        origin_label_vi: core.origin_label_vi,
        priority_rank: core.priority_rank,
        label_vi: core.label_vi,
        short_label_vi: core.short_label_vi,
        trap_title: mapped.trap_title || core.label_vi,
        detection_question: mapped.detection_question || core.detection_question,
        hints: mapped.hints || core.hints,
        self_correction_activity: mapped.self_correction_activity || core.self_correction_activity,
        model_correction: mapped.model_correction || core.model_correction,
        exam_prevention_rule: core.exam_prevention_rule,
        evidence_source: 'DETERMINISTIC_DIAGNOSIS_CODE',
      };
    }

    // Heuristic classification by diagnosis_code name pattern if not in explicit table
    if (typeof code === 'string' && code.length > 0) {
      let type = 'METHOD_GAP';
      if (/COPY|SWAP|OMIT_FIXED|OMIT_THIRD|INVERT_NUMERATOR/i.test(code)) type = 'COPYING_ERROR';
      else if (/DIAGRAM|PROJECTION|ADJACENT|HYPOTENUSE|SIMILARITY/i.test(code)) type = 'DIAGRAM_ERROR';
      else if (/SIGN|FLIP|REVERSED|NEGATIVE/i.test(code)) type = 'SIGN_ERROR';
      else if (/ARITHMETIC|COEFFICIENT|SQUARE|MISCOMPARE|COSINE_VALUE/i.test(code)) type = 'ARITHMETIC_ERROR';
      const core = CORE_ERROR_TYPES[type];
      return {
        error_type: core.error_type,
        origin_layer: core.origin_layer,
        origin_label_vi: core.origin_label_vi,
        priority_rank: core.priority_rank,
        label_vi: core.label_vi,
        short_label_vi: core.short_label_vi,
        trap_title: `${core.short_label_vi} (${code})`,
        detection_question: core.detection_question,
        hints: stepObj?.hints?.map((h, i) => `Mức ${i + 1}: ${h.text}`) || core.hints,
        self_correction_activity: core.self_correction_activity,
        model_correction: stepObj ? `${stepObj.before} → ${stepObj.after} (${stepObj.justification})` : core.model_correction,
        exam_prevention_rule: core.exam_prevention_rule,
        evidence_source: 'DIAGNOSIS_CODE_PATTERN',
      };
    }

    // Rational / free numeric input deterministic classification
    if (stepObj && stepObj.interaction && stepObj.interaction.answer_type === 'rational') {
      let submitted = null;
      try {
        submitted = rawAnswerJson ? JSON.parse(rawAnswerJson) : null;
      } catch {
        submitted = rawAnswerJson;
      }
      const subVal = parseRationalNumber(submitted);
      const expVal = parseRationalNumber(stepObj.interaction.expected);

      if (resultStatus === 'NEEDS_REVIEW' || subVal === null) {
        const core = CORE_ERROR_TYPES.COPYING_ERROR;
        return {
          error_type: core.error_type,
          origin_layer: core.origin_layer,
          origin_label_vi: core.origin_label_vi,
          priority_rank: core.priority_rank,
          label_vi: core.label_vi,
          short_label_vi: core.short_label_vi,
          trap_title: `Nhập sai định dạng số hữu tỉ hoặc chép nhầm ký hiệu tại "${stepObj.title}"`,
          detection_question:
            'Em đang nhập cả biểu thức chứa chữ/ký hiệu lạ hay chỉ nhập giá trị số nguyên / phân số tối giản a/b như yêu cầu của bước?',
          hints: stepObj.hints?.map((h, i) => `Mức ${i + 1}: ${h.text}`) || core.hints,
          self_correction_activity:
            'Chỉ nhập giá trị số nguyên hoặc phân số a/b (ví dụ: 3, -1, 9/2, 24/5), không nhập chữ hoặc dấu "=".',
          model_correction: `${stepObj.before} → ${stepObj.after}. Đáp số chuẩn: ${stepObj.interaction.expected}.`,
          exam_prevention_rule: core.exam_prevention_rule,
          evidence_source: 'DETERMINISTIC_RATIONAL_FORMAT_CHECK',
        };
      }

      if (expVal !== null && expVal !== 0 && Math.abs(subVal + expVal) < 1e-9) {
        const core = CORE_ERROR_TYPES.SIGN_ERROR;
        return {
          error_type: core.error_type,
          origin_layer: core.origin_layer,
          origin_label_vi: core.origin_label_vi,
          priority_rank: core.priority_rank,
          label_vi: core.label_vi,
          short_label_vi: core.short_label_vi,
          trap_title: `Đáp số trái dấu (${submitted} thay vì ${stepObj.interaction.expected}) tại "${stepObj.title}"`,
          detection_question:
            'Giá trị tuyệt đối của em đã đúng nhưng bị ngược dấu (+/−): em hãy kiểm tra lại bước chuyển vế hoặc trừ hai số ở bước này xem dấu âm bị lệch ở đâu?',
          hints: stepObj.hints?.map((h, i) => `Mức ${i + 1}: ${h.text}`) || core.hints,
          self_correction_activity:
            'Kiểm tra lại dấu của từng hạng tử khi chuyển vế hoặc tính hiệu (ví dụ x − y), sửa lại dấu của kết quả rồi nộp lại.',
          model_correction: `${stepObj.before} → ${stepObj.after} (${stepObj.justification}). Đáp số đúng: ${stepObj.interaction.expected}.`,
          exam_prevention_rule: core.exam_prevention_rule,
          evidence_source: 'DETERMINISTIC_OPPOSITE_SIGN_CHECK',
        };
      }

      const core = CORE_ERROR_TYPES.ARITHMETIC_ERROR;
      return {
        error_type: core.error_type,
        origin_layer: core.origin_layer,
        origin_label_vi: core.origin_label_vi,
        priority_rank: core.priority_rank,
        label_vi: core.label_vi,
        short_label_vi: core.short_label_vi,
        trap_title: `Sai phép tính số học / thay số tại "${stepObj.title}"`,
        detection_question:
          `Kết quả em vừa tính (${submitted}) chưa khớp với phép biến đổi "${stepObj.before}". Em đã thay đúng giá trị từ bước trước và rút gọn phân số chính xác chưa?`,
        hints: stepObj.hints?.map((h, i) => `Mức ${i + 1}: ${h.text}`) || core.hints,
        self_correction_activity:
          'Tính lại phép thế số / cộng trừ nhân chia trên giấy nháp, thử lại vào phương trình đầu bước và nhập lại kết quả.',
        model_correction: `${stepObj.before} → ${stepObj.after} (${stepObj.justification}). Đáp số đúng: ${stepObj.interaction.expected}.`,
        exam_prevention_rule: core.exam_prevention_rule,
        evidence_source: 'DETERMINISTIC_RATIONAL_VALUE_CHECK',
      };
    }

    const fallback = CORE_ERROR_TYPES.METHOD_GAP;
    return {
      error_type: fallback.error_type,
      origin_layer: fallback.origin_layer,
      origin_label_vi: fallback.origin_label_vi,
      priority_rank: fallback.priority_rank,
      label_vi: fallback.label_vi,
      short_label_vi: fallback.short_label_vi,
      trap_title: stepObj ? `Cần rà soát phương pháp tại "${stepObj.title}"` : fallback.label_vi,
      detection_question: fallback.detection_question,
      hints: stepObj?.hints?.map((h, i) => `Mức ${i + 1}: ${h.text}`) || fallback.hints,
      self_correction_activity: fallback.self_correction_activity,
      model_correction: stepObj ? `${stepObj.before} → ${stepObj.after}` : fallback.model_correction,
      exam_prevention_rule: fallback.exam_prevention_rule,
      evidence_source: 'STEP_INTERACTION_EVIDENCE',
    };
  }

  // Build per-exercise 5-error-type trap library so EVERY exercise has all 5 core error types linked to its steps
  function getExerciseTrapLibrary(data, itemId) {
    if (!data || !Array.isArray(data.graphs)) return [];
    const g = data.graphs.find((x) => x.item_id === itemId) || data.graphs[0];
    if (!g) return [];
    const steps = g.step_ids.map((sid) => data.steps.find((s) => s.step_id === sid)).filter(Boolean);
    const firstStep = steps[0] || null;
    const lastStep = steps[steps.length - 1] || firstStep;

    // Collect actual traps from choice steps in this exercise
    const byType = new Map();
    for (const s of steps) {
      if (s.interaction?.answer_type === 'choice' && s.feedback?.by_choice) {
        for (const [, fb] of Object.entries(s.feedback.by_choice)) {
          if (fb.expected_status !== 'CORRECT' && fb.diagnosis_code) {
            const info = classifyCodeOrHeuristic(fb.diagnosis_code, s, null, 'TRY_AGAIN');
            if (!byType.has(info.error_type)) {
              byType.set(info.error_type, {
                ...info,
                linked_step_id: s.step_id,
                linked_step_title: s.title,
                diagnosis_code: fb.diagnosis_code,
              });
            }
          }
        }
      }
    }

    // Fill any remaining of the 5 core error types with contextualized entries tied to concrete steps of this exercise
    const rationalStep = steps.find((s) => s.interaction?.answer_type === 'rational') || lastStep;
    const isGeo = isGeometryGraph(g);

    return ERROR_TYPE_IDS.map((typeId) => {
      if (byType.has(typeId)) return byType.get(typeId);
      const core = CORE_ERROR_TYPES[typeId];
      let targetStep = firstStep;
      let customTitle = `${core.short_label_vi} trong ${g.title.slice(0, 55)}`;
      let customModel = firstStep
        ? `${firstStep.before} → ${firstStep.after} (${firstStep.justification})`
        : core.model_correction;

      if (typeId === 'ARITHMETIC_ERROR' && rationalStep) {
        targetStep = rationalStep;
        customTitle = `Sai phép tính / rút gọn / thay số tại "${rationalStep.title}"`;
        customModel = `${rationalStep.before} → ${rationalStep.after}. Đáp số chuẩn: ${rationalStep.interaction.expected}.`;
      } else if (typeId === 'SIGN_ERROR') {
        targetStep = steps.find((s) => /dấu|trừ|ngoặc|bất phương trình|hiệu/i.test(s.title)) || rationalStep || firstStep;
        customTitle = `Bẫy sai dấu khi chuyển vế / phá ngoặc tại "${targetStep.title}"`;
        customModel = `${targetStep.before} → ${targetStep.after} (${targetStep.justification})`;
      } else if (typeId === 'METHOD_GAP') {
        targetStep = firstStep;
        customTitle = `Chưa chọn đúng phương pháp mở đầu tại "${targetStep.title}"`;
        customModel = `${targetStep.before} → ${targetStep.after} (${targetStep.justification})`;
      } else if (typeId === 'COPYING_ERROR') {
        targetStep = firstStep;
        customTitle = `Chép lệch hệ số / dấu hoặc thiếu ngoặc từ đề gốc tại "${targetStep.title}"`;
        customModel = `Đối chiếu đề gốc: ${g.subtitle}. Bước đầu chuẩn: ${targetStep.before} → ${targetStep.after}.`;
      } else if (typeId === 'DIAGRAM_ERROR') {
        targetStep = isGeo ? firstStep : lastStep;
        customTitle = isGeo
          ? `Xác định sai góc vuông, cạnh đối/kề/huyền hoặc thứ tự đỉnh đồng dạng tại "${targetStep.title}"`
          : `Biểu diễn sai sơ đồ bước / trục xét điều kiện hoặc ký hiệu tập hợp tại "${targetStep.title}"`;
        customModel = isGeo
          ? `${targetStep.before} → ${targetStep.after} (${targetStep.justification})`
          : `Biểu diễn đúng miền điều kiện (${g.subtitle}) và thứ tự mũi tên nhân quả: ${targetStep.before} → ${targetStep.after}.`;
      }

      return {
        error_type: core.error_type,
        origin_layer: core.origin_layer,
        origin_label_vi: core.origin_label_vi,
        priority_rank: core.priority_rank,
        label_vi: core.label_vi,
        short_label_vi: core.short_label_vi,
        trap_title: customTitle,
        linked_step_id: targetStep ? targetStep.step_id : null,
        linked_step_title: targetStep ? targetStep.title : '',
        diagnosis_code: null,
        detection_question: core.detection_question,
        hints: targetStep?.hints?.map((h, i) => `Mức ${i + 1}: ${h.text}`) || core.hints,
        self_correction_activity: core.self_correction_activity,
        model_correction: customModel,
        exam_prevention_rule: core.exam_prevention_rule,
      };
    });
  }

  // Diagnose all active student errors from journal evidence and prioritize the earliest step with evidence
  // Returns full list of concurrent errors + a SINGLE active_remediation_task per turn.
  function diagnoseStudentErrors(data, journal, completedSet, currentItemId = null) {
    if (!data || !journal || !Array.isArray(data.graphs)) {
      return {
        verification_boundary_notice: VERIFICATION_BOUNDARY_NOTICE,
        detected_errors: [],
        total_active_errors: 0,
        queued_errors_count: 0,
        active_remediation_task: null,
        by_step_id: Object.create(null),
      };
    }
    const done = completedSet instanceof Set ? completedSet : new Set(completedSet || []);
    const detected = [];
    const byStepId = Object.create(null);

    data.graphs.forEach((g, graphIndex) => {
      const resetIdx = journal.events.findLastIndex((e) => e.item_id === g.item_id && e.type === 'ITEM_RESET');
      const cycleEvents = journal.events.slice(resetIdx + 1).filter((e) => e.item_id === g.item_id);

      g.step_ids.forEach((stepId, stepOrder) => {
        const s = data.steps.find((x) => x.step_id === stepId);
        if (!s || done.has(stepId)) return;

        const stepEvents = cycleEvents.filter((e) => e.step_id === stepId);
        if (!stepEvents.length) return;

        const answers = stepEvents.filter((e) => e.type === 'ANSWER_SUBMITTED');
        const latestAns = answers.at(-1);
        const hintOpened = stepEvents.some((e) => e.type === 'HINT_OPENED');
        const explanationOpened = stepEvents.some((e) => e.type === 'EXPLANATION_OPENED');

        let classified = null;
        if (latestAns && latestAns.result_status !== 'CORRECT') {
          classified = classifyCodeOrHeuristic(
            latestAns.diagnosis_code || null,
            s,
            latestAns.answer_json,
            latestAns.result_status
          );
        } else if (!latestAns && (hintOpened || explanationOpened)) {
          // Student has not submitted an answer yet but had to open hints/explanation -> METHOD_GAP
          const core = CORE_ERROR_TYPES.METHOD_GAP;
          classified = {
            error_type: core.error_type,
            origin_layer: core.origin_layer,
            origin_label_vi: core.origin_label_vi,
            priority_rank: core.priority_rank,
            label_vi: core.label_vi,
            short_label_vi: core.short_label_vi,
            trap_title: `Chưa biết cách bắt đầu bước "${s.title}" (đã mở gợi ý hỗ trợ)`,
            detection_question: core.detection_question,
            hints: s.hints?.map((h, i) => `Mức ${i + 1}: ${h.text}`) || core.hints,
            self_correction_activity:
              'Đọc gợi ý vừa mở, tự thực hiện phép biến đổi tương ứng và nộp câu trả lời cho bước này.',
            model_correction: `${s.before} → ${s.after} (${s.justification})`,
            exam_prevention_rule: core.exam_prevention_rule,
            evidence_source: 'HINT_OPENED_BEFORE_ATTEMPT',
          };
        }

        if (classified) {
          const entry = {
            ...classified,
            item_id: g.item_id,
            exercise_index: graphIndex + 1,
            step_id: s.step_id,
            step_order: stepOrder + 1,
            step_title: s.title,
            diagnosis_code: latestAns?.diagnosis_code || null,
            attempts: answers.length,
            is_current_exercise: currentItemId ? g.item_id === currentItemId : true,
          };
          detected.push(entry);
          byStepId[s.step_id] = entry;
        }
      });
    });

    // Sort priority:
    // 1. Current exercise first (so student fixes the exercise they are working on first)
    // 2. Earliest exercise index
    // 3. Earliest step_order in the DAG (upstream root cause before downstream effect)
    // 4. Origin priority rank (COPYING_ERROR [1] -> DIAGRAM_ERROR [2] -> METHOD_GAP [3] -> SIGN_ERROR [4] -> ARITHMETIC_ERROR [5])
    detected.sort((a, b) => {
      if (a.is_current_exercise !== b.is_current_exercise) return a.is_current_exercise ? -1 : 1;
      if (a.exercise_index !== b.exercise_index) return a.exercise_index - b.exercise_index;
      if (a.step_order !== b.step_order) return a.step_order - b.step_order;
      return a.priority_rank - b.priority_rank;
    });

    const activeTask = detected.length > 0 ? detected[0] : null;
    return {
      verification_boundary_notice: VERIFICATION_BOUNDARY_NOTICE,
      detected_errors: detected,
      total_active_errors: detected.length,
      queued_errors_count: Math.max(0, detected.length - 1),
      active_remediation_task: activeTask,
      by_step_id: byStepId,
    };
  }

  // Generate Mindmap Summary & Complete Model Solution for an exercise
  function buildExerciseStudyGuide(data, itemId) {
    if (!data || !Array.isArray(data.graphs)) return null;
    const g = data.graphs.find((x) => x.item_id === itemId) || data.graphs[0];
    if (!g) return null;
    const steps = g.step_ids.map((sid) => data.steps.find((s) => s.step_id === sid)).filter(Boolean);
    const traps = getExerciseTrapLibrary(data, g.item_id);

    const mindmapBranches = [
      {
        branch_id: 'INPUT_CONDITIONS',
        title: '1. Giả thiết & Điều kiện đầu vào',
        summary: g.subtitle,
        key_guard: traps.find((t) => t.error_type === 'COPYING_ERROR')?.trap_title || 'Đối chiếu kỹ hệ số và dấu từ đề gốc.',
      },
      {
        branch_id: 'STEP_FLOW',
        title: `2. Luồng ${steps.length} bước giải tư duy`,
        summary: steps.map((s, idx) => `B${idx + 1}: ${s.title}`).join(' → '),
        key_guard: traps.find((t) => t.error_type === 'METHOD_GAP')?.trap_title || 'Khóa phương pháp trước khi tính.',
      },
      {
        branch_id: 'KEY_TRAPS',
        title: '3. Chốt chặn Dấu, Tính toán & Hình vẽ',
        summary: traps
          .filter((t) => ['SIGN_ERROR', 'ARITHMETIC_ERROR', 'DIAGRAM_ERROR'].includes(t.error_type))
          .map((t) => `[${t.error_type}] ${t.trap_title}`)
          .join(' · '),
        key_guard: 'Luôn kiểm tra dấu ngoặc âm và thế ngược nghiệm vào đề gốc.',
      },
    ];

    const modelSolutionSteps = steps.map((s, idx) => {
      const expLabel =
        s.interaction.answer_type === 'choice'
          ? s.interaction.choices[s.interaction.expected] || s.interaction.expected
          : s.interaction.expected;
      return {
        step_number: idx + 1,
        step_id: s.step_id,
        title: s.title,
        before: s.before,
        after: s.after,
        justification: s.justification,
        expected_display: expLabel,
      };
    });

    return {
      item_id: g.item_id,
      title: g.title,
      prompt: g.prompt,
      conditions: g.subtitle,
      is_geometry: isGeometryGraph(g),
      geometry_precheck: getGeometryPrecheck(g),
      mindmap_branches: mindmapBranches,
      model_solution_steps: modelSolutionSteps,
      trap_library: traps,
    };
  }

  return {
    ERROR_TYPE_IDS,
    ORIGIN_LAYERS,
    CORE_ERROR_TYPES,
    VERIFICATION_BOUNDARY_NOTICE,
    DIAGNOSIS_CODE_MAP,
    isGeometryGraph,
    getGeometryPrecheck,
    classifyCodeOrHeuristic,
    getExerciseTrapLibrary,
    diagnoseStudentErrors,
    buildExerciseStudyGuide,
  };
});
