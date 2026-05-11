/**
 * Netlify Edge Function — Minimal XHTTP/VLESS Proxy
 *
 * قانون طلایی: هرچی کمتر دست بزنی، سریع‌تر و پایدارتره
 *
 * مشکل نسخه قبلی:
 *  - حذف transfer-encoding از response → streaming متوقف میشه → buffer → کند + قطعی
 *  - loop روی تمام headers → CPU overhead اضافه
 *  - new URL() اضافه برای host → overhead غیرضروری
 *
 * این نسخه:
 *  - فقط host رو حذف میکنه (fetch خودش host رو درست ست میکنه)
 *  - response headers رو مستقیم پاس میده، بدون هیچ تغییری
 *  - BACKEND_URL یکبار در module-level خونده میشه، نه per-request
 *  - body مستقیم pipe میشه، بدون هیچ buffer
 */

// یکبار خونده میشه، نه هر بار که request میاد
const BACKEND = Netlify.env.get("BACKEND_URL") ?? "";

export default async (request) => {
  if (!BACKEND) {
    return new Response("BACKEND_URL is not set.", { status: 500 });
  }

  const { pathname, search } = new URL(request.url);

  // فقط host رو حذف میکنیم — بقیه headers دست نخورده منتقل میشن
  const headers = new Headers(request.headers);
  headers.delete("host");

  const upstream = await fetch(BACKEND + pathname + search, {
    method: request.method,
    headers,
    body: request.body,
    duplex: "half", // ضروری برای stream کردن request body
  });

  // response headers مستقیم پاس میشن — transfer-encoding دست نخورده میمونه
  // تا chunked streaming درست کار کنه
  return new Response(upstream.body, {
    status: upstream.status,
    headers: upstream.headers,
  });
};
