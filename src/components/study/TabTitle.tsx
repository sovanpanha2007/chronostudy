'use client';
import { useEffect } from 'react';
import { DEFAULT_TAB_TITLE, formatTabTitle } from '@/lib/tab-title';
import type { ControllerSnapshot } from '@/lib/study-controller';

const FAVICON_SELECTOR = 'link[rel~="icon"]';
const ACTIVE_FAVICON = '/icon-stopwatch.svg';

export function TabTitle({ snapshot }: { snapshot: ControllerSnapshot }) {
  useEffect(() => {
    const timer = snapshot.store.active;
    const link = document.querySelector<HTMLLinkElement>(FAVICON_SELECTOR);
    const original = link?.getAttribute('href') ?? '';
    document.title = timer ? formatTabTitle(timer) : DEFAULT_TAB_TITLE;
    if (link) link.setAttribute('href', timer ? ACTIVE_FAVICON : original);
    return () => {
      document.title = DEFAULT_TAB_TITLE;
      if (link && original) link.setAttribute('href', original);
    };
  }, [snapshot]);
  return null;
}
