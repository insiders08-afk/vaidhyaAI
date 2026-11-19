/* eslint-env node */
const ContentSecurityPolicy = `
  default-src 'self';
  script-src 'self' 'unsafe-inline' ${process.env.NODE_ENV === "production" ? "" : "'unsafe-eval'"} https://va.vercel-scripts.com;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:;
  font-src 'self' data:;
  connect-src 'self' https://api.vachana.ai https://api.openai.com https://va.vercel-scripts.com https://vitals.vercel-insights.com;
  media-src 'self' blob:;
  frame-src 'none';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  worker-src 'self' blob:;
  manifest-src 'self';
  block-all-mixed-content;
`.replace(/\\s{2,}/g, ' ').trim()

const securityHeaders = [
  { key: 'Content-Security-Policy', value: ContentSecurityPolicy },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(self), payment=(), usb=()' },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  images: { unoptimized: true },
  output: 'standalone',
  async headers() {
    return [
      { source: '/(.*)', headers: securityHeaders },
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ]
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@audio': path.resolve(process.cwd(), 'src/features/recording'),
      '@transcription': path.resolve(process.cwd(), 'src/server/transcription'),
      '@transcript-assembly': path.resolve(process.cwd(), 'src/server/transcription/assembly'),
      '@note-core': path.resolve(process.cwd(), 'src/server/clinical-notes'),
      '@note-rendering': path.resolve(process.cwd(), 'packages/pipeline/render/src'),
      '@llm': path.resolve(process.cwd(), 'src/server/llm'),
      '@pipeline-errors': path.resolve(process.cwd(), 'src/server/errors'),
      '@storage': path.resolve(process.cwd(), 'src/lib/storage'),
      '@ui': path.resolve(process.cwd(), 'packages/ui/src'),
      '@ui/lib': path.resolve(process.cwd(), 'packages/ui/src/lib'),
    }
    return config
  },
}
import path from 'node:path'
export default nextConfig
