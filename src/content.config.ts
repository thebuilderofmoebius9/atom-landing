import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    pubDate: z.coerce.date(),
    time: z.string(),
    workshop: z.string(),
    tags: z.array(z.string()).default([])
  })
});


const books = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/books' }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    pdf: z.string(),
    source: z.string(),
    cover: z.string().optional()
  })
});

export const collections = { blog, books };

