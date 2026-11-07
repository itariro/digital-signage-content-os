// Wyse 3040 (2 GB RAM / 8 GB eMMC): keep builds small and telemetry off.
// Avoid heavy runtime deps: lodash, moment, framer-motion are NOT installed.
// Use Array.prototype methods, Intl.DateTimeFormat, and CSS transitions.
// sharp is dev-only build tooling — never import it on the frame request path.
process.env.NEXT_TELEMETRY_DISABLED = '1';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  productionBrowserSourceMaps: false,
  compress: true,
  images: { unoptimized: true },
};

export default nextConfig;
