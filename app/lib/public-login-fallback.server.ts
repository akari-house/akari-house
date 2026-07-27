const publicLoginRelease = "worker-login-2026-07-27-final";

function escapeHtml(value: string) {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[character] ?? character,
  );
}

export interface PublicLoginFallbackOptions {
  error?: string;
  email?: string;
  status?: number;
  stage?: string;
}

export function shouldServePublicLoginFallback(request: Request) {
  const url = new URL(request.url);
  return request.method === "GET" && url.pathname === "/login";
}

export function publicLoginFallbackResponse(
  request: Request,
  siteKey?: string,
  options: PublicLoginFallbackOptions = {},
) {
  const url = new URL(request.url);
  const action = `${url.pathname}${url.search}`;
  const safeSiteKey = siteKey ? escapeHtml(siteKey) : "";
  const safeEmail = escapeHtml(options.email ?? "");
  const error = options.error
    ? `<p class="error" role="alert">${escapeHtml(options.error)}</p>`
    : "";
  const turnstile = safeSiteKey
    ? `<div class="cf-turnstile" data-sitekey="${safeSiteKey}" data-theme="dark" data-action="login"></div>
       <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`
    : `<p class="error" role="alert">The security check is temporarily unavailable. Please try again shortly.</p>`;

  const body = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#090B14">
  <title>Log in · AKARI House</title>
  <link rel="icon" href="/assets/brand/favicon.ico">
  <style>
    :root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#090B14;color:#fff}
    *{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 82% 20%,rgba(240,79,135,.14),transparent 35%),#090B14}
    main{min-height:100vh;display:grid;grid-template-columns:minmax(0,1fr) minmax(340px,520px);align-items:center;gap:clamp(2rem,6vw,7rem);max-width:1280px;margin:auto;padding:clamp(1.5rem,5vw,5rem)}
    .brand{position:absolute;top:1.5rem;left:clamp(1.5rem,5vw,5rem);display:flex;align-items:center;gap:.6rem;color:#fff;text-decoration:none;font-weight:700}.brand img{width:150px;height:auto}.brand span{font-size:.88rem}
    .intro{max-width:560px}.eyebrow{color:#FFD33D;font-size:.78rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase}h1{font-size:clamp(2.6rem,6vw,5.5rem);line-height:.95;margin:.8rem 0 1.1rem}.intro p{color:#B7BAC5;font-size:1.05rem;line-height:1.7;max-width:42rem}
    .panel{background:#111522;border:1px solid rgba(240,79,135,.3);border-radius:24px;padding:clamp(1.4rem,4vw,2.5rem);box-shadow:0 30px 80px rgba(0,0,0,.35)}
    .panel h2{margin:0 0 .4rem;font-size:2rem}.panel>p{margin:0 0 1.5rem;color:#B7BAC5}.stack{display:grid;gap:1rem}label{display:grid;gap:.45rem;font-size:.9rem;font-weight:600}input{width:100%;min-height:48px;border-radius:12px;border:1px solid rgba(255,255,255,.16);background:#090B14;color:#fff;padding:.8rem 1rem;font:inherit}input:focus{outline:3px solid rgba(240,79,135,.3);border-color:#F04F87}
    button{min-height:50px;border:0;border-radius:12px;background:#F04F87;color:#090B14;font-weight:800;font-size:1rem;cursor:pointer}.assist{display:flex;justify-content:space-between;gap:1rem;font-size:.9rem}.assist a,.footer a{color:#FFD33D}.footer{margin:1.25rem 0 0;color:#B7BAC5;font-size:.92rem}.error{margin:0;padding:.85rem 1rem;border:1px solid rgba(240,79,135,.55);border-radius:12px;background:rgba(240,79,135,.12);color:#fff;line-height:1.45}
    @media(max-width:820px){main{grid-template-columns:1fr;padding-top:7rem}.intro{display:none}.brand{top:1.2rem}.panel{max-width:560px;width:100%;margin:auto}}
  </style>
</head>
<body>
  <a class="brand" href="/" aria-label="AKARI House home"><img src="/assets/optimized/akari-logo.webp" alt="AKARI"><span>House</span></a>
  <main id="main-content">
    <section class="intro"><span class="eyebrow">Welcome back</span><h1>Return to the House</h1><p>Your rooms, roles and privacy choices are waiting.</p></section>
    <section class="panel" aria-labelledby="login-title">
      <h2 id="login-title">Log in</h2><p>Enter your AKARI membership details.</p>
      <form method="post" action="${escapeHtml(action)}" class="stack">
        ${error}
        <label>Email<input name="email" type="email" autocomplete="email" value="${safeEmail}" required></label>
        <label>Password<input name="password" type="password" autocomplete="current-password" maxlength="128" required></label>
        <div class="assist"><a href="/forgot-password">Forgot password?</a></div>
        ${turnstile}
        <button type="submit">Log in</button>
      </form>
      <p class="footer">New to AKARI? <a href="/register">Request membership</a></p>
    </section>
  </main>
</body>
</html>`;

  return new Response(body, {
    status: options.status ?? 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      "x-akari-login-fallback": "worker",
      "x-akari-login-release": publicLoginRelease,
      "x-akari-login-result": options.error ? "error" : "form",
      "x-akari-login-stage": options.stage ?? "form",
    },
  });
}
