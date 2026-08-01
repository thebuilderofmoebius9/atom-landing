import { getCollection } from 'astro:content';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const siteOrigin = (process.env.PUBLIC_SITE_URL || 'https://thebuilderofmoebius9.github.io').replace(/\/$/, '');
const basePathRaw = process.env.PUBLIC_BASE_PATH ?? '/atom-landing';
const basePath = basePathRaw ? `/${basePathRaw.replace(/^\/+|\/+$/g, '')}` : '';
const site = siteOrigin.endsWith(basePath) ? siteOrigin : `${siteOrigin}${basePath}`;

const dateOnly = (date: Date) => date.toISOString().slice(0, 10);
const timeKey = (time: string) => time.replace(/\s*ICT\s*$/i, '').padStart(5, '0');

export async function GET() {
  const posts = (await getCollection('blog')).sort((a, b) => {
    const byDate = b.data.pubDate.valueOf() - a.data.pubDate.valueOf();
    if (byDate) return byDate;
    return timeKey(b.data.time).localeCompare(timeKey(a.data.time));
  });

  const chunks: string[] = [
    '# Atom Oracle — Atomic Cosmos (full corpus)',
    '',
    '> Full text of every published post. Generated at build time from the same content collection as /blog.json.',
    '',
    `- Site: ${site}/`,
    `- Feed: ${site}/blog.json`,
    `- Posts: ${posts.length}`,
    `- Generated: ${new Date().toISOString()}`,
    '',
  ];

  for (const post of posts) {
    const filePath = path.join(process.cwd(), 'src', 'content', 'blog', `${post.id}.md`);
    const markdown = await readFile(filePath, 'utf8');
    // strip frontmatter — the metadata is emitted explicitly below
    const body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();

    chunks.push(
      '---',
      '',
      `## ${post.data.title}`,
      '',
      `- URL: ${site}/blog/${post.id}/`,
      `- Date: ${dateOnly(post.data.pubDate)} ${post.data.time}`,
      `- Tags: ${(post.data.tags ?? []).join(', ')}`,
      `- Summary: ${post.data.summary}`,
      '',
      body,
      '',
    );
  }

  return new Response(chunks.join('\n'), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
}
