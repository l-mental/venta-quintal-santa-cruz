import React, { useEffect, useRef, useState } from 'react';
import {
  Bell,
  AlertTriangle,
  Clock,
  CheckCircle2,
  X,
  ArrowRight,
  CheckCheck,
} from 'lucide-react';
import type { AlertCategory, AppNotification, ToastMessage } from '../lib/notifications.ts';
import type { NavSection } from './Sidebar.tsx';

interface NotificationBellProps {
  notifications: AppNotification[];
  dismissedIds: string[];
  onDismiss: (id: string) => void;
  onDismissAll: () => void;
  onNavigate: (section: NavSection) => void;
}

export function NotificationBell({
  notifications,
  dismissedIds,
  onDismiss,
  onDismissAll,
  onNavigate,
}: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'TODAS' | AlertCategory>('TODAS');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  const activeAlerts = notifications.filter((n) => !dismissedIds.includes(n.id));
  const urgentCount = activeAlerts.filter((n) => n.severity !== 'INFO').length;
  const visible =
    filter === 'TODAS' ? activeAlerts : activeAlerts.filter((n) => n.category === filter);

  const categoryLabels: Record<'TODAS' | AlertCategory, string> = {
    TODAS: 'Todas',
    STOCK: 'Stock',
    COBRANZA: 'Cobranzas',
    PAGOS: 'Proveedores',
    INTERNEGOCIOS: 'Entre Negocios',
    SISTEMA: 'Respaldos',
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
        aria-label={`Notificaciones (${urgentCount} pendientes)`}
      >
        <Bell className="w-4 h-4 text-slate-600 dark:text-slate-300" />
        <span className="hidden md:inline">Alertas</span>
        {urgentCount > 0 && (
          <span className="font-mono tabular-nums font-bold text-[11px] px-1.5 py-0.5 rounded bg-[#15803D] text-white leading-none">
            {urgentCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[340px] sm:w-[420px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg z-50 overflow-hidden flex flex-col max-h-[80vh]">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
            <div>
              <h3 className="font-display font-bold text-sm text-slate-900 dark:text-slate-100">
                Centro de Notificaciones
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {activeAlerts.length} alerta(s) operativa(s) en tiempo real
              </p>
            </div>
            {activeAlerts.length > 0 && (
              <button
                type="button"
                onClick={onDismissAll}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-[#15803D] dark:text-emerald-400 hover:underline"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Marcar leídas</span>
              </button>
            )}
          </div>

          {/* Category filter bar */}
          <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-1 overflow-x-auto bg-slate-50/70 dark:bg-slate-800/40">
            {(['TODAS', 'STOCK', 'COBRANZA', 'PAGOS', 'INTERNEGOCIOS', 'SISTEMA'] as const).map(
              (cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setFilter(cat)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors ${
                    filter === cat
                      ? 'bg-[#15803D] text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700'
                  }`}
                >
                  {categoryLabels[cat]}
                </button>
              )
            )}
          </div>

          {/* Alerts List */}
          <div className="overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {visible.length === 0 ? (
              <div className="p-8 text-center space-y-1.5">
                <CheckCircle2 className="w-7 h-7 text-emerald-600 dark:text-emerald-400 mx-auto" />
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Todo al día
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  No hay alertas pendientes en esta categoría.
                </p>
              </div>
            ) : (
              visible.map((alert) => (
                <div
                  key={alert.id}
                  className="p-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      {alert.severity === 'ALTA' ? (
                        <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                      ) : alert.severity === 'MEDIA' ? (
                        <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-[#15803D] dark:text-emerald-400 shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {alert.title}
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                          {alert.description}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onDismiss(alert.id)}
                      className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0"
                      title="Ocultar alerta"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between pl-6 text-[11px]">
                    <span className="text-slate-400 dark:text-slate-500 font-medium">
                      {categoryLabels[alert.category]} · Prioridad {alert.severity}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        onNavigate(alert.targetSection);
                        setOpen(false);
                      }}
                      className="inline-flex items-center gap-1 font-semibold text-[#15803D] dark:text-emerald-400 hover:underline"
                    >
                      <span>{alert.actionLabel}</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onRemove: (id: string) => void;
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-[320px] sm:w-[360px] pointer-events-none no-print">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-md p-3.5 flex items-start justify-between gap-3"
        >
          <div className="flex items-start gap-2.5 min-w-0">
            {t.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            ) : t.type === 'warning' ? (
              <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-[#15803D] dark:text-emerald-400 shrink-0 mt-0.5" />
            )}
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                {t.title}
              </div>
              {t.detail && (
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {t.detail}
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onRemove(t.id)}
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 shrink-0"
            aria-label="Cerrar notificación"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
