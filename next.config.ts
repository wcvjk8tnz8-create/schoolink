import type { NextConfig } from "next";

/**
 * Schoolink 是「登录后的私有实时应用」：所有页面数据都来自 WebSocket / API，
 * 服务端渲染、ISR、Server Actions 在这里没有意义，还会引入缓存一致性问题。
 * 因此用 Next.js 的静态导出，产物 out/ 直接交给 Cloudflare Workers Static Assets，
 * 只有 /api/* 与 /admin 走 Worker。静态资源在边缘免费、无限量、零冷启动。
 */
const nextConfig: NextConfig = {
  output: "export",
  reactStrictMode: true,
  poweredByHeader: false,
  images: { unoptimized: true },
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: true },
  experimental: { optimizePackageImports: ["motion"] },
};

export default nextConfig;
