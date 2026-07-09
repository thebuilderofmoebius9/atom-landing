const siteOrigin = (process.env.PUBLIC_SITE_URL || 'https://atom.buildwithoracle.com').replace(/\/$/, '');
const basePathRaw = process.env.PUBLIC_BASE_PATH || '';
const basePath = basePathRaw ? `/${basePathRaw.replace(/^\/+|\/+$/g, '')}` : '';
const site = siteOrigin.endsWith(basePath) ? siteOrigin : `${siteOrigin}${basePath}`;

export async function GET() {
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <sitemap>\n    <loc>${site}/sitemap-0.xml</loc>\n  </sitemap>\n</sitemapindex>\n`;
  return new Response(body, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
}
