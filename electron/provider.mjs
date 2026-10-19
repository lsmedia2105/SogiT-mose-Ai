export function validateEndpoint(raw) {
  let url; try { url = new URL(raw); } catch { throw new Error('Địa chỉ API không hợp lệ.'); }
  if (url.username || url.password || url.search || url.hash) throw new Error('URL API không được chứa mật khẩu, query hoặc fragment.');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname))) throw new Error('API phải dùng HTTPS, hoặc HTTP localhost cho model local.');
  return url.href.replace(/\/$/,'');
}
export async function chatCompletion({ baseUrl, key, model, messages, signal }) {
  if (!model?.trim()) throw new Error('Chưa cấu hình model viết kịch bản.');
  const res = await fetch(`${validateEndpoint(baseUrl)}/chat/completions`, {
    method:'POST', redirect:'error', signal,
    headers:{'Content-Type':'application/json', ...(key ? { Authorization:`Bearer ${key}` } : {})},
    body:JSON.stringify({ model, messages, temperature:0.65 }),
  });
  if (!res.ok) throw new Error(`API viết kịch bản trả về HTTP ${res.status}. Kiểm tra endpoint, model và quyền truy cập.`);
  const body=await res.json(); const result=body.choices?.[0]?.message?.content;
  if (typeof result !== 'string' || !result.trim()) throw new Error('API không trả về nội dung văn bản.');
  return result;
}
