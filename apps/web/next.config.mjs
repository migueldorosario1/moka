/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // O monorepo importa .ts/.tsx direto dos pacotes via workspaces.
  // O Next precisa transpilá-los.
  transpilePackages: ["@igot/ai-providers", "@igot/parser"],
  // /premium virou redirect no nível do roteamento (308, com header Location
  // correto) — alerta GSC 16/08/2026: o redirect() dentro da página saía como
  // 307 SEM Location (o Google não consolidava e reportava "página com
  // redirecionamento"). premium/page.tsx fica só de fallback.
  async redirects() {
    return [
      { source: "/premium", destination: "/ajuda", permanent: true },
    ];
  },
};

export default nextConfig;
