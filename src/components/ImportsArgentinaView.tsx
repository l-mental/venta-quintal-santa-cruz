import React, { useState } from 'react';
import { Ship, Calculator } from 'lucide-react';
import { apiRequest, type WorkspaceData } from '../lib/api.ts';
import { formatBs, formatDate } from '../lib/format.ts';
import type { ToastMessage } from '../lib/notifications.ts';

interface ImportsArgentinaViewProps {
  data: WorkspaceData;
  onRefresh: () => Promise<void>;
  onToast?: (toast: Omit<ToastMessage, 'id'>) => void;
}

export function ImportsArgentinaView({ data, onRefresh, onToast }: ImportsArgentinaViewProps) {
  const { business, currentUser, importSimulations } = data;
  const [proveedorArgentina, setProveedorArgentina] = useState('Molinos Río de la Plata · Salta');
  const [productoNombre, setProductoNombre] = useState('Harina 000 (50 kg)');
  const [cantidadQuintales, setCantidadQuintales] = useState('250');
  const [precioFobUsd, setPrecioFobUsd] = useState('23.80');
  const [tipoCambioBs, setTipoCambioBs] = useState('6.96');
  const [fleteBs, setFleteBs] = useState('5400');
  const [aduanaBs, setAduanaBs] = useState('3200');
  const [estibajeBs, setEstibajeBs] = useState('1100');
  const [otrosBs, setOtrosBs] = useState('500');
  const [busy, setBusy] = useState(false);

  const qty = Math.max(1, Number(cantidadQuintales || 1));
  const mercaderiaBs = qty * Number(precioFobUsd || 0) * Number(tipoCambioBs || 6.96);
  const gastosBs =
    Number(fleteBs || 0) + Number(aduanaBs || 0) + Number(estibajeBs || 0) + Number(otrosBs || 0);
  const costoTotal = mercaderiaBs + gastosBs;
  const costoPorQuintal = costoTotal / qty;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apiRequest('/api/imports/simulate', {
        method: 'POST',
        body: {
          proveedorArgentina,
          productoNombre,
          cantidadQuintales: qty,
          precioFobUsd: Number(precioFobUsd),
          tipoCambioBs: Number(tipoCambioBs),
          fleteInternacionalBs: Number(fleteBs),
          aduanaDespachanteBs: Number(aduanaBs),
          estibajeDescargaBs: Number(estibajeBs),
          otrosGastosBs: Number(otrosBs),
        },
        userId: currentUser.id,
        businessId: business.id,
      });
      onToast?.({
        type: 'success',
        title: 'Costeo de importación guardado',
        detail: `${productoNombre} · ${formatBs(costoPorQuintal)} / qq en depósito`,
      });
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-semibold text-[#15803D] dark:text-emerald-400">
          Módulo Ampliable · Etapa Futura Lista para Activar
        </div>
        <h1 className="font-display font-bold text-2xl text-slate-900 dark:text-slate-100 mt-0.5">
          Importaciones desde Argentina (Costeo en Depósito)
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Calcula el costo real por quintal puesto en tu depósito sumando FOB, tipo de cambio, flete internacional, aduana y descarga.
        </p>
      </div>

      <form
        onSubmit={handleSave}
        className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
      >
        <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block font-medium mb-1">Proveedor en Argentina</label>
            <input
              type="text"
              value={proveedorArgentina}
              onChange={(e) => setProveedorArgentina(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Producto a Importar</label>
            <input
              type="text"
              value={productoNombre}
              onChange={(e) => setProductoNombre(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Cantidad de Quintales</label>
            <input
              type="number"
              min="1"
              value={cantidadQuintales}
              onChange={(e) => setCantidadQuintales(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Precio FOB Origen (USD / quintal)</label>
            <input
              type="number"
              step="0.01"
              value={precioFobUsd}
              onChange={(e) => setPrecioFobUsd(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Tipo de Cambio (Bs / USD)</label>
            <input
              type="number"
              step="0.01"
              value={tipoCambioBs}
              onChange={(e) => setTipoCambioBs(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Flete Internacional / Transporte (Bs)</label>
            <input
              type="number"
              step="0.01"
              value={fleteBs}
              onChange={(e) => setFleteBs(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Aduana y Despachante (Bs)</label>
            <input
              type="number"
              step="0.01"
              value={aduanaBs}
              onChange={(e) => setAduanaBs(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Estibaje, Descarga y Otros (Bs)</label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                step="0.01"
                value={estibajeBs}
                onChange={(e) => setEstibajeBs(e.target.value)}
                placeholder="Estibaje"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
              />
              <input
                type="number"
                step="0.01"
                value={otrosBs}
                onChange={(e) => setOtrosBs(e.target.value)}
                placeholder="Otros"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
              />
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4 text-xs">
          <div className="flex items-center gap-2 font-display font-bold text-base">
            <Calculator className="w-4 h-4 text-[#15803D]" />
            <span>Resultado Puesto en Depósito</span>
          </div>
          <div className="space-y-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex justify-between">
              <span className="text-slate-500">Mercadería FOB en Bs:</span>
              <span className="font-mono font-semibold">{formatBs(mercaderiaBs)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Gastos (Flete + Aduana + Estibaje):</span>
              <span className="font-mono font-semibold">{formatBs(gastosBs)}</span>
            </div>
            <div className="flex justify-between font-bold text-sm">
              <span>Costo Total Lote:</span>
              <span className="font-mono">{formatBs(costoTotal)}</span>
            </div>
          </div>

          <div>
            <div className="text-slate-500">Costo Real por Quintal en Depósito</div>
            <div className="font-mono tabular-nums font-bold text-2xl text-[#15803D] dark:text-emerald-400 mt-1">
              {formatBs(costoPorQuintal)} / qq
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#15803D] hover:bg-[#166534] text-white font-semibold"
          >
            <Ship className="w-4 h-4" />
            <span>Guardar Simulación de Costeo</span>
          </button>
        </div>
      </form>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 font-display font-bold text-base">
          Historial de Costeos de Importación ({importSimulations.length})
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-500">
                <th className="py-3 px-4">Fecha</th>
                <th className="py-3 px-4">Proveedor y Producto</th>
                <th className="py-3 px-4 text-right">Quintales</th>
                <th className="py-3 px-4 text-right">Costo Total</th>
                <th className="py-3 px-4 text-right">Costo / Quintal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {importSimulations.map((sim) => (
                <tr key={sim.id}>
                  <td className="py-3 px-4 whitespace-nowrap text-slate-500">
                    {formatDate(sim.fecha)}
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-semibold">{sim.productoNombre}</div>
                    <div className="text-[11px] text-slate-500">{sim.proveedorArgentina}</div>
                  </td>
                  <td className="py-3 px-4 text-right font-mono">{sim.cantidadQuintales} qq</td>
                  <td className="py-3 px-4 text-right font-mono">{formatBs(sim.costoTotalBs)}</td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-[#15803D] dark:text-emerald-400">
                    {formatBs(sim.costoPorQuintalBs)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
