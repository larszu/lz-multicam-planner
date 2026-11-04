import { describe, it, expect } from 'vitest';
import type { IJsonModel } from 'flexlayout-react';
import { ohneEntfalleneReiter } from '../components/Layout/layoutMigration';
import { TABS } from '../components/Layout/tabs';

const tab = (id: string, component: string) => ({ type: 'tab' as const, id, component, name: id });

describe('Vorschau-Reiter entfaellt (#243)', () => {
  it('steht nicht mehr in der Reiterliste', () => {
    expect(TABS.map((t) => t.id)).not.toContain('tab-preview');
    expect(TABS.map((t) => t.id)).toContain('tab-3d');
  });

  it('altes Fokus-Layout: Reiter weg, Auswahl bleibt auf demselben Reiter', () => {
    const alt: IJsonModel = {
      global: {},
      layout: { type: 'row', children: [{ type: 'tabset', id: 'ts', selected: 3, children: [
        tab('tab-2d', 'venue2d'), tab('tab-3d', 'venue3d'), tab('tab-preview', 'preview'), tab('tab-multiview', 'multiview'),
      ] }] },
    };
    const neu = ohneEntfalleneReiter(alt);
    const ts = neu.layout.children![0] as { children: { id: string }[]; selected: number };
    expect(ts.children.map((c) => c.id)).toEqual(['tab-2d', 'tab-3d', 'tab-multiview']);
    expect(ts.selected).toBe(2);
  });

  it('war die Vorschau gewaehlt, faellt die Wahl auf den Reiter davor', () => {
    const alt: IJsonModel = {
      global: {},
      layout: { type: 'row', children: [{ type: 'tabset', selected: 2, children: [
        tab('tab-2d', 'venue2d'), tab('tab-3d', 'venue3d'), tab('tab-preview', 'preview'),
      ] }] },
    };
    const ts = ohneEntfalleneReiter(alt).layout.children![0] as { selected: number };
    expect(ts.selected).toBe(1);
  });

  it('altes Raster: der leere Block der Vorschau faellt weg', () => {
    const alt: IJsonModel = {
      global: {},
      layout: { type: 'row', children: [
        { type: 'tabset', children: [tab('tab-2d', 'venue2d')] },
        { type: 'row', children: [
          { type: 'tabset', id: 'ts-right-top', children: [tab('tab-preview', 'preview')] },
          { type: 'tabset', id: 'ts-right-mid', children: [tab('tab-multiview', 'multiview')] },
        ] },
      ] },
    };
    const neu = ohneEntfalleneReiter(alt);
    const rechts = neu.layout.children![1] as { children: { id: string }[] };
    expect(rechts.children.map((c) => c.id)).toEqual(['ts-right-mid']);
    expect(JSON.stringify(neu)).not.toContain('preview');
  });

  it('nur Vorschau: es bleibt ein leerer Block', () => {
    const alt: IJsonModel = { global: {}, layout: { type: 'row', children: [{ type: 'tabset', children: [tab('tab-preview', 'preview')] }] } };
    const neu = ohneEntfalleneReiter(alt);
    expect(JSON.stringify(neu)).not.toContain('preview');
  });

  it('ohne Vorschau bleibt das Layout unveraendert', () => {
    const json: IJsonModel = { global: {}, layout: { type: 'row', children: [{ type: 'tabset', selected: 1, children: [tab('tab-2d', 'venue2d'), tab('tab-3d', 'venue3d')] }] } };
    expect(ohneEntfalleneReiter(json)).toEqual(json);
  });
});
