import type { NextConfig } from "next";

const rawBase = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").trim();
const basePath =
  !rawBase || rawBase === "/"
    ? undefined
    : rawBase.startsWith("/")
      ? rawBase.replace(/\/$/, "")
      : `/${rawBase.replace(/\/$/, "")}`;

const nextConfig: NextConfig = {
  env: { STUDIO_RELEASE_COMMIT: process.env.COMMIT_REF || "local" },
  ...(basePath ? { basePath } : {}),
  distDir: process.env.NEXT_DIST_DIR || ".next",
  /** Dev: allow 127.0.0.1 vs localhost / ::1 host mix so `/_next/*` is not treated as cross-site. */
  allowedDevOrigins: ["127.0.0.1"],
  // Keep native/heavy deps and Supabase out of webpack vendor chunks — avoids missing
  // `./vendor-chunks/@supabase.js` when the dev bundle graph is interrupted or mismatched.
  // Do not use outputFileTracingIncludes for ffmpeg-static here — it bloats ___netlify-server-handler
  // past Netlify's 250 MB limit. Background functions ship the binary via netlify.toml included_files.
  serverExternalPackages: ["puppeteer", "@sparticuz/chromium", "ffmpeg-static", "@supabase/supabase-js", "onnxruntime-web"],
  // Runtime drafts, migration backups and local provider settings are never deployment assets.
  outputFileTracingExcludes: { "/*": ["./output/**/*", "./data/local/**/*"] },
  outputFileTracingIncludes: { "/api/studio-workspace/[...path]": ["./features/msn-local/models/*", "./features/brand-kits/seeds.json", "./node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm", "./node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs"], "/workspace/[[...path]]": ["./features/msn-local/*.html", "./features/msn-local/navigation.js", "./features/msn-local/hosted-transport.js", "./features/msn-local/animation.mjs"] },
  onDemandEntries: {
    maxInactiveAge: 60 * 1000,
    pagesBufferLength: 8,
  },
};

if (process.env.USE_TURBO !== "1") {
  nextConfig.webpack = (config, { dev, isServer }) => {
    if (dev) {
      config.cache = { type: "memory" };
    }
    if (dev && isServer) {
      config.optimization = {
        ...config.optimization,
        splitChunks: false,
      };
    }
    if (!isServer) {
      config.resolve = {
        ...config.resolve,
        fallback: {
          ...(config.resolve?.fallback ?? {}),
          fs: false,
          path: false,
          net: false,
          tls: false,
          child_process: false,
        },
      };
    }
    if (dev && process.env.NEXT_WEBPACK_POLL !== "0") {
      config.watchOptions = {
        ...config.watchOptions,
        poll: 1000,
        aggregateTimeout: 1000,
      };
    }
    return config;
  };
}

export default nextConfig;
