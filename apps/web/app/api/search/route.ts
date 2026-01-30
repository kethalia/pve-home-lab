import { source } from '@/lib/source';
import { createSearchAPI } from 'fumadocs-core/search/server';

export const { GET } = createSearchAPI('advanced', {
  language: 'english',
  indexes: source.getPages().map((page) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = page.data as any;
    return {
      title: page.data.title ?? '',
      description: page.data.description,
      url: page.url,
      id: page.url,
      structuredData: data.structuredData ?? { headings: [], contents: [] },
    };
  }),
});
