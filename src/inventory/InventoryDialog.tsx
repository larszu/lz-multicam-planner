// Lager / Bestand — schlanke MultiCam-Ansicht. Teilt das portable
// `avplan-inventory`-Format mit cable- und light-planner: ein in Cable Planner
// gepflegtes Lager (inkl. Lagerorte/Cases/Einheiten) wird hier verlustfrei
// importiert; hier gepflegte Artikel gehen genauso zurück.
import { useMemo, useRef, useState } from 'react';
import { FiX, FiPlus, FiTrash2, FiDownload, FiUpload, FiSearch } from 'react-icons/fi';
import { useInventoryStore, type InventoryItemInput } from './store';
import { serializeInventory, parseInventory, resolveInventoryCode, unitLabel } from './portable';
import type { InventorySnapshot } from './portable';
import type { InventoryItem } from './types';
import { useTranslation, format } from '../i18n';
import {
  VORSCHAU_SORTEN,
  importVorschau,
  vorschauIstLeer,
  vorschauSumme,
  type ImportMode,
  type VorschauSorte,
} from './importPreview';

interface Props {
  open: boolean;
  onClose: () => void;
}

type FormState = InventoryItemInput & { id?: string };

const inputCls = 'w-full border border-bc-border bg-bc-panel-raised p-1.5 text-sm text-bc-text-bright';

/**
 * Deutsche Beschriftung je Datensatz-Sorte.
 *
 * `satisfies Record<VorschauSorte, string>`: kommt eine fuenfte Sorte dazu, ist
 * das hier ein Typfehler und keine leere Zelle in der Vorschau.
 */
const SORTEN_LABEL = {
  items: ['inventory.preview.items', 'Items'],
  nodes: ['inventory.preview.nodes', 'Locations / cases'],
  sets: ['inventory.preview.sets', 'Sets'],
  units: ['inventory.preview.units', 'Units'],
} satisfies Record<VorschauSorte, [string, string]>;

