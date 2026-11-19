import path from "node:path";
import type { NextConfig } from "next";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === "production"
  ? "https://animelink-demo.onrender.com/api"
  : "http://localhost:5000/api")).replace(/\/+$/, "");
const API_ORIGIN = new URL(API_URL).origin;

const nextConfig: NextConfig = {
  // Allow a production build alongside a development server without sharing its output.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // frontend/ is its own app inside the monorepo; don't let Next guess the workspace root.
  outputFileTracingRoot: path.resolve(__dirname),
  // Keep API requests and uploaded files on the frontend origin so session cookies work
  // on both localhost and the Vercel domain.
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_URL}/:path*` },
      { source: "/uploads/:path*", destination: `${API_ORIGIN}/uploads/:path*` },
    ];
  },
};

export default nextConfig;
