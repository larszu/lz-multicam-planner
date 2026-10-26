/**
 * Deutsches Override-Dictionary für MultiCam, aus Domänen-Teildicts komponiert.
 * Englisch bleibt Quell-Sprache (Fallback im JSX via t(key, 'English')).
 */
import { sidebar } from './de/sidebar';
import { header } from './de/header';
import { preview } from './de/preview';
import { multiview } from './de/multiview';
import { firstSteps } from './de/firstSteps';
import { venue } from './de/venue';
import { inventory } from './de/inventory';
import { rig } from './de/rig';
import { shotlist } from './de/shotlist';
import { common } from './de/common';
import { mount } from './de/mount';
import { chrome } from './de/chrome';
import { library } from './de/library';
import { room } from './de/room';
import { ai } from './de/ai';
import { bridge } from './de/bridge';

export const de: Record<string, string> = {
  ...sidebar,
  ...header,
  ...preview,
  ...multiview,
  ...firstSteps,
  ...venue,
  ...inventory,
  ...rig,
  ...shotlist,
  ...common,
  ...mount,
  ...chrome,
  ...library,
  ...room,
  ...ai,
  ...bridge,
};
