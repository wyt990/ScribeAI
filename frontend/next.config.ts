import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 防止 Next.js 自动重定向 /socket.io/ → /socket.io（去尾随斜杠）
  // Socket.io 后端 Engine.IO 要求路径带斜杠才能匹配
  skipTrailingSlashRedirect: true,

  // rewrites 代理默认 30s 会 ECONNRESET；结构化纪要 LLM 常需 1–3 分钟
  experimental: {
    proxyTimeout: 600_000, // 5 分钟
  },

  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:4000/api/:path*",
      },
      // 匹配 /socket.io/（无额外路径段，如初始握手请求）
      {
        source: "/socket.io/",
        destination: "http://localhost:4000/socket.io/",
      },
      // 匹配 /socket.io/:xxx（有额外路径段）
      {
        source: "/socket.io/:path*",
        destination: "http://localhost:4000/socket.io/:path*",
      },
    ];
  },

  // COOP/COEP 头：启用 SharedArrayBuffer（ONNX Runtime Web WASM 多线程需要）
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
};

export default nextConfig;
