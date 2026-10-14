import { configureTextBuilder } from 'troika-three-text';
import robotoFont from '../../assets/fonts/Roboto-Regular.ttf';

// ── Apple-Silicon / Electron 3D-view fix (issue #35) ──
// drei's <Text> uses troika-three-text, which by default does its font
// typesetting + SDF generation inside a Web Worker created from a Blob URL.
// On some platforms (notably M-series Macs and the sandboxed Electron
// renderer) that worker fails to boot — troika logs
//   "Worker module function was called but `init` did not return a callable function"
// and the glyph promise never resolves. Every label then suspends, so the
// whole <Canvas> stays unmounted behind React's Suspense fallback and the
// panel hangs forever on "Loading 3D View…".
//
// Forcing useWorker:false runs typesetting + SDF generation synchronously on
// the main thread, sidestepping the broken worker entirely. This app only
// renders a handful of short labels, so the cost is negligible. Must be called
// before the first font request (module load time) and against the same troika
// instance drei imports (single hoisted copy in node_modules).
configureTextBuilder({ useWorker: false });

// Bundled label font (Roboto Regular, Apache-2.0 — see assets/fonts/Roboto-LICENSE.txt).
// IMPORTANT: this MUST be a .ttf/.otf/.woff — troika-three-text throws
// "woff2 fonts not supported" on a .woff2, and its loader swallows the error
// without resolving the promise, which was the *second* cause of the infinite
// "Loading 3D View…" hang. Inlined as a base64 data: URL at build time
// (vite.config.ts assetsInlineLimit) so every 3D <Text> renders fully offline —
// no runtime CDN/font fetch, CSP stays strict.
export const LABEL_FONT = robotoFont;
