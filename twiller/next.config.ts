import type { NextConfig } from "next";
import path from "path";

if (process.env.VERCEL_ENV === "preview" && process.env.NEXT_PUBLIC_TWILLER_DEPLOYMENT_STAGE !== "staging") {
  throw new Error("Vercel Preview requires explicit Twiller staging configuration");
}

const nextConfig: NextConfig = {
  async rewrites() {
    return process.env.NEXT_PUBLIC_TWILLER_DEPLOYMENT_STAGE === "staging"
      ? [{ source: "/__/auth/:path*", destination: "https://twill-12669.firebaseapp.com/__/auth/:path*" }]
      : [];
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Prevent Next.js from inferring wrong workspace root due to parent lockfiles
  outputFileTracingRoot: path.join(__dirname),
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "5000",
        pathname: "/media/**",
      },
      {
        protocol: "https",
        hostname: "twiller-ruby.vercel.app",
        pathname: "/media/**",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
};

export default nextConfig;
