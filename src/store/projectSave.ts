// Speichern und Speichern unter (#199).
//
// Vorher legte „Speichern" bei jedem Aufruf einen Download an — im Browser
// mit Dialog, in der Desktop-App ebenso — und „Speichern unter" fragte nur
// nach einem Namen und tat dann dasselbe. Beide waren „Speichern unter".
//
// Jetzt merkt sich die App das ZIEL der zuletzt geoeffneten oder
// gespeicherten Datei:
//   - Desktop-App: den Dateipfad (Dialog und Schreiben im Hauptprozess);
//   - Browser mit File System Access API (Chrome, Edge): den FileHandle;
//   - uebrige Browser: nur den Namen. Sie koennen keine Datei ueberschreiben,
//     also laedt jedes Speichern neu herunter — mit Hinweis.
// „Speichern" schreibt ohne Dialog in dieses Ziel; ohne Ziel verhaelt es sich
// wie „Speichern unter", das immer nach Name und Ort fragt.
//
// Das Ziel gehoert zu genau einem geoeffneten Projekt: `projectEpoch` zaehlt
// jedes Oeffnen/Neu. Wechselt die Epoche ohne uns (Neu, Wiederherstellen,
// .avplan-Import), ist das Ziel verfallen — sonst schriebe ein „Speichern"
// nach „Neues Projekt" ueber die vorige Datei.
import { useSyncExternalStore } from 'react';
import { buildProjectFile, defaultProjectFileName, useStore } from './useStore';
import type { ProjectFile } from '../types';

/** Bruecke aus `electron/preload.cjs`. */
export interface ProjectFileBridge {
  saveAs(defaultName: string, text: string): Promise<{ path: string; name: string } | null>;
  write(path: string, text: string): Promise<boolean>;
  open(): Promise<{ path: string; name: string; text: string } | null>;
  setDocumentState(state: { path: string | null; edited: boolean }): void;
}

interface FsPickerType { description: string; accept: Record<string, string[]> }
interface FsWindow {
  showSaveFilePicker?: (o: { suggestedName?: string; types?: FsPickerType[] }) => Promise<FileSystemFileHandle>;
  showOpenFilePicker?: (o: { types?: FsPickerType[]; multiple?: boolean }) => Promise<FileSystemFileHandle[]>;
  multicamProjectFile?: ProjectFileBridge;
}
type PermissionHandle = FileSystemFileHandle & {
  queryPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>;
};

export type SaveTarget =
  | { kind: 'electron'; name: string; path: string }
  | { kind: 'handle'; name: string; handle: FileSystemFileHandle }
  | { kind: 'download'; name: string };

export type SaveResult = 'saved' | 'downloaded' | 'cancelled' | 'failed';

const PICKER_TYPES: FsPickerType[] = [{ description: 'LZ Multicam Planner project', accept: { 'application/json': ['.mcplan'] } }];

const win = (): FsWindow => (typeof window === 'undefined' ? {} : (window as unknown as FsWindow));
const bridge = () => win().multicamProjectFile;

let target: SaveTarget | null = null;
/** Name der offenen Datei, auch ohne Schreibziel (klassisches Datei-Feld). */
let openedName: string | null = null;
let targetEpoch = -1;
let notice: string | null = null;
let noticeTimer: ReturnType<typeof setTimeout> | null = null;
let version = 0;
const listeners = new Set<() => void>();
const notify = () => { version++; listeners.forEach((l) => l()); };

/** Ziel des offenen Projekts, oder null, wenn es (noch) keines hat. */
export function currentTarget(): SaveTarget | null {
  return target && targetEpoch === useStore.getState().projectEpoch ? target : null;
}

const currentName = (): string | null =>
  targetEpoch === useStore.getState().projectEpoch ? openedName : null;

function setTarget(t: SaveTarget | null, name: string | null = t?.name ?? null) {
  target = t;
  openedName = name;
  targetEpoch = useStore.getState().projectEpoch;
  notify();
}

function setNotice(text: string | null) {
  notice = text;
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = text ? setTimeout(() => setNotice(null), 8000) : null;
  notify();
}

const ensureExtension = (name: string) => (/\.mcplan$/i.test(name) ? name : `${name}.mcplan`);

function serialise(): { project: ProjectFile; text: string } {
  const project = buildProjectFile(useStore.getState());
  return { project, text: JSON.stringify(project, null, 2) };
}

/** Die gespeicherte Version gilt als gesichert — nicht die von jetzt: wer
 *  waehrend eines langsamen Schreibens weiterarbeitet, bleibt „ungesichert". */
const markSaved = (project: ProjectFile) => useStore.setState({ lastSavedVersion: project.projectVersion });

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

async function writeHandle(handle: FileSystemFileHandle, text: string): Promise<boolean> {
  const h = handle as PermissionHandle;
  if (h.queryPermission && (await h.queryPermission({ mode: 'readwrite' })) !== 'granted') {
    if (!h.requestPermission || (await h.requestPermission({ mode: 'readwrite' })) !== 'granted') return false;
  }
  const w = await handle.createWritable();
  await w.write(text);
  await w.close();
  return true;
}

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

export interface SaveTexts {
  /** Frage nach dem Namen, nur im Download-Weg. */
  promptName: string;
  /** Hinweis nach einem Download; `{name}` wird ersetzt. */
  downloaded: string;
  failed: string;
}

