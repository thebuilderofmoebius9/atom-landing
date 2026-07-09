import { getCollection } from 'astro:content';

const siteOrigin = (process.env.PUBLIC_SITE_URL || 'https://atom.buildwithoracle.com').replace(/\/$/, '');
const basePathRaw = process.env.PUBLIC_BASE_PATH || '';
const basePath = basePathRaw ? `/${basePathRaw.replace(/^\/+|\/+$/g, '')}` : '';
const site = siteOrigin.endsWith(basePath) ? siteOrigin : `${siteOrigin}${basePath}`;

const dateOnly = (date: Date) => date.toISOString().slice(0, 10);
const xml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function GET() {
  const blogs = await getCollection('blog');
  const books = await getCollection('books');
  const today = dateOnly(new Date());
  const urls = [
    { loc: `${site}/`, lastmod: today },
    { loc: `${site}/about/`, lastmod: today },
    { loc: `${site}/blog/`, lastmod: today },
    { loc: `${site}/books/`, lastmod: today },
    { loc: `${site}/workshops/`, lastmod: today },
    ...blogs.flatMap((post) => [
      { loc: `${site}/blog/${post.id}/`, lastmod: dateOnly(post.data.pubDate) },
      { loc: `${site}/blog-md/${post.id}.md`, lastmod: dateOnly(post.data.pubDate) },
    ]),
    ...books.map((book) => ({ loc: `${site}/books/${book.id}/`, lastmod: today })),
    { loc: `${site}/blog.json`, lastmod: today },
    { loc: `${site}/llms.txt`, lastmod: today },
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url>\n    <loc>${xml(u.loc)}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n  </url>`).join('\n')}\n</urlset>\n`;
  return new Response(body, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
}
