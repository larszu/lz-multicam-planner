/// <reference types="vite/client" />

// Injected by vite.config.ts from package.json at build time.
declare const __APP_VERSION__: string;

// troika-three-text ships no type declarations. We only use configureTextBuilder
// (to disable its Web Worker — see Venue3D.tsx, issue #35), so a minimal ambient
// declaration is enough.
declare module 'troika-three-text' {
  export function configureTextBuilder(config: {
    useWorker?: boolean;
    sdfGlyphSize?: number;
    defaultFontURL?: string;
    [key: string]: unknown;
  }): void;
}
