import React, { useMemo, useState } from 'react';
import {
  Plus,
  Trash2,
  CreditCard,
  Ban,
  Building2,
  UserPlus,
  Eye,
} from 'lucide-react';
import { apiRequest, type WorkspaceData } from '../lib/api.ts';
import { formatBs, formatDateTime } from '../lib/format.ts';
import type {
  BusinessId,
  PaymentCondition,
  PaymentMethod,
  Purchase,
  Supplier,
} from '../types.ts';
import type { ToastMessage } from '../lib/notifications.ts';

interface PurchasesViewProps {
  data: WorkspaceData;
  onRefresh: () => Promise<void>;
  onToast?: (toast: Omit<ToastMessage, 'id'>) => void;
}

interface DraftLine {
  productoId: string;
  cantidadQuintales: number;
  precioQuintal: number;
}

export function PurchasesView({ data, onRefresh, onToast }: PurchasesViewProps) {
  const { business, siblingBusinesses, currentUser, products, suppliers, purchases } = data;
  const [tab, setTab] = useState<'NUEVA' | 'HISTORIAL' | 'PROVEEDORES'>('HISTORIAL');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  // New purchase form
  const [proveedorId, setProveedorId] = useState(suppliers[0]?.id || '');
  const [intermediario, setIntermediario] = useState('');
  const [tipoPago, setTipoPago] = useState<PaymentCondition>('CONTADO');
  const [pagoInicial, setPagoInicial] = useState('0');
  const [metodoPago, setMetodoPago] = useState<PaymentMethod>('EFECTIVO');
  const [pagadoPorOtroId, setPagadoPorOtroId] = useState<BusinessId | ''>('');
  const [lines, setLines] = useState<DraftLine[]>(() =>
    products[0]
      ? [{ productoId: products[0].id, cantidadQuintales: 10, precioQuintal: products[0].costoPromedioQuintal }]
      : []
  );

  // Modals
  const [abonoTarget, setAbonoTarget] = useState<Purchase | null>(null);
  const [abonoMonto, setAbonoMonto] = useState('');
  const [abonoMetodo, setAbonoMetodo] = useState<PaymentMethod>('EFECTIVO');
  const [abonoNota, setAbonoNota] = useState('');

  const [voidTarget, setVoidTarget] = useState<Purchase | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [supNombre, setSupNombre] = useState('');
  const [supTel, setSupTel] = useState('');
  const [supCiudad, setSupCiudad] = useState('Santa Cruz, Bolivia');
  const [supNit, setSupNit] = useState('');

  const canCreate = currentUser.permisos.includes('compras_crear');
  const canPay = currentUser.permisos.includes('proveedores_pagar');
  const otherBusinesses = siblingBusinesses.filter((b) => b.id !== business.id);

  const totalDraft = useMemo(
    () =>
      lines.reduce(
        (sum, l) => sum + Number(l.cantidadQuintales || 0) * Number(l.precioQuintal || 0),
        0
      ),
    [lines]
  );

  const addLine = () => {
    const p = products[0];
    if (!p) return;
    setLines((prev) => [
      ...prev,
      { productoId: p.id, cantidadQuintales: 1, precioQuintal: p.costoPromedioQuintal },
    ]);
  };

  const updateLine = (idx: number, patch: Partial<DraftLine>) => {
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== idx) return l;
        const next = { ...l, ...patch };
        if (patch.productoId) {
          const prod = products.find((p) => p.id === patch.productoId);
          if (prod) next.precioQuintal = prod.costoPromedioQuintal;
        }
        return next;
      })
    );
  };

  const handleCreatePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setBusy(true);
    try {
      const res = await apiRequest<{ purchase: Purchase }>('/api/purchases', {
        method: 'POST',
        body: {
          proveedorId,
          intermediarioNombre: intermediario,
          items: lines,
          tipoPago,
          pagoInicial: Number(pagoInicial),
          metodoPago,
          pagadoPorOtroNegocioId: pagadoPorOtroId,
        },
        userId: currentUser.id,
        businessId: business.id,
      });
      setSuccess(
        `Compra ${res.purchase.numero} registrada por ${formatBs(res.purchase.total)}. Inventario actualizado.`
      );
      onToast?.({
        type: 'success',
        title: `Compra ${res.purchase.numero} registrada`,
        detail: `${res.purchase.proveedorNombre} · ${formatBs(res.purchase.total)}`,
      });
      setIntermediario('');
      setPagadoPorOtroId('');
      setTab('HISTORIAL');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar compra');
    } finally {
      setBusy(false);
    }
  };

  const handleAddAbono = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!abonoTarget) return;
    setError('');
    setBusy(true);
    try {
      await apiRequest(`/api/purchases/${abonoTarget.id}/abonos`, {
        method: 'POST',
        body: {
          monto: Number(abonoMonto),
          metodoPago: abonoMetodo,
          nota: abonoNota,
        },
        userId: currentUser.id,
        businessId: business.id,
      });
      setSuccess(`Abono registrado en ${abonoTarget.numero}.`);
      onToast?.({
        type: 'success',
        title: `Abono aplicado a ${abonoTarget.numero}`,
        detail: `${abonoTarget.proveedorNombre} · ${formatBs(Number(abonoMonto))}`,
      });
      setAbonoTarget(null);
      setAbonoMonto('');
      setAbonoNota('');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar abono');
    } finally {
      setBusy(false);
    }
  };

  const handleVoidPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidTarget) return;
    setError('');
    setBusy(true);
    try {
      await apiRequest(`/api/purchases/${voidTarget.id}/void`, {
        method: 'POST',
        body: { motivo: voidReason },
        userId: currentUser.id,
        businessId: business.id,
      });
      setSuccess(`Compra ${voidTarget.numero} anulada conservando historial.`);
      onToast?.({
        type: 'warning',
        title: `Compra ${voidTarget.numero} anulada`,
        detail: voidReason,
      });
      setVoidTarget(null);
      setVoidReason('');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al anular compra');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await apiRequest<{ supplier: Supplier }>('/api/suppliers', {
        method: 'POST',
        body: {
          nombre: supNombre,
          telefono: supTel,
          ciudad: supCiudad,
          nit: supNit,
        },
        userId: currentUser.id,
        businessId: business.id,
      });
      setProveedorId(res.supplier.id);
      setShowNewSupplier(false);
      setSupNombre('');
      setSupTel('');
      setSupNit('');
      setSuccess(`Proveedor ${res.supplier.nombre} agregado.`);
      onToast?.({
        type: 'success',
        title: 'Proveedor registrado',
        detail: res.supplier.nombre,
      });
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear proveedor');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-2xl text-slate-900 dark:text-slate-100">
            Compras y Proveedores
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Registro de ingresos por quintal, intermediarios, abonos parciales y reembolsos entre negocios.
          </p>
        </div>

        <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg self-start">
          <button
            type="button"
            onClick={() => setTab('HISTORIAL')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium ${
              tab === 'HISTORIAL'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Historial ({purchases.length})
          </button>
          {canCreate && (
            <button
              type="button"
              onClick={() => setTab('NUEVA')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                tab === 'NUEVA'
                  ? 'bg-[#15803D] text-white'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              + Nueva Compra
            </button>
          )}
          <button
            type="button"
            onClick={() => setTab('PROVEEDORES')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium ${
              tab === 'PROVEEDORES'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Proveedores ({suppliers.length})
          </button>
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

      {tab === 'NUEVA' && canCreate && (
        <form
          onSubmit={handleCreatePurchase}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-5"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-medium text-slate-700 dark:text-slate-300">
                  Proveedor Original
                </label>
                <button
                  type="button"
                  onClick={() => setShowNewSupplier(true)}
                  className="text-[11px] font-semibold text-[#15803D] dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
                >
                  <UserPlus className="w-3 h-3" />
                  <span>Nuevo</span>
                </button>
              </div>
              <select
                value={proveedorId}
                onChange={(e) => setProveedorId(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre} {s.tipo === 'INTER_NEGOCIO' ? '(Negocio Hermano)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Vendedor o Intermediario (Opcional)
              </label>
              <input
                type="text"
                value={intermediario}
                onChange={(e) => setIntermediario(e.target.value)}
                placeholder="Ej. Corredor Juan Méndez"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                ¿Pagado por otro negocio? (Reembolso)
              </label>
              <select
                value={pagadoPorOtroId}
                onChange={(e) => setPagadoPorOtroId(e.target.value as BusinessId | '')}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="">No — Paga {business.nombreCorto}</option>
                {otherBusinesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    Pagó {b.nombre} ({b.nombreCorto})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {pagadoPorOtroId && (
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
              <Building2 className="w-4 h-4 shrink-0" />
              <span>
                El proveedor quedará saldado en Bs 0 y se generará automáticamente una cuenta por reembolsar a{' '}
                <strong>{otherBusinesses.find((b) => b.id === pagadoPorOtroId)?.nombre}</strong>.
              </span>
            </div>
          )}

          {/* Product Lines */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100">
                Detalle de Mercadería (Quintales)
              </h3>
              <button
                type="button"
                onClick={addLine}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar Producto</span>
              </button>
            </div>

            <div className="space-y-2">
              {lines.map((line, idx) => {
                const prod = products.find((p) => p.id === line.productoId);
                const subtotal = Number(line.cantidadQuintales || 0) * Number(line.precioQuintal || 0);
                return (
                  <div
                    key={idx}
                    className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 text-xs"
                  >
                    <div className="sm:col-span-5">
                      <label className="block text-[11px] text-slate-500 mb-1">Producto y Marca</label>
                      <select
                        value={line.productoId}
                        onChange={(e) => updateLine(idx, { productoId: e.target.value })}
                        className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                      >
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nombre} · {p.marca} ({p.presentacionKg} kg)
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] text-slate-500 mb-1">
                        Cant. ({prod?.unidadLabel || 'Quintal'})
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={line.cantidadQuintales}
                        onChange={(e) =>
                          updateLine(idx, { cantidadQuintales: Number(e.target.value) })
                        }
                        className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] text-slate-500 mb-1">Precio/qq (Bs)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.precioQuintal}
                        onChange={(e) =>
                          updateLine(idx, { precioQuintal: Number(e.target.value) })
                        }
                        className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                      />
                    </div>
                    <div className="sm:col-span-2 text-right font-mono tabular-nums font-semibold py-2">
                      {formatBs(subtotal)}
                    </div>
                    <div className="sm:col-span-1 text-right">
                      {lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                          className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Payment Condition */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-3 border-t border-slate-200 dark:border-slate-800 text-xs items-end">
            {!pagadoPorOtroId && (
              <>
                <div>
                  <label className="block font-medium mb-1">Condición de Pago</label>
                  <select
                    value={tipoPago}
                    onChange={(e) => setTipoPago(e.target.value as PaymentCondition)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    <option value="CONTADO">Al Contado</option>
                    <option value="CREDITO">Al Crédito (Todo pendiente)</option>
                    <option value="PARCIAL">Pago Parcial / Anticipo</option>
                  </select>
                </div>

                {tipoPago === 'PARCIAL' && (
                  <div>
                    <label className="block font-medium mb-1">Pago Inicial (Bs)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max={totalDraft}
                      value={pagoInicial}
                      onChange={(e) => setPagoInicial(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                    />
                  </div>
                )}

                {tipoPago !== 'CREDITO' && (
                  <div>
                    <label className="block font-medium mb-1">Método de Pago</label>
                    <select
                      value={metodoPago}
                      onChange={(e) => setMetodoPago(e.target.value as PaymentMethod)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                    >
                      <option value="EFECTIVO">Efectivo</option>
                      <option value="TRANSFERENCIA_QR">Transferencia / QR</option>
                      <option value="DEPOSITO">Depósito Bancario</option>
                      <option value="CHEQUE">Cheque</option>
                    </select>
                  </div>
                )}
              </>
            )}

            <div className="md:col-start-4 text-right space-y-2">
              <div className="text-xs text-slate-500">Total de Compra</div>
              <div className="font-mono tabular-nums font-bold text-2xl text-slate-900 dark:text-slate-100">
                {formatBs(totalDraft)}
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full px-5 py-2.5 rounded-lg bg-[#15803D] hover:bg-[#166534] text-white text-xs font-semibold disabled:opacity-50"
              >
                {busy ? 'Guardando...' : 'Confirmar Compra e Ingresar Stock'}
              </button>
            </div>
          </div>
        </form>
      )}

      {tab === 'HISTORIAL' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4">N° Compra / Fecha</th>
                  <th className="py-3 px-4">Proveedor e Intermediario</th>
                  <th className="py-3 px-4">Detalle</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4 text-right">Pagado</th>
                  <th className="py-3 px-4 text-right">Pendiente</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {purchases.map((pur) => (
                  <tr key={pur.id} className={pur.estado === 'ANULADO' ? 'opacity-50' : ''}>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {pur.numero}
                      </div>
                      <div className="text-[11px] text-slate-500">{formatDateTime(pur.fecha)}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {pur.proveedorNombre}
                      </div>
                      {pur.intermediarioNombre && (
                        <div className="text-[11px] text-slate-500">
                          Intermediario: {pur.intermediarioNombre}
                        </div>
                      )}
                      {pur.pagadoPorOtroNegocioNombre && (
                        <div className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                          Pagado por {pur.pagadoPorOtroNegocioNombre} (Reembolso)
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {pur.items.map((it, i) => (
                        <div key={i} className="text-slate-700 dark:text-slate-300">
                          {it.cantidadQuintales} qq · {it.productoNombre} ({it.marca}) @{' '}
                          <span className="font-mono">{formatBs(it.precioQuintal)}</span>
                        </div>
                      ))}
                      {pur.abonos.length > 0 && (
                        <div className="text-[11px] text-slate-400 mt-1">
                          {pur.abonos.length} abono(s) registrado(s)
                        </div>
                      )}
                      {pur.estado === 'ANULADO' && (
                        <div className="text-[11px] text-red-600 mt-0.5">
                          ANULADA: {pur.motivoAnulacion}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                      {formatBs(pur.total)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                      {formatBs(pur.montoPagado)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-bold">
                      {pur.saldoPendiente > 0 ? (
                        <span className="text-red-600 dark:text-red-400">
                          {formatBs(pur.saldoPendiente)}
                        </span>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400">Saldado</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {pur.estado !== 'ANULADO' && pur.saldoPendiente > 0 && canPay && (
                          <button
                            type="button"
                            onClick={() => {
                              setAbonoTarget(pur);
                              setAbonoMonto(String(pur.saldoPendiente));
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-slate-900 dark:bg-slate-700 text-white text-[11px] font-medium hover:bg-slate-800"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                            <span>Abonar</span>
                          </button>
                        )}
                        {pur.estado !== 'ANULADO' && canCreate && (
                          <button
                            type="button"
                            onClick={() => setVoidTarget(pur)}
                            className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                            title="Anular compra"
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'PROVEEDORES' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {suppliers.map((sup) => {
            const supPurchases = purchases.filter(
              (p) => p.proveedorId === sup.id && p.estado !== 'ANULADO'
            );
            const totalComprado = supPurchases.reduce((a, p) => a + p.total, 0);
            const totalPendiente = supPurchases.reduce((a, p) => a + p.saldoPendiente, 0);
            return (
              <div
                key={sup.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-display font-bold text-sm text-slate-900 dark:text-slate-100">
                      {sup.nombre}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {sup.ciudad} · Tel: {sup.telefono || '—'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedSupplier(sup)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#15803D] dark:text-emerald-400 hover:underline"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Historial</span>
                  </button>
                </div>
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-slate-500">Total Comprado</div>
                    <div className="font-mono tabular-nums font-semibold">
                      {formatBs(totalComprado)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Saldo Pendiente</div>
                    <div
                      className={`font-mono tabular-nums font-bold ${
                        totalPendiente > 0
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {formatBs(totalPendiente)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Abono Modal */}
      {abonoTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60">
          <form
            onSubmit={handleAddAbono}
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4"
          >
            <h3 className="font-display font-bold text-lg">
              Registrar Abono · {abonoTarget.numero}
            </h3>
            <p className="text-xs text-slate-500">
              Proveedor: <strong>{abonoTarget.proveedorNombre}</strong> · Saldo pendiente:{' '}
              <span className="font-mono font-bold text-red-600">
                {formatBs(abonoTarget.saldoPendiente)}
              </span>
            </p>
            {abonoTarget.abonos.length > 0 && (
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 text-[11px] space-y-1 max-h-28 overflow-y-auto">
                <div className="font-semibold text-slate-600 dark:text-slate-300">
                  Abonos previos:
                </div>
                {abonoTarget.abonos.map((a) => (
                  <div key={a.id} className="flex justify-between font-mono">
                    <span>
                      {formatDateTime(a.fecha)} ({a.metodoPago})
                    </span>
                    <span>{formatBs(a.monto)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium mb-1">Monto a abonar (Bs)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={abonoTarget.saldoPendiente}
                  value={abonoMonto}
                  onChange={(e) => setAbonoMonto(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Método de pago</label>
                <select
                  value={abonoMetodo}
                  onChange={(e) => setAbonoMetodo(e.target.value as PaymentMethod)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                >
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="TRANSFERENCIA_QR">Transferencia / QR</option>
                  <option value="DEPOSITO">Depósito Bancario</option>
                  <option value="CHEQUE">Cheque</option>
                </select>
              </div>
              <div>
                <label className="block font-medium mb-1">Nota / Comprobante</label>
                <input
                  type="text"
                  value={abonoNota}
                  onChange={(e) => setAbonoNota(e.target.value)}
                  placeholder="Ej. N° de transferencia o recibo"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAbonoTarget(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-[#15803D] hover:bg-[#166534] text-white text-xs font-semibold"
              >
                Registrar Abono
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Void Modal */}
      {voidTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60">
          <form
            onSubmit={handleVoidPurchase}
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4"
          >
            <h3 className="font-display font-bold text-lg text-red-600">
              Anular Compra {voidTarget.numero}
            </h3>
            <p className="text-xs text-slate-500">
              El documento quedará marcado como ANULADO en el historial y se revertirá el stock ingresado.
            </p>
            <textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="Indique el motivo de la anulación..."
              required
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setVoidTarget(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold"
              >
                Confirmar Anulación
              </button>
            </div>
          </form>
        </div>
      )}

      {/* New Supplier Modal */}
      {showNewSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60">
          <form
            onSubmit={handleCreateSupplier}
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4 text-xs"
          >
            <h3 className="font-display font-bold text-lg">Nuevo Proveedor</h3>
            <div>
              <label className="block font-medium mb-1">Razón social o nombre</label>
              <input
                type="text"
                value={supNombre}
                onChange={(e) => setSupNombre(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium mb-1">Teléfono</label>
                <input
                  type="text"
                  value={supTel}
                  onChange={(e) => setSupTel(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">NIT</label>
                <input
                  type="text"
                  value={supNit}
                  onChange={(e) => setSupNit(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>
            </div>
            <div>
              <label className="block font-medium mb-1">Ciudad / Origen</label>
              <input
                type="text"
                value={supCiudad}
                onChange={(e) => setSupCiudad(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewSupplier(false)}
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

      {/* Supplier History Modal */}
      {selectedSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-lg">
                Historial de Compras · {selectedSupplier.nombre}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedSupplier(null)}
                className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700"
              >
                Cerrar
              </button>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {purchases
                .filter((p) => p.proveedorId === selectedSupplier.id)
                .map((p) => (
                  <div key={p.id} className="py-3 flex justify-between gap-4">
                    <div>
                      <div className="font-mono font-semibold">
                        {p.numero} · {formatDateTime(p.fecha)}
                      </div>
                      <div className="text-slate-500">
                        {p.items.map((i) => `${i.cantidadQuintales} qq ${i.productoNombre}`).join(', ')}
                      </div>
                    </div>
                    <div className="text-right font-mono tabular-nums">
                      <div className="font-semibold">{formatBs(p.total)}</div>
                      <div className={p.saldoPendiente > 0 ? 'text-red-600' : 'text-emerald-600'}>
                        {p.saldoPendiente > 0 ? `Debe ${formatBs(p.saldoPendiente)}` : 'Pagado'}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
