import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { useSettingsStore } from '../../stores/settingsStore';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in component tree:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    useSettingsStore.getState().setActiveScreen('home');
  };

  public render() {
    if (this.state.hasError) {
      const t = useSettingsStore.getState().t;

      return (
        <div className="w-full max-w-xl mx-auto my-12 p-6 sm:p-8 rounded-m3-3xl bg-m3-surface-container text-m3-on-surface shadow-lg flex flex-col items-center text-center gap-4 animate-in fade-in duration-200">
          <div className="w-14 h-14 rounded-full bg-m3-error-container text-m3-error flex items-center justify-center">
            <AlertTriangle className="w-7 h-7" />
          </div>

          <div className="flex flex-col gap-1">
            <h2 className="text-lg sm:text-xl font-black font-display">
              {this.props.fallbackTitle || t('somethingWentWrong')}
            </h2>
            <p className="text-xs sm:text-sm text-m3-on-surface-variant max-w-md">
              {t('errorBoundaryDesc')}
            </p>
          </div>

          {this.state.error && (
            <div className="w-full p-3 rounded-m3-xl bg-m3-surface-container-high text-[11px] font-mono text-m3-error text-left overflow-x-auto max-h-32 border border-m3-outline-variant/40">
              {this.state.error.name}: {this.state.error.message}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={this.handleReload}
              className="px-4 py-2.5 rounded-full bg-m3-primary text-m3-on-primary text-xs font-bold font-display flex items-center gap-2 m3-pressable shadow-xs"
            >
              <RefreshCw className="w-4 h-4" />
              <span>{t('refreshPage')}</span>
            </button>

            <button
              onClick={this.handleGoHome}
              className="px-4 py-2.5 rounded-full bg-m3-surface-container-high hover:bg-m3-surface-container-highest text-m3-on-surface text-xs font-bold font-display flex items-center gap-2 m3-pressable"
            >
              <Home className="w-4 h-4" />
              <span>{t('backToOverview')}</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
