import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The Tailscale preview is reached as longs-macbook-air.tail2ad1ae.ts.net rather than
  // localhost, which `next dev` treats as a cross-origin request.
  allowedDevOrigins: ["longs-macbook-air.tail2ad1ae.ts.net"],
}

export default nextConfig
