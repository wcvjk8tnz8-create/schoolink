/**
 * /admin 页面由 Worker 直接回传，不再交给 ASSETS 重写。
 *
 * 原因：Workers Static Assets 默认 html_handling 会把 /admin.html 301 到 /admin；
 * 而 /admin 又被 Worker 重写回 /admin.html —— 两者互跳，浏览器报
 * ERR_TOO_MANY_REDIRECTS（「太多重新導向」）。内联返回后 /admin 与 /admin/
 * 都是一次 200，零重定向。
 *
 * 这里只放骨架，样式与逻辑仍由静态资源 /admin.css、/admin.js 提供。
 * public/admin.html 保留同内容作为备用直链参考（Worker 不使用它）。
 */
export const ADMIN_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#161615" />
  <meta name="robots" content="noindex, nofollow" />
  <title>Schoolink · Admin Console</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="stylesheet" href="/style.css" />
  <link rel="stylesheet" href="/admin.css" />
</head>
<body class="admin-page">
  <div id="admin-root"></div>
  <div id="toast" role="status" aria-live="polite"></div>
  <script type="module" src="/admin.js"></script>
</body>
</html>
`;
