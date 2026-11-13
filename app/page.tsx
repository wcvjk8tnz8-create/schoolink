"use client";

import App from "@/components/App";

/**
 * /、/admin 都落到这一个 Next.js 页面：
 * Worker 把 /admin 重写到 /index.html（不重定向），前端按 pathname 决定视图。
 * 这样避免 Static Assets 的 trailing-slash 301 循环，也只需要一份 bundle。
 */
export default function Page() {
  return <App />;
}
