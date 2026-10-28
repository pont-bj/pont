import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  // @pont/auth est publié en TypeScript : on le compile avec l'application, et les imports « .js » pointent vers les sources « .ts ».
  transpilePackages: ["@pont/auth"],
  webpack(webpackConfig) {
    webpackConfig.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return webpackConfig;
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default config;
