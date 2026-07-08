import { getCollection } from 'astro:content';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function getStaticPaths() {
  const posts = await getCollection('blog');
  return posts.map((post) => ({ params: { slug: post.id }, props: { post } }));
}

export async function GET({ props }) {
  const filePath = path.join(process.cwd(), 'src', 'content', 'blog', `${props.post.id}.md`);
  const markdown = await readFile(filePath, 'utf8');
  return new Response(markdown, {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
}
