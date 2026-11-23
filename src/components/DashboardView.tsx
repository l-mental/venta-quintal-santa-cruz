import React, { useMemo, useState } from 'react';
import {
  ShoppingCart,
  Package,
  ArrowLeftRight,
  AlertTriangle,
  ArrowUpRight,
} from 'lucide-react';
import type { WorkspaceData } from '../lib/api.ts';
import { formatBs, formatDateTime, formatNumber } from '../lib/format.ts';
import type { NavSection } from './Sidebar.tsx';

type PeriodFilter = 'HOY' | 'SEMANA' | 'MES' | 'TRIMESTRE' | 'TODO';

interface DashboardViewProps {
  data: WorkspaceData;
  onNavigate: (section: NavSection) => void;
}

export function DashboardView({ data, onNavigate }: DashboardViewProps) {
  const [period, setPeriod] = useState<PeriodFilter>('MES');
  const { business, currentUser, products, sales, purchases, loans, interDebts, movements } = data;

  const canSeeProfit = currentUser.permisos.includes('caja_reportes');
  const canSeePurchases = currentUser.permisos.includes('compras_ver');
  const canSell = currentUser.permisos.includes('ventas_crear');

  const isInPeriod = (iso: string) => {
    if (period === 'TODO') return true;
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (period === 'HOY') {
      return d.toDateString() === now.toDateString();
    }
    if (period === 'SEMANA') return diffDays <= 7;
    if (period === 'MES') return diffDays <= 30;
    if (period === 'TRIMESTRE') return diffDays <= 90;
    return true;
  };

  const periodSales = useMemo(
    () => sales.filter((s) => s.estado !== 'ANULADO' && isInPeriod(s.fecha)),
    [sales, period]
  );

  const periodPurchases = useMemo(
    () => purchases.filter((p) => p.estado !== 'ANULADO' && isInPeriod(p.fecha)),
    [purchases, period]
  );

  const totalVentas = periodSales.reduce((acc, s) => acc + s.total, 0);
  const totalCostoVentas = periodSales.reduce((acc, s) => acc + s.costoTotalEstimado, 0);
  const gananciaBruta = totalVentas - totalCostoVentas;
  const ticketPromedio = periodSales.length > 0 ? totalVentas / periodSales.length : 0;

  const totalPorCobrarClientes = sales
    .filter((s) => s.estado !== 'ANULADO')
    .reduce((acc, s) => acc + s.saldoPendiente, 0);

  const totalPorPagarProveedores = purchases
    .filter((p) => p.estado !== 'ANULADO')
    .reduce((acc, p) => acc + p.saldoPendiente, 0);

  const interPorCobrar = interDebts
    .filter((d) => d.acreedorNegocioId === business.id && d.estado !== 'ANULADO')
    .reduce((acc, d) => acc + d.saldoPendiente, 0);

  const interPorPagar = interDebts
    .filter((d) => d.deudorNegocioId === business.id && d.estado !== 'ANULADO')
    .reduce((acc, d) => acc + d.saldoPendiente, 0);

  const activeLoans = loans.filter((l) => l.estado !== 'DEVUELTO' && l.estado !== 'ANULADO');
  const lowStockProducts = products.filter(
    (p) => p.activo && p.quintalesCerrados <= p.stockMinimoQuintales
  );

  // Stock distributed by category
  const categoryStock = useMemo(() => {
    const map = new Map<
      string,
      { categoria: string; items: number; quintales: number; kilos: number }
    >();
    for (const p of products) {
      if (!p.activo) continue;
      const cur = map.get(p.categoria) || {
        categoria: p.categoria,
        items: 0,
        quintales: 0,
        kilos: 0,
      };
      cur.items += 1;
      cur.quintales += p.quintalesCerrados;
      cur.kilos += p.kilosSueltos;
      map.set(p.categoria, cur);
    }
    return Array.from(map.values());
  }, [products]);

  const periodLabels: Record<PeriodFilter, string> = {
    HOY: 'Hoy',
    SEMANA: 'Esta Semana',
    MES: 'Este Mes',
    TRIMESTRE: 'Trimestre',
    TODO: 'Todo',
  };

  return (
    <div className="space-y-6">
      {/* Top Hero Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-[#15803D] dark:text-emerald-400">
            {business.nombreCorto} · {business.titular}
          </p>
          <h1 className="font-display font-bold text-2xl sm:text-3xl text-slate-900 dark:text-slate-100 tracking-tight mt-0.5">
            Operaciones {business.nombre}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Control independiente de inventario ({business.configuracion.permitirVentaPorKilo ? 'quintal cerrado y por kilo' : 'mayorista por quintal cerrado'}), pedidos y cuentas corrientes.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {canSell && (
            <button
              type="button"
              onClick={() => onNavigate('ventas')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#15803D] hover:bg-[#166534] text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>Vender / Registrar Pedido</span>
            </button>
          )}
          {currentUser.permisos.includes('prestamos_gestionar') && (
            <button
              type="button"
              onClick={() => onNavigate('internegocios')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap"
            >
              <ArrowLeftRight className="w-4 h-4" />
              <span>Préstamos</span>
            </button>
          )}
        </div>
      </div>

      {/* Period Performance Block */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-5 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="font-display font-bold text-base sm:text-lg text-slate-900 dark:text-slate-100">
              Rendimiento Operativo
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Resumen del período seleccionado ({periodLabels[period]}) para {business.nombre}
            </p>
          </div>

          <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800 self-start md:self-auto flex-wrap">
            {(['HOY', 'SEMANA', 'MES', 'TRIMESTRE', 'TODO'] as PeriodFilter[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setPeriod(key)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  period === key
                    ? 'bg-[#15803D] text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {periodLabels[key]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-5">
          <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800">
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Pedidos ({periodLabels[period]})
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-mono tabular-nums font-bold text-2xl text-slate-900 dark:text-slate-100">
                {periodSales.length}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">operaciones</span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Ticket promedio: <span className="font-mono tabular-nums font-medium">{formatBs(ticketPromedio)}</span>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/60">
            <div className="text-xs text-emerald-800 dark:text-emerald-300 font-medium">
              Ventas Facturadas ({periodLabels[period]})
            </div>
            <div className="mt-2 font-mono tabular-nums font-bold text-2xl text-emerald-700 dark:text-emerald-400">
              {formatBs(totalVentas)}
            </div>
            <div className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80 mt-1">
              Transacciones activas sin anular
            </div>
          </div>

          {canSeeProfit ? (
            <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800">
              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Ganancia Bruta Estimada
              </div>
              <div className="mt-2 font-mono tabular-nums font-bold text-2xl text-[#15803D] dark:text-emerald-400">
                {formatBs(gananciaBruta)}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Margen sobre costo promedio
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800">
              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Por Cobrar a Clientes
              </div>
              <div className="mt-2 font-mono tabular-nums font-bold text-2xl text-[#15803D] dark:text-emerald-400">
                {formatBs(totalPorCobrarClientes)}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Saldo pendiente en pedidos
              </div>
            </div>
          )}

          <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800">
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Cuentas Pendientes
            </div>
            <div className="mt-2 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-300">Por cobrar (clientes):</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                  {formatBs(totalPorCobrarClientes + interPorCobrar)}
                </span>
              </div>
              {canSeePurchases && (
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-300">Por pagar (prov./herm.):</span>
                  <span className="font-mono tabular-nums font-semibold text-red-600 dark:text-red-400">
                    {formatBs(totalPorPagarProveedores + interPorPagar)}
                  </span>
                </div>
              )}
              {canSeePurchases && (
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-300">Compras período:</span>
                  <span className="font-mono tabular-nums font-medium text-slate-700 dark:text-slate-300">
                    {formatBs(periodPurchases.reduce((a, p) => a + p.total, 0))}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Inventory by Category */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="font-display font-bold text-base sm:text-lg text-slate-900 dark:text-slate-100">
              Inventario por Categoría
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Stock disponible en depósito propio de {business.nombre}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('inventario')}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#15803D] dark:text-emerald-400 hover:underline whitespace-nowrap"
          >
            <span>Administrar catálogo ({products.length})</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {categoryStock.map((cat) => (
            <button
              key={cat.categoria}
              type="button"
              onClick={() => onNavigate('inventario')}
              className="text-left p-4 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-[#15803D]/50 dark:hover:border-emerald-500/50 transition-colors bg-slate-50/40 dark:bg-slate-800/30"
            >
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
                <Package className="w-4 h-4 text-[#15803D] dark:text-emerald-400" />
                <span className="font-mono tabular-nums">{cat.items} productos</span>
              </div>
              <div className="font-display font-bold text-sm text-slate-900 dark:text-slate-100">
                {cat.categoria}
              </div>
              <div className="mt-1 text-xs text-slate-600 dark:text-slate-300 font-mono tabular-nums">
                {formatNumber(cat.quintales, 1)} qq cerrados
                {business.configuracion.permitirVentaPorKilo && cat.kilos > 0
                  ? ` · ${formatNumber(cat.kilos, 1)} kg sueltos`
                  : ''}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Two-Column Operational Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Loans & Low Stock Alerts */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold text-base text-slate-900 dark:text-slate-100">
              Alertas de Stock y Préstamos Activos
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('internegocios')}
              className="text-xs font-semibold text-[#15803D] dark:text-emerald-400 hover:underline"
            >
              Ver préstamos
            </button>
          </div>

          {lowStockProducts.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Stock bajo en depósito</span>
              </div>
              {lowStockProducts.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 text-xs"
                >
                  <div>
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {p.nombre} ({p.marca})
                    </span>
                    <span className="text-slate-500 dark:text-slate-400"> · {p.presentacionKg} kg</span>
                  </div>
                  <span className="font-mono tabular-nums font-semibold text-amber-700 dark:text-amber-400">
                    {p.quintalesCerrados} qq (mín. {p.stockMinimoQuintales})
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Préstamos pendientes entre los 3 negocios ({activeLoans.length})
            </div>
            {activeLoans.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
                No hay devoluciones de mercadería pendientes entre negocios.
              </p>
            ) : (
              activeLoans.map((l) => {
                const isLender = l.negocioOrigenId === business.id;
                return (
                  <div
                    key={l.id}
                    className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {l.codigo} · {l.productoNombre} ({l.marca})
                      </span>
                      <span className="font-mono tabular-nums font-semibold text-[#15803D] dark:text-emerald-400">
                        Pendiente: {l.cantidadPendienteQuintales} qq
                      </span>
                    </div>
                    <div className="text-slate-500 dark:text-slate-400">
                      {isLender
                        ? `Prestado a ${l.negocioDestinoNombre} · Devuelto ${l.cantidadDevueltaQuintales} de ${l.cantidadPrestadaQuintales} qq`
                        : `Recibido de ${l.negocioOrigenNombre} · Devuelto ${l.cantidadDevueltaQuintales} de ${l.cantidadPrestadaQuintales} qq`}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Recent Kardex Movements */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-bold text-base text-slate-900 dark:text-slate-100">
              Últimos Movimientos de Inventario
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('inventario')}
              className="text-xs font-semibold text-[#15803D] dark:text-emerald-400 hover:underline"
            >
              Ver Kardex completo
            </button>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {movements.slice(0, 6).map((m) => (
              <div key={m.id} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                    {m.productoNombre} ({m.marca}) · {m.tipo.replace(/_/g, ' ')}
                  </div>
                  <div className="text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {m.motivo} · {formatDateTime(m.fecha)}
                  </div>
                </div>
                <div className="font-mono tabular-nums text-right shrink-0">
                  {m.deltaQuintales !== 0 && (
                    <div className={m.deltaQuintales > 0 ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-slate-700 dark:text-slate-300 font-semibold'}>
                      {m.deltaQuintales > 0 ? `+${m.deltaQuintales}` : m.deltaQuintales} qq
                    </div>
                  )}
                  {m.deltaKilos !== 0 && (
                    <div className={m.deltaKilos > 0 ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-slate-700 dark:text-slate-300 font-semibold'}>
                      {m.deltaKilos > 0 ? `+${m.deltaKilos}` : m.deltaKilos} kg
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
