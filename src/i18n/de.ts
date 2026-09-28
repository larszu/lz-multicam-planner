/**
 * Deutsches Override-Dictionary für MultiCam, aus Domänen-Teildicts komponiert.
 * Englisch bleibt Quell-Sprache (Fallback im JSX via t(key, 'English')).
 */
import { sidebar } from './de/sidebar';
import { header } from './de/header';
import { preview } from './de/preview';
import { venue } from './de/venue';
import { inventory } from './de/inventory';
import { rig } from './de/rig';
import { shotlist } from './de/shotlist';
import { common } from './de/common';
import { mount } from './de/mount';
import { chrome } from './de/chrome';
import { library } from './de/library';

export const de: Record<string, string> = {
  ...sidebar,
  ...header,
  ...preview,
  ...venue,
  ...inventory,
  ...rig,
  ...shotlist,
  ...common,
  ...mount,
  ...chrome,
  ...library,
};
