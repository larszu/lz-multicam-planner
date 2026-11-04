import { useEffect, useState } from 'react';
import { useTranslation } from '../../i18n';
import { clientConfig, mcpBridge, type McpStatus } from '../../mcp/mcpBridge';

/** #218 — der lokale MCP-Server: aus als Vorgabe, Schreiben ist ein eigener Schalter. */
export default function McpSection() {
  const { t } = useTranslation();
  const bridge = mcpBridge();
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [kopiert, setKopiert] = useState(false);

  useEffect(() => {
    let aktiv = true;
    bridge?.status().then((s) => { if (aktiv) setStatus(s); }).catch(() => {});
    return () => { aktiv = false; };
  }, [bridge]);

  if (!bridge) {
    return (
      <section>
        <p className="text-xs text-bc-muted">{t('settings.mcp.desktopOnly', 'The assistant connection (MCP) is part of the desktop app.')}</p>
      </section>
    );
  }

  const setzen = async (wunsch: { enabled: boolean; writeAllowed: boolean }) => setStatus(await bridge.set(wunsch));

  return (
    <section>
      <p className="text-xs text-bc-muted">
        {t('settings.mcp.desc', 'Lets an AI assistant on this computer read the plan and work in it step by step: place a camera, aim it, frame a shot, render the camera view or the top view, undo. Only reachable from this computer and only with the token. Access data (library, AI keys, bridge) is never offered.')}
      </p>
      <label className="mt-3 flex items-center gap-2 text-xs text-bc-text">
        <input
          type="checkbox"
          checked={!!status?.enabled}
          onChange={(e) => void setzen({ enabled: e.target.checked, writeAllowed: !!status?.writeAllowed })}
        />
        {t('settings.mcp.enable', 'Allow assistant connection (read)')}
      </label>
      <label className="mt-2 flex items-center gap-2 text-xs text-bc-text">
        <input
          type="checkbox"
          disabled={!status?.enabled}
          checked={!!status?.writeAllowed}
          onChange={(e) => void setzen({ enabled: !!status?.enabled, writeAllowed: e.target.checked })}
        />
        {t('settings.mcp.write', 'Assistant may change the plan (every change is one undo step)')}
      </label>
      {status?.running && (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-xs text-bc-text select-text">{status.url}</p>
          {status.fallbackPort && (
            <p className="text-xs text-bc-yellow-text">{t('settings.mcp.fallback', 'The usual port was busy; the address changed for this session.')}</p>
          )}
          <button
            type="button"
            className="self-start rounded-bc-full border border-bc-border bg-bc-panel-raised text-xs text-bc-text hover:bg-bc-hover"
            style={{ padding: '6px 12px' }}
            onClick={async () => {
              const token = await bridge.token();
              await navigator.clipboard.writeText(clientConfig(status.url, token));
              setKopiert(true);
            }}
          >
            {kopiert ? t('settings.mcp.copied', 'Copied') : t('settings.mcp.copy', 'Copy client configuration')}
          </button>
        </div>
      )}
    </section>
  );
}