export function InventoryDialog({ open, onClose }: Props) {
  const { t } = useTranslation();
  const items = useInventoryStore((s) => s.items);
  const nodes = useInventoryStore((s) => s.nodes);
  const sets = useInventoryStore((s) => s.sets);
  const units = useInventoryStore((s) => s.units);
  const addItem = useInventoryStore((s) => s.addItem);
  const updateItem = useInventoryStore((s) => s.updateItem);
  const removeItem = useInventoryStore((s) => s.removeItem);
  const exportSnapshot = useInventoryStore((s) => s.exportSnapshot);
  const importSnapshot = useInventoryStore((s) => s.importSnapshot);

  const [form, setForm] = useState<FormState | null>(null);
  const [scan, setScan] = useState('');
  const [scanResult, setScanResult] = useState<string | null>(null);
  /** Gelesene, noch nicht geschriebene Import-Datei samt gewaehltem Modus. */
  const [pending, setPending] = useState<{ snap: InventorySnapshot; mode: ImportMode } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Die Vorschau rechnet gegen den JETZIGEN Bestand — nicht gegen den vom
  // Zeitpunkt des Dateioeffnens. Wer nebenbei einen Artikel anlegt, sieht die
  // Zahlen mitgehen, statt eine Vorschau zu bestaetigen, die nicht mehr gilt.
  const vorschau = useMemo(
    () => (pending ? importVorschau({ items, nodes, sets, units }, pending.snap, pending.mode) : null),
    [pending, items, nodes, sets, units],
  );
  const summe = vorschau ? vorschauSumme(vorschau) : null;

  const sorted = useMemo(
    () => [...items].sort((a, b) => a.model.localeCompare(b.model, undefined, { sensitivity: 'base' })),
    [items],
  );

  if (!open) return null;

  const save = () => {
    if (!form || form.model.trim() === '') return;
    const payload: InventoryItemInput = {
      model: form.model.trim(),
      manufacturer: form.manufacturer?.trim() || undefined,
      category: form.category?.trim() || undefined,
      quantity: Number.isFinite(form.quantity) ? Math.max(0, Math.round(form.quantity)) : 0,
      code: form.code?.trim() || undefined,
      codeType: form.code?.trim() ? form.codeType ?? 'qr' : undefined,
      ownership: form.ownership,
    };
    if (form.id) updateItem(form.id, payload);
    else addItem(payload);
    setForm(null);
  };

  const doExport = () => {
    const json = serializeInventory(exportSnapshot(), { app: 'multicam-planner' });
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lager.avinv.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  // E-15 (B-22): der Import ging ueber ein `window.confirm`, das „ERSETZEN?
  // Abbrechen = zusammenfuehren" fragte. Abbrechen fuehrte also ZUSAMMEN — an
  // dieser Stelle gab es keinen Weg, gar nichts zu tun —, und die Frage stand
  // ohne eine einzige Zahl daneben. Der Bestand ist projektuebergreifend und
  // hat kein Undo; „ersetzen" konnte damit hunderte Positionen loeschen, die
  // der Nutzer nie gesehen hat. Jetzt liegt die Datei zuerst hier und wird
  // erst mit dem bestaetigten Modus geschrieben.
  const doImport = async (file: File) => {
    const snap = parseInventory(await file.text());
    if (!snap) {
      setScanResult(t('inventory.import.invalid', 'Not a valid inventory file (avplan-inventory).'));
      return;
    }
    // Vorbelegung ist die harmlose der beiden Antworten: `merge` nimmt nichts
    // weg. Eine Vorbelegung auf `replace` waere eine Entscheidung, die niemand
    // getroffen hat.
    setPending({ snap, mode: 'merge' });
    setScanResult(null);
  };

  const doImportConfirm = () => {
    if (!pending) return;
    const n = importSnapshot(pending.snap, pending.mode);
    setPending(null);
    // „Importiert" ist erst wahr, wenn es auch geschrieben wurde. Vorher
    // meldete der Dialog den Erfolg, waehrend der volle localStorage den
    // Bestand still verwarf — sichtbar wurde das beim naechsten Start.
    setScanResult(
      useInventoryStore.getState().storageFull
        ? format(
            t(
              'inventory.import.full',
              // Der zweite Satz ist der Grund, warum diese Meldung ueberhaupt
              // gelesen werden muss: der Bestand ist beim naechsten Start
              // WIEDER WEG. Die Suite-Kopie hatte ihn beim Uebersetzen
              // verloren — englisch wie deutsch stand dort nur noch „erst
              // Platz schaffen, dann erneut importieren", also eine
              // Handlungsanweisung ohne die Folge, die sie noetig macht.
              '{count} objects read but NOT saved: local storage is full. The stock will be gone at the next start — free some space, then import again.',
            ),
            { count: n },
          )
        : format(t('inventory.import.done', '{count} objects imported.'), { count: n }),
    );
  };

  const doScan = () => {
    const code = scan.trim();
    if (!code) return;
    const m = resolveInventoryCode(code, { items, nodes, units });
    if (!m) setScanResult(format(t('inventory.scan.noMatch', 'No match for "{code}".'), { code }));
    else if (m.kind === 'item') {
      setScanResult(format(t('inventory.scan.item', 'Item: {model}'), { model: m.item.model }));
      setForm({ ...m.item });
    } else if (m.kind === 'node') setScanResult(format(t('inventory.scan.node', 'Location: {name}'), { name: m.node.name }));
    else setScanResult(format(t('inventory.scan.unit', 'Unit: {label}'), { label: unitLabel(m.unit) }));
    setScan('');
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-bc-scrim p-4">
      <div className="bc-dialog flex max-h-[90vh] w-full max-w-3xl flex-col text-bc-text-bright">
        <header className="flex shrink-0 items-center justify-between px-5 pt-4 pb-2">
          <h2 className="text-lg font-bold">{t('inventory.title', 'Warehouse / Inventory')}</h2>
          <button type="button" onClick={onClose} className="grid place-items-center rounded-bc-full p-1 text-bc-muted hover:bg-bc-hover hover:text-bc-text-bright" aria-label={t('inventory.close', 'Close')}>
            <FiX size={18} />
          </button>
        </header>

        <div className="space-y-3 overflow-auto px-5 pt-2 pb-5 text-sm">
          {/* Scan + actions */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[10rem]">
              <FiSearch className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-bc-dim" size={13} />
              <input
                value={scan}
                onChange={(e) => setScan(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && doScan()}
                placeholder={t('inventory.scanPlaceholder', 'Scan / enter a code (item, location, unit)…')}
                className={`${inputCls} pl-7`}
              />
            </div>
            <button type="button" onClick={doScan} className="bc-btn-soft px-3 py-1.5">{t('inventory.resolve', 'Resolve')}</button>
            <button type="button" onClick={doExport} className="bc-btn-soft px-3 py-1.5" title={t('inventory.export.title', 'Export (cross-app)')}>
              <FiDownload size={13} /> {t('inventory.export', 'Export')}
            </button>
            <button type="button" onClick={() => fileRef.current?.click()} className="bc-btn-soft px-3 py-1.5" title={t('inventory.import.title', 'Import')}>
              <FiUpload size={13} /> {t('inventory.import', 'Import')}
            </button>
            <button type="button" onClick={() => setForm({ model: '', quantity: 1 })} className="bc-btn-primary px-3 py-1.5">
              <FiPlus size={13} /> {t('inventory.addItem', 'Item')}
            </button>
          </div>
          {scanResult && <div className="border border-bc-border bg-bc-panel-raised px-2 py-1 text-bc-text">{scanResult}</div>}

          {/* Import-Vorschau (E-15): was jeder der beiden Modi taete, bevor
              einer davon es tut. */}
          {pending && vorschau && summe && (
            <div className="rounded-bc-m border border-bc-border bg-bc-panel-raised p-3">
              <div className="mb-2 font-medium">{t('inventory.preview.title', 'What this import changes')}</div>

              {/* Der Modus steht UEBER der Tabelle: das Umschalten rechnet sie
                  neu, und genau dieser Vergleich ist die Entscheidung. */}
              <div role="radiogroup" aria-label={t('inventory.preview.title', 'What this import changes')} className="mb-2 flex flex-wrap items-center gap-2">
                {(['merge', 'replace'] as ImportMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={pending.mode === m}
                    onClick={() => setPending({ ...pending, mode: m })}
                    className={
                      pending.mode === m
                        ? 'rounded-bc-full  bg-bc-accent px-2.5 py-1.5 text-bc-accent-text'
                        : ' bg-bc-panel px-2.5 py-1.5 hover:bg-bc-sunken'
}
                  >
                    {m === 'merge'
                      ? t('inventory.preview.merge', 'Merge')
                      : t('inventory.preview.replace', 'Replace')}
                  </button>
                ))}
                <span className="text-xs text-bc-muted">
                  {pending.mode === 'merge'
                    ? t('inventory.preview.mergeHint', 'Carried forward — nothing is dropped.')
                    : t('inventory.preview.replaceHint', 'The existing inventory is discarded.')}
                </span>
              </div>

              <div className="overflow-x-auto rounded-bc-m border border-bc-border">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="bg-bc-panel text-bc-muted">
                    <tr>
                      <th className="px-2 py-1 font-medium"></th>
                      <th className="px-2 py-1 text-right font-medium">{t('inventory.preview.new', 'new')}</th>
                      <th className="px-2 py-1 text-right font-medium">{t('inventory.preview.changed', 'changed')}</th>
                      <th className="px-2 py-1 text-right font-medium">{t('inventory.preview.same', 'unchanged')}</th>
                      <th className="px-2 py-1 text-right font-medium">
                        {pending.mode === 'replace'
                          ? t('inventory.preview.removed', 'dropped')
                          : t('inventory.preview.untouched', 'kept')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {VORSCHAU_SORTEN.map((sorte) => (
                      <tr key={sorte} className="border-t border-bc-border/60">
                        <td className="px-2 py-1">{t(SORTEN_LABEL[sorte][0], SORTEN_LABEL[sorte][1])}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{vorschau[sorte].neu.length}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{vorschau[sorte].geaendert.length}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{vorschau[sorte].gleich.length}</td>
                        <td
                          className={`px-2 py-1 text-right tabular-nums ${
                            pending.mode === 'replace' && vorschau[sorte].entfernt.length > 0 ? 'text-red-300' : ''
                          }`}
                        >
                          {pending.mode === 'replace' ? vorschau[sorte].entfernt.length : vorschau[sorte].unberuehrt.length}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Die eine Zahl, die nicht rueckgaengig zu machen ist, wird
                  ausgeschrieben statt nur in einer Spalte zu stehen. */}
              {summe.entfernt > 0 && (
                <div className="mt-2 text-bc-red-text">
                  {format(
                    t('inventory.preview.removes', '{count} existing records will be dropped. This cannot be undone.'),
                    { count: summe.entfernt },
                  )}
                </div>
              )}
              {vorschauIstLeer(vorschau) && (
                <div className="mt-2 text-bc-muted">{t('inventory.preview.nothing', 'This file changes nothing in the inventory.')}</div>
              )}

              <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={() => setPending(null)} className="bc-btn-soft px-3 py-1">{t('inventory.preview.cancel', 'Cancel')}</button>
                <button type="button" onClick={doImportConfirm} className="bc-btn-primary px-3 py-1">{t('inventory.preview.apply', 'Import')}</button>
              </div>
            </div>
          )}

          {/* Add/Edit */}
          {form && (
            <div className="rounded-bc-l bg-bc-panel-raised p-3">
              <div className="mb-2 font-medium">{form.id ? t('inventory.editItem', 'Edit item') : t('inventory.newItem', 'New item')}</div>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                <label className="block">{t('inventory.field.model', 'Model *')}<input autoFocus value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className={inputCls} /></label>
                <label className="block">{t('inventory.field.manufacturer', 'Manufacturer')}<input value={form.manufacturer ?? ''} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} className={inputCls} /></label>
                <label className="block">{t('inventory.field.category', 'Category')}<input value={form.category ?? ''} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputCls} /></label>
                <label className="block">{t('inventory.field.quantity', 'Quantity')}<input type="number" min={0} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} className={inputCls} /></label>
                <label className="block">{t('inventory.field.code', 'Code')}<input value={form.code ?? ''} onChange={(e) => setForm({ ...form, code: e.target.value })} className={inputCls} /></label>
                <label className="block">{t('inventory.field.ownership', 'Ownership')}
                  <select value={form.ownership ?? ''} onChange={(e) => setForm({ ...form, ownership: (e.target.value || undefined) as InventoryItem['ownership'] })} className={inputCls}>
                    <option value="">{t('inventory.ownership.none', '—')}</option>
                    <option value="owned">{t('inventory.ownership.owned', 'Owned')}</option>
                    <option value="rented">{t('inventory.ownership.rented', 'Rented')}</option>
                    <option value="subhire">{t('inventory.ownership.subhire', 'Sub-hire')}</option>
                  </select>
                </label>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={() => setForm(null)} className="bc-btn-soft px-3 py-1">{t('inventory.cancel', 'Cancel')}</button>
                <button type="button" disabled={form.model.trim() === ''} onClick={save} className="bc-btn-primary px-3 py-1">{t('inventory.save', 'Save')}</button>
              </div>
            </div>
          )}

          {/* Table */}
          {sorted.length === 0 ? (
            <div className="rounded-bc-l border border-dashed border-bc-border-strong py-10 text-center text-bc-dim">
              {t('inventory.empty', 'No inventory items yet. Create some or import an inventory from Cable/Light Planner.')}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-bc-m border border-bc-border">
              <table className="w-full border-collapse text-left">
                <thead className="bg-bc-panel-raised text-bc-muted">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">{t('inventory.col.model', 'Model')}</th>
                    <th className="px-2 py-1.5 text-right font-medium">{t('inventory.col.quantity', 'Quantity')}</th>
                    <th className="px-2 py-1.5 font-medium">{t('inventory.col.code', 'Code')}</th>
                    <th className="px-2 py-1.5 font-medium">{t('inventory.col.ownership', 'Ownership')}</th>
                    <th className="px-2 py-1.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((it) => (
                    <tr key={it.id} className="border-t border-bc-border/60 hover:bg-bc-dark">
                      <td className="px-2 py-1.5">{it.model}{it.manufacturer && <span className="ml-1 text-bc-dim">· {it.manufacturer}</span>}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{it.quantity}</td>
                      <td className="px-2 py-1.5 text-bc-text">{it.code ?? '—'}</td>
                      <td className="px-2 py-1.5 text-bc-text">{it.ownership ?? '—'}</td>
                      <td className="px-2 py-1.5">
                        <div className="flex justify-end gap-1">
                          <button type="button" onClick={() => setForm({ ...it })} className="px-2 py-0.5 text-xs text-bc-muted hover:bg-bc-border hover:text-bc-text-bright">{t('inventory.edit', 'Edit')}</button>
                          <button type="button" onClick={() => removeItem(it.id)} className="p-1 text-bc-muted hover:bg-bc-hover hover:text-bc-red-text" aria-label={t('inventory.delete', 'Delete')}><FiTrash2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(nodes.length > 0 || units.length > 0) && (
            <div className="text-xs text-bc-dim">
              {format(t('inventory.extras', '+ {nodes} locations/cases · {units} serialized units (from import, preserved losslessly)'), { nodes: nodes.length, units: units.length })}
            </div>
          )}
        </div>

        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void doImport(f); e.target.value = ''; }} />
      </div>
    </div>
  );
}
