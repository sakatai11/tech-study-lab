import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";
import path from "node:path";

// pnpm monorepo のルートを明示し、Turbopack がホームディレクトリの
// package-lock.json を誤検知するのを防ぐ
// path.resolve で正規化しないと Turbopack がパスを誤計算する
const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(import.meta.dirname, "../.."),
  },
};

export default nextConfig;

initOpenNextCloudflareForDev();
