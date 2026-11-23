import React, { useMemo, useState } from 'react';
import {
  Plus,
  Search,
  PackageOpen,
  SlidersHorizontal,
  Pencil,
  History,
  Download,
} from 'lucide-react';
import { apiRequest, type WorkspaceData } from '../lib/api.ts';
import { exportToCsv, formatBs, formatDateTime, formatNumber } from '../lib/format.ts';
import type { Product } from '../types.ts';
import type { ToastMessage } from '../lib/notifications.ts';

interface InventoryViewProps {
  data: WorkspaceData;
  onRefresh: () => Promise<void>;
  onToast?: (toast: Omit<ToastMessage, 'id'>) => void;
}

export function InventoryView({ data, onRefresh, onToast }: InventoryViewProps) {
  const { business, currentUser, products, movements } = data;
  const [tab, setTab] = useState<'STOCK' | 'KARDEX'>('STOCK');
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('TODAS');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  // Modals
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [openQuintalTarget, setOpenQuintalTarget] = useState<Product | null>(null);
  const [openQuintalCount, setOpenQuintalCount] = useState('1');
  const [showAdjustModal, setShowAdjustModal] = useState(false);

  // Product Form State
  const [pNombre, setPNombre] = useState('');
  const [pMarca, setPMarca] = useState('');
  const [pCategoria, setPCategoria] = useState('Harinas');
  const [pPeso, setPPeso] = useState('50');
  const [pUnidad, setPUnidad] = useState('Quintal');
  const [pQuintales, setPQuintales] = useState('0');
  const [pPrecioQ, setPPrecioQ] = useState('250');
  const [pPrecioK, setPPrecioK] = useState('6');
  const [pCostoQ, setPCostoQ] = useState('220');
  const [pMinQ, setPMinQ] = useState('10');
  const [pFraccionado, setPFraccionado] = useState(true);

  // Adjust Form State
  const [adjProdId, setAdjProdId] = useState(products[0]?.id || '');
  const [adjTipo, setAdjTipo] = useState<
    'AJUSTE_POSITIVO' | 'AJUSTE_NEGATIVO' | 'DEVOLUCION_CLIENTE' | 'DEVOLUCION_PROVEEDOR'
  >('AJUSTE_POSITIVO');
  const [adjQ, setAdjQ] = useState('0');
  const [adjK, setAdjK] = useState('0');
  const [adjMotivo, setAdjMotivo] = useState('');

  const canEdit = currentUser.permisos.includes('inventario_editar');
  const canSeeCost =
    currentUser.permisos.includes('compras_ver') || currentUser.permisos.includes('caja_reportes');
  const allowsKilo = business.configuracion.permitirVentaPorKilo;

  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.categoria));
    return ['TODAS', ...Array.from(set)];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (catFilter !== 'TODAS' && p.categoria !== catFilter) return false;
      if (!q) return true;
      return (
        p.nombre.toLowerCase().includes(q) ||
        p.marca.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q)
      );
    });
  }, [products, search, catFilter]);

  const filteredMovements = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return movements;
    return movements.filter(
      (m) =>
        m.productoNombre.toLowerCase().includes(q) ||
        m.marca.toLowerCase().includes(q) ||
        m.referencia.toLowerCase().includes(q) ||
        m.motivo.toLowerCase().includes(q)
    );
  }, [movements, search]);

  const openNewProduct = () => {
    setEditingProduct(null);
    setPNombre('');
    setPMarca('');
    setPCategoria('Harinas');
    setPPeso('50');
    setPUnidad('Quintal');
    setPQuintales('0');
    setPPrecioQ('250');
    setPPrecioK('6');
    setPCostoQ('220');
    setPMinQ('10');
    setPFraccionado(allowsKilo);
    setShowProductModal(true);
  };

  const openEditProduct = (p: Product) => {
    setEditingProduct(p);
    setPNombre(p.nombre);
    setPMarca(p.marca);
    setPCategoria(p.categoria);
    setPPeso(String(p.presentacionKg));
    setPUnidad(p.unidadLabel);
    setPQuintales(String(p.quintalesCerrados));
    setPPrecioQ(String(p.precioQuintal));
    setPPrecioK(String(p.precioKilo));
    setPCostoQ(String(p.costoPromedioQuintal));
    setPMinQ(String(p.stockMinimoQuintales));
    setPFraccionado(p.permiteFraccionado);
    setShowProductModal(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const payload = {
        nombre: pNombre,
        marca: pMarca,
        categoria: pCategoria,
        presentacionKg: Number(pPeso),
        unidadLabel: pUnidad,
        quintalesCerrados: Number(pQuintales),
        precioQuintal: Number(pPrecioQ),
        precioKilo: Number(pPrecioK),
        costoPromedioQuintal: Number(pCostoQ),
        stockMinimoQuintales: Number(pMinQ),
        permiteFraccionado: pFraccionado,
      };
      if (editingProduct) {
        await apiRequest(`/api/products/${editingProduct.id}`, {
          method: 'PATCH',
          body: payload,
          userId: currentUser.id,
          businessId: business.id,
        });
        setSuccess('Producto actualizado correctamente.');
        onToast?.({
          type: 'success',
          title: 'Producto actualizado',
          detail: `${pNombre} (${pMarca})`,
        });
      } else {
        await apiRequest('/api/products', {
          method: 'POST',
          body: payload,
          userId: currentUser.id,
          businessId: business.id,
        });
        setSuccess('Producto registrado en el inventario del negocio.');
        onToast?.({
          type: 'success',
          title: 'Nuevo producto agregado',
          detail: `${pNombre} (${pMarca}) · ${pPeso} kg`,
        });
      }
      setShowProductModal(false);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error guardando producto');
    } finally {
      setBusy(false);
    }
  };

  const handleOpenQuintal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!openQuintalTarget) return;
    setError('');
    setBusy(true);
    try {
      await apiRequest(`/api/products/${openQuintalTarget.id}/open-quintal`, {
        method: 'POST',
        body: { cantidadQuintales: Number(openQuintalCount) },
        userId: currentUser.id,
        businessId: business.id,
      });
      const addedKg = Number(openQuintalCount) * openQuintalTarget.presentacionKg;
      const msg = `Se abrieron ${openQuintalCount} quintal(es) de ${openQuintalTarget.nombre}. +${addedKg} kg disponibles para venta fraccionada.`;
      setSuccess(msg);
      onToast?.({
        type: 'success',
        title: 'Quintal abierto para venta por kilo',
        detail: `${openQuintalTarget.nombre} · +${addedKg} kg sueltos`,
      });
      setOpenQuintalTarget(null);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al abrir quintal');
    } finally {
      setBusy(false);
    }
  };

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await apiRequest('/api/inventory/adjust', {
        method: 'POST',
        body: {
          productoId: adjProdId,
          tipo: adjTipo,
          cantidadQuintales: Number(adjQ),
          cantidadKilos: Number(adjK),
          motivo: adjMotivo,
        },
        userId: currentUser.id,
        businessId: business.id,
      });
      setSuccess('Movimiento de ajuste/devolución registrado en Kardex.');
      onToast?.({
        type: 'info',
        title: 'Kardex actualizado',
        detail: `${adjTipo.replace(/_/g, ' ')} registrado correctamente.`,
      });
      setShowAdjustModal(false);
      setAdjMotivo('');
      setAdjQ('0');
      setAdjK('0');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar ajuste');
    } finally {
      setBusy(false);
    }
  };

  const handleExportCsv = () => {
    exportToCsv(
      `inventario_${business.id}.csv`,
      [
        'SKU',
        'Producto',
        'Marca',
        'Categoría',
        'Presentación (kg)',
        'Quintales Cerrados',
        'Kilos Sueltos',
        'Precio Quintal (Bs)',
        'Precio Kilo (Bs)',
      ],
      filteredProducts.map((p) => [
        p.sku,
        p.nombre,
        p.marca,
        p.categoria,
        p.presentacionKg,
        p.quintalesCerrados,
        p.kilosSueltos,
        p.precioQuintal,
        p.precioKilo,
      ])
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-2xl text-slate-900 dark:text-slate-100">
            Almacén, Stock y Kardex
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Inventario independiente de {business.nombre} ·{' '}
            {allowsKilo
              ? 'Venta por quintal cerrado y fraccionado por kilo activada'
              : 'Modalidad exclusiva por quintal cerrado'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar CSV</span>
          </button>

          {canEdit && (
            <>
              <button
                type="button"
                onClick={() => {
                  setAdjProdId(products[0]?.id || '');
                  setShowAdjustModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Ajuste / Devolución</span>
              </button>
              <button
                type="button"
                onClick={openNewProduct}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#15803D] hover:bg-[#166534] text-white text-xs font-semibold"
              >
                <Plus className="w-4 h-4" />
                <span>Nuevo Producto</span>
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-700 dark:text-emerald-300">
          {success}
        </div>
      )}

      {/* Tabs + Search Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg self-start">
          <button
            type="button"
            onClick={() => setTab('STOCK')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              tab === 'STOCK'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Stock Actual ({products.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('KARDEX')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              tab === 'KARDEX'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Historial / Kardex ({movements.length})</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {tab === 'STOCK' && (
            <select
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200"
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c === 'TODAS' ? 'Todas las categorías' : c}
                </option>
              ))}
            </select>
          )}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar producto, marca o ref..."
              className="pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 w-64"
            />
          </div>
        </div>
      </div>

      {tab === 'STOCK' ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4">Producto y Marca</th>
                  <th className="py-3 px-4">Presentación</th>
                  <th className="py-3 px-4 text-right">Quintales Cerrados</th>
                  {allowsKilo && <th className="py-3 px-4 text-right">Disponible Suelto</th>}
                  <th className="py-3 px-4 text-right">Precio Quintal</th>
                  {allowsKilo && <th className="py-3 px-4 text-right">Precio Kilo</th>}
                  {canSeeCost && <th className="py-3 px-4 text-right">Costo Prom.</th>}
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {filteredProducts.map((p) => {
                  const isLow = p.quintalesCerrados <= p.stockMinimoQuintales;
                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {p.nombre}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {p.marca} · {p.categoria} · <span className="font-mono">{p.sku}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {p.unidadLabel} {p.presentacionKg} kg
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        <span
                          className={`font-bold ${
                            isLow
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-slate-900 dark:text-slate-100'
                          }`}
                        >
                          {formatNumber(p.quintalesCerrados, 2)} qq
                        </span>
                        {isLow && (
                          <div className="text-[10px] text-amber-600 dark:text-amber-400">
                            Stock bajo (mín {p.stockMinimoQuintales})
                          </div>
                        )}
                      </td>
                      {allowsKilo && (
                        <td className="py-3 px-4 text-right font-mono tabular-nums">
                          {p.permiteFraccionado ? (
                            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                              {formatNumber(p.kilosSueltos, 2)} kg
                            </span>
                          ) : (
                            <span className="text-slate-400">No fracc.</span>
                          )}
                        </td>
                      )}
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                        {formatBs(p.precioQuintal)}
                      </td>
                      {allowsKilo && (
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {p.permiteFraccionado ? formatBs(p.precioKilo) : '—'}
                        </td>
                      )}
                      {canSeeCost && (
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          {formatBs(p.costoPromedioQuintal)}
                        </td>
                      )}
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {allowsKilo && p.permiteFraccionado && (
                            <button
                              type="button"
                              onClick={() => {
                                setOpenQuintalTarget(p);
                                setOpenQuintalCount('1');
                              }}
                              disabled={p.quintalesCerrados < 1}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-emerald-50 hover:text-[#15803D] dark:hover:bg-emerald-950/40 disabled:opacity-40 whitespace-nowrap"
                            >
                              <PackageOpen className="w-3.5 h-3.5" />
                              <span>Abrir quintal</span>
                            </button>
                          )}
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => openEditProduct(p)}
                              className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                              title="Editar producto"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4">Fecha</th>
                  <th className="py-3 px-4">Tipo</th>
                  <th className="py-3 px-4">Producto</th>
                  <th className="py-3 px-4 text-right">Movimiento</th>
                  <th className="py-3 px-4 text-right">Saldo Posterior</th>
                  <th className="py-3 px-4">Referencia y Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {filteredMovements.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <td className="py-3 px-4 whitespace-nowrap text-slate-500 dark:text-slate-400">
                      {formatDateTime(m.fecha)}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
                      {m.tipo.replace(/_/g, ' ')}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {m.productoNombre}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {m.marca} · {m.presentacionKg} kg
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                      {m.deltaQuintales !== 0 && (
                        <div className={m.deltaQuintales > 0 ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-red-600 dark:text-red-400 font-semibold'}>
                          {m.deltaQuintales > 0 ? `+${m.deltaQuintales}` : m.deltaQuintales} qq
                        </div>
                      )}
                      {m.deltaKilos !== 0 && (
                        <div className={m.deltaKilos > 0 ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-red-600 dark:text-red-400 font-semibold'}>
                          {m.deltaKilos > 0 ? `+${m.deltaKilos}` : m.deltaKilos} kg
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap text-slate-700 dark:text-slate-300">
                      {formatNumber(m.saldoQuintales, 2)} qq
                      {allowsKilo ? ` · ${formatNumber(m.saldoKilos, 2)} kg` : ''}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-mono text-[11px] text-slate-600 dark:text-slate-300">
                        {m.referencia} · {m.usuarioNombre}
                      </div>
                      <div className="text-slate-500 dark:text-slate-400">{m.motivo}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Open Quintal Modal */}
      {openQuintalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60">
          <form
            onSubmit={handleOpenQuintal}
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4"
          >
            <h3 className="font-display font-bold text-lg text-slate-900 dark:text-slate-100">
              Abrir Quintal para Venta por Kilo
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Convierte quintales cerrados de <strong>{openQuintalTarget.nombre} ({openQuintalTarget.marca})</strong> en inventario disponible por kilo ({openQuintalTarget.presentacionKg} kg por quintal).
            </p>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 text-xs space-y-1 font-mono tabular-nums">
              <div>Stock actual cerrado: {openQuintalTarget.quintalesCerrados} qq</div>
              <div>Stock actual suelto: {openQuintalTarget.kilosSueltos} kg</div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Cantidad de quintales a abrir
              </label>
              <input
                type="number"
                min={1}
                max={Math.floor(openQuintalTarget.quintalesCerrados)}
                value={openQuintalCount}
                onChange={(e) => setOpenQuintalCount(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono"
                required
              />
              <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-1.5 font-medium">
                Se sumarán +{Number(openQuintalCount || 0) * openQuintalTarget.presentacionKg} kg al stock suelto.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOpenQuintalTarget(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-[#15803D] hover:bg-[#166534] text-white text-xs font-semibold disabled:opacity-50"
              >
                Confirmar Apertura
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add/Edit Product Modal */}
      {showProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60">
          <form
            onSubmit={handleSaveProduct}
            className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <h3 className="font-display font-bold text-lg text-slate-900 dark:text-slate-100">
              {editingProduct ? 'Editar Producto' : 'Registrar Nuevo Producto'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-medium mb-1">Nombre del producto</label>
                <input
                  type="text"
                  value={pNombre}
                  onChange={(e) => setPNombre(e.target.value)}
                  placeholder="Ej. Harina 000"
                  required
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Marca</label>
                <input
                  type="text"
                  value={pMarca}
                  onChange={(e) => setPMarca(e.target.value)}
                  placeholder="Ej. Cañuelas"
                  required
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Categoría</label>
                <input
                  type="text"
                  value={pCategoria}
                  onChange={(e) => setPCategoria(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Peso / Presentación (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  value={pPeso}
                  onChange={(e) => setPPeso(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                />
              </div>
              {!editingProduct && (
                <div>
                  <label className="block font-medium mb-1">Stock inicial (quintales)</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={pQuintales}
                    onChange={(e) => setPQuintales(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                  />
                </div>
              )}
              <div>
                <label className="block font-medium mb-1">Precio Venta Quintal (Bs)</label>
                <input
                  type="number"
                  step="0.01"
                  value={pPrecioQ}
                  onChange={(e) => setPPrecioQ(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Precio Venta por Kilo (Bs)</label>
                <input
                  type="number"
                  step="0.01"
                  value={pPrecioK}
                  onChange={(e) => setPPrecioK(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Costo Promedio Quintal (Bs)</label>
                <input
                  type="number"
                  step="0.01"
                  value={pCostoQ}
                  onChange={(e) => setPCostoQ(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Stock Mínimo (alertas)</label>
                <input
                  type="number"
                  value={pMinQ}
                  onChange={(e) => setPMinQ(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={pFraccionado}
                onChange={(e) => setPFraccionado(e.target.checked)}
              />
              <span>Permitir abrir quintales y vender fraccionado por kilo</span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowProductModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-[#15803D] hover:bg-[#166534] text-white text-xs font-semibold disabled:opacity-50"
              >
                Guardar Producto
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Adjustment / Return Modal */}
      {showAdjustModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60">
          <form
            onSubmit={handleAdjustSubmit}
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4"
          >
            <h3 className="font-display font-bold text-lg text-slate-900 dark:text-slate-100">
              Ajuste o Devolución de Inventario
            </h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium mb-1">Producto</label>
                <select
                  value={adjProdId}
                  onChange={(e) => setAdjProdId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} ({p.marca}) · {p.quintalesCerrados} qq / {p.kilosSueltos} kg
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium mb-1">Tipo de movimiento</label>
                <select
                  value={adjTipo}
                  onChange={(e) => setAdjTipo(e.target.value as typeof adjTipo)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                >
                  <option value="AJUSTE_POSITIVO">Ajuste Positivo (Sobrante)</option>
                  <option value="AJUSTE_NEGATIVO">Ajuste Negativo (Merma / Daño)</option>
                  <option value="DEVOLUCION_CLIENTE">Devolución de Cliente (+Stock)</option>
                  <option value="DEVOLUCION_PROVEEDOR">Devolución a Proveedor (-Stock)</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Quintales</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={adjQ}
                    onChange={(e) => setAdjQ(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Kilos</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={adjK}
                    onChange={(e) => setAdjK(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block font-medium mb-1">Motivo obligatorio</label>
                <textarea
                  value={adjMotivo}
                  onChange={(e) => setAdjMotivo(e.target.value)}
                  rows={2}
                  required
                  placeholder="Ej. Conteo físico mensual o bolsa rota en depósito"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAdjustModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-[#15803D] hover:bg-[#166534] text-white text-xs font-semibold disabled:opacity-50"
              >
                Registrar Movimiento
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