async function writeTo(t: SaveTarget, text: string, texts: SaveTexts): Promise<SaveResult> {
  if (t.kind === 'electron') return (await bridge()?.write(t.path, text)) ? 'saved' : 'failed';
  if (t.kind === 'handle') return (await writeHandle(t.handle, text)) ? 'saved' : 'failed';
  download(t.name, text);
  setNotice(texts.downloaded.replace('{name}', t.name));
  return 'downloaded';
}

/** „Speichern": ohne Dialog ins bekannte Ziel, sonst wie „Speichern unter". */
export async function saveProject(texts: SaveTexts): Promise<SaveResult> {
  const t = currentTarget();
  if (!t) return saveProjectAs(texts);
  const { project, text } = serialise();
  try {
    const r = await writeTo(t, text, texts);
    if (r === 'failed') { setNotice(texts.failed); return r; }
    markSaved(project);
    if (r === 'saved') setNotice(null);
    return r;
  } catch (e) {
    if (isAbort(e)) return 'cancelled';
    setNotice(texts.failed);
    return 'failed';
  }
}

/** „Speichern unter": fragt immer nach Name und Ort. */
export async function saveProjectAs(texts: SaveTexts): Promise<SaveResult> {
  const { project, text } = serialise();
  const vorschlag = currentName() ?? defaultProjectFileName(project);
  try {
    const b = bridge();
    if (b) {
      const r = await b.saveAs(vorschlag, text);
      if (!r) return 'cancelled';
      setTarget({ kind: 'electron', name: r.name, path: r.path });
      markSaved(project);
      setNotice(null);
      return 'saved';
    }
    const picker = win().showSaveFilePicker;
    if (picker) {
      const handle = await picker({ suggestedName: vorschlag, types: PICKER_TYPES });
      if (!(await writeHandle(handle, text))) { setNotice(texts.failed); return 'failed'; }
      setTarget({ kind: 'handle', name: handle.name, handle });
      markSaved(project);
      setNotice(null);
      return 'saved';
    }
    const name = window.prompt(texts.promptName, vorschlag);
    if (!name?.trim()) return 'cancelled';
    const t: SaveTarget = { kind: 'download', name: ensureExtension(name.trim()) };
    setTarget(t);
    await writeTo(t, text, texts);
    markSaved(project);
    return 'downloaded';
  } catch (e) {
    if (isAbort(e)) return 'cancelled';
    setNotice(texts.failed);
    return 'failed';
  }
}

/** Ob „Oeffnen" ein Schreibziel liefern kann (Desktop oder File System Access). */
export const canOpenWithTarget = (): boolean => !!bridge() || typeof win().showOpenFilePicker === 'function';

/**
 * „Oeffnen" mit Ziel. Liefert false, wenn weder Desktop-Bruecke noch
 * Datei-Picker da sind — dann oeffnet der Aufrufer das klassische Datei-Feld
 * und `openedFromInput` merkt sich den Namen.
 */
export async function openProjectWithTarget(): Promise<boolean> {
  const b = bridge();
  try {
    if (b) {
      const r = await b.open();
      if (!r) return true;
      useStore.getState().applyProjectFile(JSON.parse(r.text) as ProjectFile);
      setTarget({ kind: 'electron', name: r.name, path: r.path });
      return true;
    }
    const picker = win().showOpenFilePicker;
    if (!picker) return false;
    const [handle] = await picker({ types: PICKER_TYPES, multiple: false });
    if (!handle) return true;
    const file = await handle.getFile();
    useStore.getState().applyProjectFile(JSON.parse(await file.text()) as ProjectFile);
    setTarget({ kind: 'handle', name: handle.name, handle });
    return true;
  } catch (e) {
    if (!isAbort(e)) console.error('[multicam] open failed', e);
    return true;
  }
}

/** Datei aus dem klassischen Datei-Feld: kein Schreibziel, aber der Name
 *  wird der Vorschlag fuer das erste Speichern. */
export async function openedFromInput(file: File): Promise<void> {
  await useStore.getState().loadProject(file);
  setTarget(null, file.name);
}

export interface ProjectFileState {
  /** Name der Datei, in die „Speichern" schreibt, sonst null. */
  fileName: string | null;
  /** Ob „Speichern" ohne Dialog ueberschreibt (Desktop, File System Access). */
  inPlace: boolean;
  notice: string | null;
}

let snapshot: ProjectFileState = { fileName: null, inPlace: false, notice: null };
let snapshotKey = '';
function getSnapshot(): ProjectFileState {
  const t = currentTarget();
  const key = `${version}|${useStore.getState().projectEpoch}`;
  if (key !== snapshotKey) {
    snapshotKey = key;
    snapshot = {
      fileName: currentName(),
      inPlace: t?.kind === 'electron' || t?.kind === 'handle',
      notice,
    };
  }
  return snapshot;
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  const unsub = useStore.subscribe((s, prev) => { if (s.projectEpoch !== prev.projectEpoch) fn(); });
  return () => { listeners.delete(fn); unsub(); };
}

export function useProjectFileState(): ProjectFileState {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** Nur fuer Tests: Ziel und Hinweis zuruecksetzen. */
export function resetProjectFileForTests() {
  target = null;
  openedName = null;
  targetEpoch = -1;
  setNotice(null);
}

export function reportDocumentState(path: string | null, edited: boolean) {
  bridge()?.setDocumentState({ path, edited });
}

export function currentElectronPath(): string | null {
  const t = currentTarget();
  return t?.kind === 'electron' ? t.path : null;
}
