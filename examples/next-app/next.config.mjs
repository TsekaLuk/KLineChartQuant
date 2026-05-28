/**
 * Next.js 15 config for the @klinechart-quant/react SSR smoke test.
 *
 * `transpilePackages` ensures the workspace-linked adapter source is run
 * through Next's SWC pipeline (the adapter ships uncompiled TS via the
 * pnpm workspace symlink during local development).
 */
/** @type {import('next').NextConfig} */
const nextConfig = {
    transpilePackages: ['@klinechart-quant/react', '@klinechart-quant/core'],
    reactStrictMode: true,
}

export default nextConfig
