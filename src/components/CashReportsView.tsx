import React, { useMemo, useState } from 'react';
import { Download, Printer, Plus } from 'lucide-react';
import { apiRequest, type WorkspaceData } from '../lib/api.ts';
import { exportToCsv, formatBs, formatDateTime } from '../lib/format.ts';
import type { PaymentMethod } from '../types.ts';
import type { ToastMessage } from '../lib/notifications.ts';

interface CashReportsViewProps {
  data: WorkspaceData;
  onRefresh: () => Promise<void>;
  onToast?: (toast: Omit<ToastMessage, 'id'>) => void;
}

type PeriodKey = 'HOY' | 'SEMANA' | 'MES' | 'TODO';

const METHOD_LABELS: Record<PaymentMethod, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA_QR: 'Transferencia / QR',
  DEPOSITO: 'Depósito Bancario',
  CHEQUE: 'Cheque',
  REEMBOLSO_INTERNO: 'Reembolso Interno',
};

export function CashReportsView({ data, onRefresh, onToast }: CashReportsViewProps) {
  const { business, currentUser, products, sales, purchases, cashMovements, interDebts } = data;
  const [period, setPeriod] = useState<PeriodKey>('MES');
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [tipo, setTipo] = useState<'EGRESO' | 'INGRESO'>('EGRESO');
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState('');
  const [metodoPago, setMetodoPago] = useState<PaymentMethod>('EFECTIVO');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const inPeriod = (iso: string) => {
    if (period === 'TODO') return true;
    const d = new Date(iso);
    const now = new Date();
    if (period === 'HOY') return d.toDateString() === now.toDateString();
    const diffDays = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
    if (period === 'SEMANA') return diffDays <= 7;
    return diffDays <= 30;
  };

  const fSales = useMemo(
    () => sales.filter((s) => s.estado !== 'ANULADO' && inPeriod(s.fecha)),
    [sales, period]
  );
  const fPurchases = useMemo(
    () => purchases.filter((p) => p.estado !== 'ANULADO' && inPeriod(p.fecha)),
    [purchases, period]
  );
  const fCash = useMemo(
    () => cashMovements.filter((c) => !c.anulado && inPeriod(c.fecha)),
    [cashMovements, period]
  );

  const totalVentas = fSales.reduce((a, s) => a + s.total, 0);
  const totalCostoVentas = fSales.reduce((a, s) => a + s.costoTotalEstimado, 0);
  const totalCompras = fPurchases.reduce((a, p) => a + p.total, 0);

  const ingresosCaja = fCash.filter((c) => c.tipo === 'INGRESO').reduce((a, c) => a + c.monto, 0);
  const egresosCaja = fCash.filter((c) => c.tipo === 'EGRESO').reduce((a, c) => a + c.monto, 0);
  const gastosOperativos = fCash
    .filter((c) => c.tipo === 'EGRESO' && c.categoria === 'GASTO_OPERATIVO')
    .reduce((a, c) => a + c.monto, 0);

  const gananciaBruta = totalVentas - totalCostoVentas;
  const resultadoNeto = gananciaBruta - gastosOperativos;

  const cxcClientes = sales
    .filter((s) => s.estado !== 'ANULADO')
    .reduce((a, s) => a + s.saldoPendiente, 0);
  const cxpProveedores = purchases
    .filter((p) => p.estado !== 'ANULADO')
    .reduce((a, p) => a + p.saldoPendiente, 0);
  const interCobrar = interDebts
    .filter((d) => d.acreedorNegocioId === business.id && d.estado !== 'ANULADO')
    .reduce((a, d) => a + d.saldoPendiente, 0);
  const interPagar = interDebts
    .filter((d) => d.deudorNegocioId === business.id && d.estado !== 'ANULADO')
    .reduce((a, d) => a + d.saldoPendiente, 0);

  const valorInventarioCosto = products.reduce(
    (a, p) =>
      a +
      p.quintalesCerrados * p.costoPromedioQuintal +
      (p.presentacionKg > 0 ? p.kilosSueltos * (p.costoPromedioQuintal / p.presentacionKg) : 0),
    0
  );
  const valorInventarioVenta = products.reduce(
    (a, p) => a + p.quintalesCerrados * p.precioQuintal + p.kilosSueltos * p.precioKilo,
    0
  );

  const paymentBreakdown = useMemo(() => {
    const map = new Map<
      PaymentMethod,
      { method: PaymentMethod; label: string; ingresos: number; egresos: number }
    >();
    (Object.keys(METHOD_LABELS) as PaymentMethod[]).forEach((m) => {
      map.set(m, { method: m, label: METHOD_LABELS[m], ingresos: 0, egresos: 0 });
    });
    for (const c of fCash) {
      const entry = map.get(c.metodoPago) || {
        method: c.metodoPago,
        label: METHOD_LABELS[c.metodoPago] || c.metodoPago,
        ingresos: 0,
        egresos: 0,
      };
      if (c.tipo === 'INGRESO') entry.ingresos += c.monto;
      else entry.egresos += c.monto;
      map.set(c.metodoPago, entry);
    }
    return Array.from(map.values())
      .filter((e) => e.ingresos > 0 || e.egresos > 0)
      .sort((a, b) => b.ingresos + b.egresos - (a.ingresos + a.egresos));
  }, [fCash]);

  const topProducts = useMemo(() => {
    const map = new Map<
      string,
      {
        productoId: string;
        nombre: string;
        marca: string;
        quintales: number;
        kilos: number;
        total: number;
      }
    >();
    for (const s of fSales) {
      for (const it of s.items) {
        const cur = map.get(it.productoId) || {
          productoId: it.productoId,
          nombre: it.productoNombre,
          marca: it.marca,
          quintales: 0,
          kilos: 0,
          total: 0,
        };
        if (it.modalidad === 'QUINTAL') cur.quintales += it.cantidad;
        else cur.kilos += it.cantidad;
        cur.total += it.subtotal;
        map.set(it.productoId, cur);
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [fSales]);

  const handleSaveCashMove = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await apiRequest('/api/cash/movement', {
        method: 'POST',
        body: { tipo, concepto, monto: Number(monto), metodoPago },
        userId: currentUser.id,
        businessId: business.id,
      });
      onToast?.({
        type: 'success',
        title: `${tipo === 'INGRESO' ? 'Ingreso' : 'Gasto'} registrado en caja`,
        detail: `${concepto} · ${formatBs(Number(monto))}`,
      });
      setShowMoveModal(false);
      setConcepto('');
      setMonto('');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar movimiento de caja');
    } finally {
      setBusy(false);
    }
  };

  const handleExportCsv = () => {
    exportToCsv(
      `caja_reporte_${business.id}.csv`,
      ['Fecha', 'Tipo', 'Categoría', 'Concepto', 'Método', 'Referencia', 'Monto (Bs)', 'Usuario'],
      fCash.map((c) => [
        formatDateTime(c.fecha),
        c.tipo,
        c.categoria,
        c.concepto,
        c.metodoPago,
        c.referencia,
        c.monto,
        c.usuarioNombre,
      ])
    );
    onToast?.({
      type: 'info',
      title: 'Reporte de caja exportado',
      detail: `Se descargaron ${fCash.length} movimientos en formato CSV.`,
    });
  };

  return (
    <div className="space-y-6 print-only-container">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-2xl text-slate-900 dark:text-slate-100">
            Caja, Flujo y Resultados · {business.nombre}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Reporte financiero separado exclusivamente para este negocio.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 no-print">
          <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg">
            {(['HOY', 'SEMANA', 'MES', 'TODO'] as PeriodKey[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium ${
                  period === p
                    ? 'bg-[#15803D] text-white'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {p === 'HOY' ? 'Hoy' : p === 'SEMANA' ? '7 días' : p === 'MES' ? '30 días' : 'Todo'}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimir</span>
          </button>
          <button
            type="button"
            onClick={() => setShowMoveModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#15803D] hover:bg-[#166534] text-white text-xs font-semibold"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Registrar Gasto / Ingreso</span>
          </button>
        </div>
      </div>

      {/* Summary Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
          <div className="text-xs text-slate-500">Ingresos Recibidos (Caja)</div>
          <div className="font-mono tabular-nums font-bold text-xl text-emerald-600 dark:text-emerald-400">
            {formatBs(ingresosCaja)}
          </div>
          <div className="text-[11px] text-slate-500">Ventas contado + cobranzas</div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
          <div className="text-xs text-slate-500">Egresos Realizados (Caja)</div>
          <div className="font-mono tabular-nums font-bold text-xl text-red-600 dark:text-red-400">
            {formatBs(egresosCaja)}
          </div>
          <div className="text-[11px] text-slate-500">Compras + pagos a proveedores + gastos</div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
          <div className="text-xs text-slate-500">Ganancia Bruta / Resultado Neto</div>
          <div className="font-mono tabular-nums font-bold text-xl text-[#15803D] dark:text-emerald-400">
            {formatBs(resultadoNeto)}
          </div>
          <div className="text-[11px] text-slate-500">
            Bruta {formatBs(gananciaBruta)} − Gastos {formatBs(gastosOperativos)}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1">
          <div className="text-xs text-slate-500">Valor del Inventario Propio</div>
          <div className="font-mono tabular-nums font-bold text-xl text-slate-900 dark:text-slate-100">
            {formatBs(valorInventarioCosto)}
          </div>
          <div className="text-[11px] text-slate-500">
            Precio venta estimado: {formatBs(valorInventarioVenta)}
          </div>
        </div>
      </div>

      {/* Balance Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2">
          <div className="font-display font-bold text-sm">Operaciones del Período</div>
          <div className="flex justify-between">
            <span className="text-slate-500">Ventas facturadas:</span>
            <span className="font-mono font-semibold">{formatBs(totalVentas)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Compras registradas:</span>
            <span className="font-mono font-semibold">{formatBs(totalCompras)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Flujo neto de caja:</span>
            <span className="font-mono font-bold">{formatBs(ingresosCaja - egresosCaja)}</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2">
          <div className="font-display font-bold text-sm">Cuentas por Cobrar Totales</div>
          <div className="flex justify-between">
            <span className="text-slate-500">Deudas de clientes:</span>
            <span className="font-mono font-semibold">{formatBs(cxcClientes)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Nos deben negocios hermanos:</span>
            <span className="font-mono font-semibold">{formatBs(interCobrar)}</span>
          </div>
          <div className="flex justify-between border-t border-slate-100 dark:border-slate-800 pt-1.5">
            <span className="font-semibold">Total por Cobrar:</span>
            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
              {formatBs(cxcClientes + interCobrar)}
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2">
          <div className="font-display font-bold text-sm">Cuentas por Pagar Totales</div>
          <div className="flex justify-between">
            <span className="text-slate-500">Deudas a proveedores:</span>
            <span className="font-mono font-semibold">{formatBs(cxpProveedores)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Debemos a negocios hermanos:</span>
            <span className="font-mono font-semibold">{formatBs(interPagar)}</span>
          </div>
          <div className="flex justify-between border-t border-slate-100 dark:border-slate-800 pt-1.5">
            <span className="font-semibold">Total por Pagar:</span>
            <span className="font-mono font-bold text-red-600 dark:text-red-400">
              {formatBs(cxpProveedores + interPagar)}
            </span>
          </div>
        </div>
      </div>

      {/* Payment Method Breakdown & Top Products */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div>
            <h2 className="font-display font-bold text-base text-slate-900 dark:text-slate-100">
              Desglose por Método de Pago
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Ingresos y egresos efectivos según canal de cobro/pago en el período
            </p>
          </div>
          {paymentBreakdown.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">Sin movimientos de caja en este período.</p>
          ) : (
            <div className="space-y-3 text-xs">
              {paymentBreakdown.map((item) => {
                const maxTotal = Math.max(
                  1,
                  ...paymentBreakdown.map((m) => m.ingresos + m.egresos)
                );
                const pct = Math.round(((item.ingresos + item.egresos) / maxTotal) * 100);
                return (
                  <div key={item.method} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {item.label}
                      </span>
                      <div className="flex items-center gap-3 font-mono tabular-nums">
                        {item.ingresos > 0 && (
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                            +{formatBs(item.ingresos)}
                          </span>
                        )}
                        {item.egresos > 0 && (
                          <span className="text-red-600 dark:text-red-400 font-semibold">
                            -{formatBs(item.egresos)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#15803D]"
                        style={{ width: `${Math.max(4, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div>
            <h2 className="font-display font-bold text-base text-slate-900 dark:text-slate-100">
              Productos Más Vendidos del Período
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Ranking por volumen facturado en {business.nombreCorto}
            </p>
          </div>
          {topProducts.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">Sin ventas registradas en este período.</p>
          ) : (
            <div className="space-y-3 text-xs">
              {topProducts.map((tp, idx) => {
                const maxRev = Math.max(1, topProducts[0]?.total || 1);
                const pct = Math.round((tp.total / maxRev) * 100);
                return (
                  <div key={tp.productoId} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 truncate">
                        <span className="font-mono font-semibold text-slate-400 mr-1.5">
                          #{idx + 1}
                        </span>
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {tp.nombre}
                        </span>
                        <span className="text-slate-500 dark:text-slate-400">
                          {' '}
                          · {tp.marca} (
                          {tp.quintales > 0 ? `${tp.quintales} qq` : ''}
                          {tp.quintales > 0 && tp.kilos > 0 ? ' + ' : ''}
                          {tp.kilos > 0 ? `${tp.kilos} kg` : ''})
                        </span>
                      </div>
                      <span className="font-mono tabular-nums font-bold text-[#15803D] dark:text-emerald-400 shrink-0">
                        {formatBs(tp.total)}
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-600/85 dark:bg-emerald-500"
                        style={{ width: `${Math.max(4, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Cash Movements Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-display font-bold text-base">Libro de Caja y Pagos</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-500">
                <th className="py-3 px-4">Fecha</th>
                <th className="py-3 px-4">Tipo</th>
                <th className="py-3 px-4">Concepto y Referencia</th>
                <th className="py-3 px-4">Método</th>
                <th className="py-3 px-4 text-right">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {fCash.map((c) => (
                <tr key={c.id}>
                  <td className="py-3 px-4 whitespace-nowrap text-slate-500">
                    {formatDateTime(c.fecha)}
                  </td>
                  <td className="py-3 px-4 font-semibold">
                    <span
                      className={
                        c.tipo === 'INGRESO'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      }
                    >
                      {c.tipo}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-900 dark:text-slate-100">
                      {c.concepto}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {c.referencia} · {c.usuarioNombre}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{c.metodoPago}</td>
                  <td
                    className={`py-3 px-4 text-right font-mono tabular-nums font-bold ${
                      c.tipo === 'INGRESO'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {c.tipo === 'INGRESO' ? '+' : '-'}
                    {formatBs(c.monto)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual Expense/Income Modal */}
      {showMoveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 no-print">
          <form
            onSubmit={handleSaveCashMove}
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4 text-xs"
          >
            <h3 className="font-display font-bold text-lg">Registrar Movimiento de Caja</h3>
            {error && <div className="text-red-600">{error}</div>}
            <div>
              <label className="block font-medium mb-1">Tipo</label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as 'INGRESO' | 'EGRESO')}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="EGRESO">Egreso / Gasto Operativo (Flete, Alquiler, Estibaje)</option>
                <option value="INGRESO">Ingreso Extra a Caja</option>
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Concepto</label>
              <input
                type="text"
                value={concepto}
                onChange={(e) => setConcepto(e.target.value)}
                required
                placeholder="Ej. Pago de estibaje y descarga de camión"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium mb-1">Monto (Bs)</label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Método</label>
                <select
                  value={metodoPago}
                  onChange={(e) => setMetodoPago(e.target.value as PaymentMethod)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                >
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="TRANSFERENCIA_QR">Transferencia / QR</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowMoveModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-[#15803D] hover:bg-[#166534] text-white font-semibold"
              >
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
