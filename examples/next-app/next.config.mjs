import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')

/** @type {import('next').NextConfig} */
const nextConfig = {
    transpilePackages: ['@klinechart-quant/react', '@klinechart-quant/core'],
    outputFileTracingRoot: repoRoot,
    reactStrictMode: true,
    webpack(config) {
        if (!config.resolve) config.resolve = {}
        if (!config.resolve.alias) config.resolve.alias = {}
        config.resolve.alias['@'] = path.resolve(repoRoot, 'src')
        return config
    },
}

export default nextConfig
