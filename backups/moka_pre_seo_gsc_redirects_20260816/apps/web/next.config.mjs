/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // O monorepo importa .ts/.tsx direto dos pacotes via workspaces.
  // O Next precisa transpilá-los.
  transpilePackages: ["@igot/ai-providers", "@igot/parser"],
};

export default nextConfig;
