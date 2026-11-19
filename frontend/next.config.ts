import path from "node:path";
import type { NextConfig } from "next";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api").replace(/\/+$/, "");
const API_ORIGIN = new URL(API_URL).origin;

const nextConfig: NextConfig = {
  // Allow a production build alongside a development server without sharing its output.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // frontend/ is its own app inside the monorepo; don't let Next guess the workspace root.
  outputFileTracingRoot: path.resolve(__dirname),
  // Stored image URLs are API-relative ("/uploads/pets/x.webp"). Proxy them to the API so
  // <img src> works unchanged and the session cookie still reaches the access check
  // for private incident photos. All JSON traffic goes directly to NEXT_PUBLIC_API_URL.
  async rewrites() {
    return [{ source: "/uploads/:path*", destination: `${API_ORIGIN}/uploads/:path*` }];
  },
};

export default nextConfig;
