import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["nodemailer"],
  // A stray package-lock.json in the home directory confuses Turbopack's
  // workspace-root inference; pin the root to this project.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
