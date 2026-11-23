import type { TrySku } from './sku-catalog.ts';

export type SkuFilter = 'all' | 'live' | 'commerce' | 'catalog';

export function countUniqueSku(items: ReadonlyArray<Pick<TrySku, 'productId'>>): number {
  return new Set(items.map((item) => item.productId)).size;
}

function normalizeSearch(input: string): string {
  return input.toLocaleLowerCase('vi').normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').trim();
}

/**
 * Search and filter a display-only list of previously observed SKUs.
 * This never changes purchase payloads or assumes Google eligibility.
 */
export function filterSkuRows(
  rows: ReadonlyArray<TrySku>,
  filter: SkuFilter,
  search: string,
  visibleSkuIds: ReadonlyArray<string>,
): TrySku[] {
  const text = normalizeSearch(search);
  const visible = new Set(visibleSkuIds);
  return rows.filter((item) => {
    if (filter === 'live' && !item.observedNow && !visible.has(item.productId)) return false;
    if (filter === 'commerce' && item.evidence !== 'commerce-har') return false;
    if (filter === 'catalog' && item.evidence !== 'html-catalog') return false;
    if (!text) return true;
    const searchable = normalizeSearch([
      item.plan, item.productId, item.expectedPrice,
      item.basePlanId ?? '', item.evidenceHar ?? '',
    ].join(' '));
    return searchable.includes(text);
  });
}
