/**
 * Netlify Edge Function — Optimized XHTTP/VLESS Proxy
 *
 * بهینه‌سازی‌ها:
 *  - بدون buffering: body مستقیم pipe میشه (ReadableStream)
 *  - hop-by-hop headers از هر دو طرف حذف میشن (منبع اصلی قطعی)
 *  - host header درست ست میشه برای بک‌اند
 *  - duplex: "half" برای streaming request body
 *  - استفاده از Netlify.env (API رسمی Deno روی Netlify)
 *  - error handling کامل
 */

// این headerها نباید بین proxy و backend منتقل بشن
// منبع اصلی disconnect در اکثر پروکسی‌ها همینه
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "proxy-connection",
  "host", // host رو خودمون دستی ست می‌کنیم
]);

export default async (request, context) => {
  // خواندن BACKEND_URL با API رسمی Netlify Edge Functions
  const BACKEND_URL = Netlify.env.get("BACKEND_URL");

  if (!BACKEND_URL) {
    return new Response("Configuration error: BACKEND_URL is not set.", {
      status: 500,
      headers: { "content-type": "text/plain" },
    });
  }

  // ساخت URL بک‌اند — path و query string رو کامل منتقل می‌کنیم
  const incomingUrl = new URL(request.url);
  const upstreamUrl = BACKEND_URL + incomingUrl.pathname + incomingUrl.search;

  // کپی هدرهای ورودی، بدون hop-by-hop headers
  const upstreamHeaders = new Headers();
  for (const [key, value] of request.headers) {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      upstreamHeaders.set(key, value);
    }
  }

  // host header رو به بک‌اند اصلی ست می‌کنیم
  upstreamHeaders.set("host", new URL(BACKEND_URL).host);

  try {
    // ارسال request به بک‌اند
    // duplex: "half" — برای stream کردن body ضروریه، بدونش body buffer میشه
    const upstreamResponse = await fetch(upstreamUrl, {
      method: request.method,
      headers: upstreamHeaders,
      body: request.body,
      duplex: "half",
    });

    // کپی هدرهای پاسخ، باز بدون hop-by-hop headers
    const responseHeaders = new Headers();
    for (const [key, value] of upstreamResponse.headers) {
      if (!HOP_BY_HOP.has(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    }

    // برگرداندن پاسخ به صورت کامل streaming — بدون هیچ buffer یا تبدیل
    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });

  } catch (err) {
    console.error(`[proxy] upstream error: ${err.message}`);
    return new Response(`Bad Gateway: ${err.message}`, {
      status: 502,
      headers: { "content-type": "text/plain" },
    });
  }
};
