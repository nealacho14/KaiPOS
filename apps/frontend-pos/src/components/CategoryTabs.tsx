import type { Category } from '@kaipos/shared';
import { Box, Tab, Tabs, useLayoutMode } from '@kaipos/ui';
import { useEffect, useState } from 'react';
import { listCategories } from '../lib/categories-api.js';
import { logger } from '../lib/logger.js';

// The two pinned tab values. Everything else is the raw category id.
export const TAB_ALL = 'all' as const;
export const TAB_FEATURED = 'featured' as const;
export type CategoryTabValue = typeof TAB_ALL | typeof TAB_FEATURED | string;

export interface CategoryTabsProps {
  value: CategoryTabValue;
  onChange: (value: CategoryTabValue) => void;
}

const PAGE_LIMIT = 100;

export function CategoryTabs({ value, onChange }: CategoryTabsProps) {
  const isDesktop = useLayoutMode() === 'desktop';
  const [categories, setCategories] = useState<Category[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const first = await listCategories({ page: 1, limit: PAGE_LIMIT });
        if (cancelled) return;
        const all: Category[] = [...first.data];

        const totalPages = Math.max(1, first.pagination.totalPages ?? 1);
        for (let page = 2; page <= totalPages; page += 1) {
          const next = await listCategories({ page, limit: PAGE_LIMIT });
          if (cancelled) return;
          all.push(...next.data);
        }

        // Server already sorts by sortOrder, but defensive-sort to make the
        // pinned tabs invariant explicit.
        all.sort((a, b) => a.sortOrder - b.sortOrder);
        if (!cancelled) {
          setCategories(all);
          setLoaded(true);
        }
      } catch (error) {
        if (!cancelled) {
          logger.error('categories.list failed', {
            message: error instanceof Error ? error.message : 'unknown',
          });
          setLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Box
      sx={{
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Tabs
        value={value}
        onChange={(_, next) => onChange(next as CategoryTabValue)}
        variant="scrollable"
        // Arrows are dead weight on a touch screen — the strip is swipeable and
        // they eat width that tab labels need.
        scrollButtons={isDesktop ? 'auto' : false}
        allowScrollButtonsMobile={isDesktop}
        aria-label="Categorías"
        sx={(theme) => ({
          ...(!isDesktop && {
            minHeight: theme.posSize.min,
            '& .MuiTab-root': { minHeight: theme.posSize.min },
          }),
        })}
      >
        <Tab value={TAB_ALL} label="Todas" data-testid="category-tab-all" />
        <Tab value={TAB_FEATURED} label="Destacados" data-testid="category-tab-featured" />
        {loaded &&
          categories.map((cat) => (
            <Tab
              key={cat._id}
              value={cat._id}
              label={cat.name}
              data-testid={`category-tab-${cat._id}`}
            />
          ))}
      </Tabs>
    </Box>
  );
}
