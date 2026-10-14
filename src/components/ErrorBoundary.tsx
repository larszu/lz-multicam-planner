import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { translate } from '../i18n';
import { useStore } from '../store/useStore';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Uncaught error in React tree:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      // KEIN Hook: eine Klassen-Komponente hat keinen, und `useTranslation`
      // hier zu rufen waere ein Fehler. Die Sprache kommt deshalb direkt aus
      // dem Store — und zwar erst hier, im Fehlerfall. Wer sie im Konstruktor
      // liest, friert sie beim Erzeugen ein und zeigt nach einem
      // Sprachwechsel die alte.
      //
      // `getState()` statt Abonnement, weil dieser Zweig nur einmal gerendert
      // wird: danach laedt der Nutzer die Seite neu, das ist der einzige
      // Knopf darin.
      const lang = useStore.getState().language;
      const t = (key: string, en: string) => translate(lang, key, en);
      return (
        <div className="bg-bc-dark text-bc-red-text" style={{ padding: 32, minHeight: '100vh' }}>
          <h1 style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 12 }}>{t('error.title', 'Something went wrong')}</h1>
          <p className="text-bc-text" style={{ marginBottom: 16 }}>
            {t('error.hint', 'The application encountered an unexpected error. Try refreshing the page.')}
          </p>
          <pre className="text-bc-muted" style={{ fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {this.state.error?.message}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="bc-btn-primary"
            style={{ marginTop: 16, padding: '8px 20px', fontSize: 14 }}
          >
            {t('error.reload', 'Reload')}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
