/**
 * Curated topic collections (data/collections.json): hub pages
 * (/collections/:slug), the Topics column in the site footer and the
 * "Part of" links on landing pages.
 */
import data from '../data/collections.json';
import type { Collection } from './dataTypes';

export const COLLECTIONS: Collection[] = (data as { collections: Collection[] }).collections;

export const FEATURED_COLLECTIONS: Collection[] = COLLECTIONS.filter((c) => c.featured);

/** Collections that list a given structure. */
export function collectionsContaining(type: 'pdb' | 'af', id: string): Collection[] {
  const upper = id.toUpperCase();
  return COLLECTIONS.filter((c) => c.items.some((i) => i.type === type && i.id.toUpperCase() === upper));
}

export function collectionHref(c: Pick<Collection, 'slug'>): string {
  return `/collections/${c.slug}`;
}

export function itemHref(item: { type: 'pdb' | 'af'; id: string }): string {
  return item.type === 'pdb' ? `/pdb/${item.id}` : `/af/${item.id}`;
}
