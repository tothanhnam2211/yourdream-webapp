'use strict';
// Caller must supply getChatGPTUser() from the platform's server-only helper.
// This module never provisions a principal, grants a role or touches D1.
const headers={'cache-control':'private, no-store','pragma':'no-cache','vary':'Cookie, oai-authenticated-user-id, oai-authenticated-user-email','x-content-type-options':'nosniff'};
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function ownIdentity(user,projectId){
 if(!user||typeof user.userId!=='string'||!user.userId||typeof user.email!=='string'||!user.email)return null;
 return {authenticated:true,subject_id:user.userId,project_id:projectId};
}
function identityResponse(user,projectId){const identity=ownIdentity(user,projectId);return new Response(JSON.stringify(identity||{error:'AUTH_REQUIRED'}),{status:identity?200:401,headers:{...headers,'content-type':'application/json; charset=utf-8'}});}
function verificationPage(user,projectId){
 const identity=ownIdentity(user,projectId);
 const content=identity?`<p class="label">ĐÃ NHẬN DIỆN PHIÊN ĐĂNG NHẬP</p><h1>Xác minh tài khoản của bạn</h1><p>Tài khoản đang mở: <b>${esc(user.email)}</b></p><p>Định danh của bạn trên Site:</p><pre>${esc(identity.subject_id)}</pre><p>Sao chép định danh trên và gửi lại trong cuộc trò chuyện YOURDREAM để hoàn tất cấp quyền xem trước. Trang này chưa tự cấp quyền hoặc tạo hồ sơ luyện tập.</p><p class="note">Nếu đây không phải tài khoản bạn muốn dùng, hãy đổi tài khoản rồi mở lại trang.</p><a class="button" target="_top" href="/signout-with-chatgpt?return_to=%2Fverify">Đổi tài khoản</a>`:`<p class="label">THIẾT LẬP BẢN THỬ RIÊNG TƯ</p><h1>Đăng nhập để xác minh</h1><p>Đăng nhập bằng tài khoản chủ dự án. Sau khi trở lại trang này, bạn sẽ thấy định danh cần dùng để thiết lập lưu tiến trình.</p><a class="button" target="_top" href="/signin-with-chatgpt?return_to=%2Fverify">Đăng nhập với ChatGPT</a>`;
 const html=`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Xác minh tài khoản · YOURDREAM</title><style>body{margin:0;background:#f7f5ed;color:#213d31;font:17px/1.65 system-ui,sans-serif}main{max-width:680px;margin:6vh auto;padding:28px}header{font-weight:800;letter-spacing:2px;margin-bottom:32px}article{background:white;border:1px solid #dce3d7;border-radius:20px;padding:clamp(20px,5vw,40px)}h1{font-size:clamp(26px,5vw,36px);line-height:1.2}.label{font-size:12px;font-weight:700;letter-spacing:1.5px}pre{white-space:pre-wrap;overflow-wrap:anywhere;padding:18px;background:#edf2e9;border-radius:10px;user-select:all;font-size:16px}.button{display:inline-block;background:#244b3b;color:white;padding:10px 20px;border-radius:10px;text-decoration:none}.note{color:#607065;font-size:15px}footer{margin-top:24px}a{color:#244b3b}</style></head><body><main><header>YOURDREAM</header><article>${content}</article><footer><a href="/radicals.html">← Về bài luyện căn thức</a></footer></main></body></html>`;
 return new Response(html,{status:200,headers:{...headers,'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"}});
}
module.exports={ownIdentity,identityResponse,verificationPage};
