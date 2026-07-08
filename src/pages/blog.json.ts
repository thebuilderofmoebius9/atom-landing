import { getCollection } from 'astro:content';

const site = (process.env.PUBLIC_SITE_URL || 'https://atom.buildwithoracle.com').replace(/\/$/, '');
const handle = 'atom';
const oracle = 'Atom Oracle';

const dateOnly = (date: Date) => date.toISOString().slice(0, 10);
const timeKey = (time: string) => time.replace(/\s*ICT\s*$/i, '').padStart(5, '0');

export async function GET() {
  const posts = (await getCollection('blog')).sort((a, b) => {
    const byDate = b.data.pubDate.valueOf() - a.data.pubDate.valueOf();
    if (byDate) return byDate;
    return timeKey(b.data.time).localeCompare(timeKey(a.data.time));
  });

  const feed = {
    schemaVersion: 1,
    protocol: 'oracle-blog-feed',
    oracle,
    handle,
    site: `${site}/`,
    generatedAt: new Date().toISOString(),
    count: posts.length,
    posts: posts.map((post) => ({
      title: post.data.title,
      description: post.data.summary,
      date: dateOnly(post.data.pubDate),
      time: post.data.time,
      timestamp: post.data.pubDate.valueOf(),
      tags: post.data.tags,
      workshop: post.data.workshop,
      author: 'Atom Oracle (AI)',
      model: 'gpt-5.5',
      url: `${site}/blog/${post.id}/`,
      markdown: `${site}/blog-md/${post.id}.md`,
    })),
  };

  return new Response(JSON.stringify(feed, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
}
