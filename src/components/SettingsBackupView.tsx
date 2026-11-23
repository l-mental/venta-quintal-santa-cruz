import React, { useState } from 'react';
import { Database, Download, RotateCcw, Save, History } from 'lucide-react';
import { apiRequest, type WorkspaceData } from '../lib/api.ts';
import { formatDateTime } from '../lib/format.ts';
import type { ToastMessage } from '../lib/notifications.ts';

interface SettingsBackupViewProps {
  data: WorkspaceData;
  onRefresh: () => Promise<void>;
  onToast?: (toast: Omit<ToastMessage, 'id'>) => void;
}

export function SettingsBackupView({ data, onRefresh, onToast }: SettingsBackupViewProps) {
  const { business, currentUser, backups, auditLogs } = data;
  const [nombre, setNombre] = useState(business.nombre);
  const [ciudad, setCiudad] = useState(business.ciudad);
  const [telefono, setTelefono] = useState(business.telefono);
  const [permitirKilo, setPermitirKilo] = useState(business.configuracion.permitirVentaPorKilo);
  const [autoAbrir, setAutoAbrir] = useState(business.configuracion.autoAbrirQuintalEnVenta);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    setError('');
    try {
      await apiRequest('/api/business/config', {
        method: 'PATCH',
        body: {
          nombre,
          ciudad,
          telefono,
          permitirVentaPorKilo: permitirKilo,
          autoAbrirQuintalEnVenta: autoAbrir,
        },
        userId: currentUser.id,
        businessId: business.id,
      });
      setMsg('Configuración del negocio actualizada.');
      onToast?.({
        type: 'success',
        title: 'Configuración guardada',
        detail: `${nombre} · Venta por kilo ${permitirKilo ? 'habilitada' : 'desactivada'}`,
      });
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar configuración');
    } finally {
      setBusy(false);
    }
  };

  const handleManualBackup = async () => {
    setBusy(true);
    setMsg('');
    try {
      await apiRequest('/api/backups/create', {
        method: 'POST',
        userId: currentUser.id,
        businessId: business.id,
      });
      setMsg('Copia de seguridad manual creada y guardada en servidor.');
      onToast?.({
        type: 'success',
        title: 'Respaldo creado en servidor',
        detail: 'Copia completa guardada correctamente.',
      });
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear respaldo');
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadBackup = async () => {
    try {
      const res = await fetch('/api/backups/download', {
        headers: {
          'x-user-id': currentUser.id,
          'x-business-id': business.id,
        },
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `respaldo_central_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onToast?.({
        type: 'info',
        title: 'Respaldo descargado',
        detail: 'Archivo JSON guardado en su equipo.',
      });
    } catch {
      setError('No se pudo descargar el respaldo.');
    }
  };

  const handleResetDemo = async () => {
    setBusy(true);
    try {
      await apiRequest('/api/backups/reset-demo', {
        method: 'POST',
        userId: currentUser.id,
        businessId: business.id,
      });
      setMsg('Datos iniciales restaurados correctamente.');
      onToast?.({
        type: 'warning',
        title: 'Datos demo restaurados',
        detail: 'Los tres negocios volvieron a su estado inicial.',
      });
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al restaurar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display font-bold text-2xl text-slate-900 dark:text-slate-100">
          Configuración, Respaldos y Auditoría
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Ajustes independientes de {business.nombre}, copias de seguridad automáticas e historial inmutable.
        </p>
      </div>

      {msg && (
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-700 dark:text-emerald-300">
          {msg}
        </div>
      )}
      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Business Settings */}
        <form
          onSubmit={handleSaveConfig}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4 text-xs"
        >
          <h2 className="font-display font-bold text-base text-slate-900 dark:text-slate-100">
            Modalidad de Venta y Datos de {business.nombreCorto}
          </h2>
          <div>
            <label className="block font-medium mb-1">Nombre comercial del negocio</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium mb-1">Ciudad</label>
              <input
                type="text"
                value={ciudad}
                onChange={(e) => setCiudad(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Teléfono</label>
              <input
                type="text"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
          </div>

          <div className="pt-2 space-y-3 border-t border-slate-100 dark:border-slate-800">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={permitirKilo}
                onChange={(e) => setPermitirKilo(e.target.checked)}
                className="mt-0.5"
              />
              <div>
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  Habilitar venta fraccionada por kilo en este negocio
                </div>
                <div className="text-slate-500">
                  Permite abrir quintales cerrados (ej. 46 kg o 50 kg) y vender por kilo a precio diferenciado.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={autoAbrir}
                disabled={!permitirKilo}
                onChange={(e) => setAutoAbrir(e.target.checked)}
                className="mt-0.5"
              />
              <div>
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  Abrir quintal automáticamente al vender por kilo si falta suelto
                </div>
                <div className="text-slate-500">
                  Si un cliente pide 5 kg y solo hay 2 kg sueltos, abre 1 quintal cerrado automáticamente en Kardex.
                </div>
              </div>
            </label>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#15803D] hover:bg-[#166534] text-white font-semibold"
          >
            <Save className="w-4 h-4" />
            <span>Guardar Configuración</span>
          </button>
        </form>

        {/* Backups */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display font-bold text-base text-slate-900 dark:text-slate-100">
                Copias de Seguridad Automáticas
              </h2>
              <p className="text-xs text-slate-500">
                Base de datos centralizada con respaldos periódicos automáticos y descarga completa.
              </p>
            </div>
            <Database className="w-5 h-5 text-[#15803D]" />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleManualBackup}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-slate-700 text-white text-xs font-semibold"
            >
              <Database className="w-3.5 h-3.5" />
              <span>Crear Respaldo Ahora</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadBackup}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Descargar JSON</span>
            </button>
            <button
              type="button"
              onClick={handleResetDemo}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restaurar Demo</span>
            </button>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-56 overflow-y-auto text-xs">
            {backups.map((b) => (
              <div key={b.id} className="py-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-mono font-semibold text-slate-800 dark:text-slate-200 truncate">
                    {b.archivo}
                  </div>
                  <div className="text-slate-500 truncate">
                    {b.tipo} · {b.resumen}
                  </div>
                </div>
                <div className="text-right shrink-0 text-slate-500 font-mono">
                  <div>{formatDateTime(b.fecha)}</div>
                  <div>{Math.round(b.tamanoBytes / 1024)} KB</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Audit Log */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
          <History className="w-4 h-4 text-[#15803D]" />
          <h2 className="font-display font-bold text-base">
            Historial de Auditoría Inmutable ({auditLogs.length})
          </h2>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto text-xs">
          {auditLogs.map((a) => (
            <div key={a.id} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                  {a.accion}
                </span>{' '}
                · <span className="text-slate-600 dark:text-slate-300">{a.entidad} ({a.documentoRef})</span>
                <div className="text-slate-500">{a.detalle}</div>
              </div>
              <div className="text-slate-500 font-mono whitespace-nowrap">
                {a.usuarioNombre} · {formatDateTime(a.fecha)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
