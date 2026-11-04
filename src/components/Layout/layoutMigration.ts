import type { IJsonModel, IJsonRowNode, IJsonTabSetNode, IJsonTabNode } from 'flexlayout-react';

// Reiter, die es nicht mehr gibt. Gespeicherte Layouts und eigene Vorlagen
// tragen sie noch; sie fallen beim Laden heraus, statt „Unknown panel" zu zeigen.
// `tab-preview` (#243): der Kamerablick steht in der 3D-Ansicht.
const ENTFALLEN = new Set(['tab-preview']);

type Kind = IJsonRowNode | IJsonTabSetNode | IJsonTabNode;

function entfallen(tab: IJsonTabNode): boolean {
  return (!!tab.id && ENTFALLEN.has(tab.id)) || tab.component === 'preview';
}

function bereinigeTabset(ts: IJsonTabSetNode): IJsonTabSetNode | null {
  const vorher = ts.children ?? [];
  const children = vorher.filter((tab) => !entfallen(tab));
  if (children.length === vorher.length) return ts;
  if (children.length === 0) return null;
  const sel = ts.selected ?? 0;
  const gewaehlt = vorher[sel];
  let selected = gewaehlt ? children.indexOf(gewaehlt) : -1;
  if (selected < 0) {
    const davor = vorher.slice(0, sel).filter((tab) => !entfallen(tab)).length;
    selected = Math.min(davor, children.length - 1);
  }
  return { ...ts, children, selected };
}

function bereinigeRow(row: IJsonRowNode): IJsonRowNode | null {
  const children: (IJsonRowNode | IJsonTabSetNode)[] = [];
  for (const kind of (row.children ?? []) as Kind[]) {
    const neu = kind.type === 'row'
      ? bereinigeRow(kind as IJsonRowNode)
      : kind.type === 'tabset'
        ? bereinigeTabset(kind as IJsonTabSetNode)
        : (kind as IJsonRowNode | IJsonTabSetNode);
    if (neu) children.push(neu);
  }
  return children.length ? { ...row, children } : null;
}

/** Layout ohne entfallene Reiter; leere Bloecke fallen mit weg. */
export function ohneEntfalleneReiter(json: IJsonModel): IJsonModel {
  const layout = bereinigeRow(json.layout) ?? { type: 'row', children: [{ type: 'tabset', children: [] }] };
  const borders = json.borders?.map((b) => ({ ...b, children: (b.children ?? []).filter((tab) => !entfallen(tab)) }));
  return { ...json, layout, ...(borders ? { borders } : {}) };
}
