import { useEffect } from 'react';
import { werkzeugAusfuehren, type WerkzeugAntwort } from './werkzeuge';

export interface McpStatus {
  enabled: boolean;
  writeAllowed: boolean;
  running: boolean;
  url: string;
  fallbackPort: boolean;
}

interface McpBridge {
  status: () => Promise<McpStatus>;
  set: (wunsch: { enabled: boolean; writeAllowed: boolean }) => Promise<McpStatus>;
  token: () => Promise<string>;
  serve: (handler: (name: string, args: Record<string, unknown>) => Promise<WerkzeugAntwort>) => () => void;
}

/** Nur in der Desktop-App vorhanden; im Browser gibt es keinen MCP-Server. */
export const mcpBridge = (): McpBridge | undefined =>
  typeof window === 'undefined' ? undefined : (window as unknown as { multicamMcp?: McpBridge }).multicamMcp;

/** Beantwortet die Werkzeugaufrufe des Hauptprozesses aus dem Store. */
export function useMcpServe() {
  useEffect(() => mcpBridge()?.serve(werkzeugAusfuehren), []);
}

/** Eintrag fuer die Client-Konfiguration (Streamable HTTP mit Bearer-Token). */
export function clientConfig(url: string, token: string): string {
  return JSON.stringify(
    { mcpServers: { 'lz-multicam-planner': { type: 'http', url, headers: { Authorization: `Bearer ${token}` } } } },
    null,
    2,
  );
}
