import React, { useMemo, useState } from 'react';
import {
  Plus,
  Trash2,
  ShoppingCart,
  Ban,
  UserPlus,
  Building2,
  Printer,
  Search,
} from 'lucide-react';
import { apiRequest, type WorkspaceData } from '../lib/api.ts';
import { formatBs, formatDateTime } from '../lib/format.ts';
import type { ToastMessage } from '../lib/notifications.ts';
import type {
  BusinessId,
  Customer,
  PaymentCondition,
  PaymentMethod,
  SaleOrder,
} from '../types.ts';

interface SalesPosViewProps {
  data: WorkspaceData;
  onRefresh: () => Promise<void>;
  onToast?: (toast: Omit<ToastMessage, 'id'>) => void;
}

interface CartLine {
  productoId: string;
  modalidad: 'QUINTAL' | 'KILO';
  cantidad: number;
  precioUnitario: number;
}

export function SalesPosView({ data, onRefresh, onToast }: SalesPosViewProps) {
  const { business, siblingBusinesses, currentUser, products, customers, sales } = data;
  const [tab, setTab] = useState<'POS' | 'HISTORIAL'>('POS');
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatus, setHistoryStatus] = useState<'TODOS' | SaleOrder['estado']>('TODOS');
  const [receiptSale, setReceiptSale] = useState<SaleOrder | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  const allowsKilo = business.configuracion.permitirVentaPorKilo;
  const otherBusinesses = siblingBusinesses.filter((b) => b.id !== business.id);

  const [saleTargetType, setSaleTargetType] = useState<'CLIENTE' | 'NEGOCIO_HERMANO'>('CLIENTE');
  const [clienteId, setClienteId] = useState<string>(customers[0]?.id || 'ocasional');
  const [destinoNegocioId, setDestinoNegocioId] = useState<BusinessId | ''>(
    otherBusinesses[0]?.id || ''
  );
  const [tipoPago, setTipoPago] = useState<PaymentCondition>('CONTADO');
  const [pagoInicial, setPagoInicial] = useState('0');
  const [metodoPago, setMetodoPago] = useState<PaymentMethod>('EFECTIVO');
  const [nota, setNota] = useState('');
  const [cart, setCart] = useState<CartLine[]>(() =>
    products[0]
      ? [
          {
            productoId: products[0].id,
            modalidad: 'QUINTAL',
            cantidad: 1,
            precioUnitario: products[0].precioQuintal,
          },
        ]
      : []
  );

  // Quick new customer modal
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [cliNombre, setCliNombre] = useState('');
  const [cliTel, setCliTel] = useState('');
  const [cliDir, setCliDir] = useState('');
  const [cliNit, setCliNit] = useState('');

  // Void sale modal
  const [voidTarget, setVoidTarget] = useState<SaleOrder | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const canVoid = currentUser.permisos.includes('ventas_anular');

  const filteredSales = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return sales.filter((s) => {
      if (historyStatus !== 'TODOS' && s.estado !== historyStatus) return false;
      if (!q) return true;
      return (
        s.numero.toLowerCase().includes(q) ||
        s.clienteNombre.toLowerCase().includes(q) ||
        s.items.some((i) => i.productoNombre.toLowerCase().includes(q))
      );
    });
  }, [sales, historySearch, historyStatus]);

  const totalCart = useMemo(
    () =>
      cart.reduce(
        (sum, l) => sum + Number(l.cantidad || 0) * Number(l.precioUnitario || 0),
        0
      ),
    [cart]
  );

  const addCartLine = (prodId?: string) => {
    const p = products.find((x) => x.id === prodId) || products[0];
    if (!p) return;
    setCart((prev) => [
      ...prev,
      {
        productoId: p.id,
        modalidad: 'QUINTAL',
        cantidad: 1,
        precioUnitario: p.precioQuintal,
      },
    ]);
  };

  const updateCartLine = (idx: number, patch: Partial<CartLine>) => {
    setCart((prev) =>
      prev.map((line, i) => {
        if (i !== idx) return line;
        const next = { ...line, ...patch };
        const prod = products.find((p) => p.id === next.productoId);
        if (prod && (patch.productoId || patch.modalidad)) {
          if (next.modalidad === 'KILO' && (!allowsKilo || !prod.permiteFraccionado)) {
            next.modalidad = 'QUINTAL';
          }
          next.precioUnitario =
            next.modalidad === 'KILO' ? prod.precioKilo : prod.precioQuintal;
        }
        return next;
      })
    );
  };

  const handleConfirmSale = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setBusy(true);
    try {
      const res = await apiRequest<{ sale: SaleOrder }>('/api/sales', {
        method: 'POST',
        body: {
          clienteId: saleTargetType === 'CLIENTE' ? clienteId : undefined,
          destinoNegocioId: saleTargetType === 'NEGOCIO_HERMANO' ? destinoNegocioId : '',
          items: cart,
          tipoPago,
          pagoInicial: Number(pagoInicial),
          metodoPago,
          nota,
        },
        userId: currentUser.id,
        businessId: business.id,
      });
      const msg = `Pedido ${res.sale.numero} registrado por ${formatBs(res.sale.total)}.${
        saleTargetType === 'NEGOCIO_HERMANO'
          ? ' Se generó automáticamente la compra interna y cuenta entre negocios.'
          : ''
      }`;
      setSuccess(msg);
      onToast?.({
        type: 'success',
        title: `Venta ${res.sale.numero} confirmada`,
        detail: `${res.sale.clienteNombre} · ${formatBs(res.sale.total)}`,
      });
      setNota('');
      setPagoInicial('0');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar pedido');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await apiRequest<{ customer: Customer }>('/api/customers', {
        method: 'POST',
        body: {
          nombre: cliNombre,
          telefono: cliTel,
          direccion: cliDir,
          ciNit: cliNit,
        },
        userId: currentUser.id,
        businessId: business.id,
      });
      setClienteId(res.customer.id);
      setShowNewCustomer(false);
      setCliNombre('');
      setCliTel('');
      setCliDir('');
      setCliNit('');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear cliente');
    } finally {
      setBusy(false);
    }
  };

  const handleVoidSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidTarget) return;
    setError('');
    setBusy(true);
    try {
      await apiRequest(`/api/sales/${voidTarget.id}/void`, {
        method: 'POST',
        body: { motivo: voidReason },
        userId: currentUser.id,
        businessId: business.id,
      });
      setSuccess(`Pedido ${voidTarget.numero} anulado; mercadería reingresada al inventario.`);
      onToast?.({
        type: 'warning',
        title: `Pedido ${voidTarget.numero} anulado`,
        detail: 'Stock reingresado y movimiento auditado.',
      });
      setVoidTarget(null);
      setVoidReason('');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al anular pedido');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-2xl text-slate-900 dark:text-slate-100">
            Ventas y Pedidos (POS)
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Pedidos multimarca en {business.nombre} ·{' '}
            {allowsKilo ? 'Quintal cerrado o fraccionado por kilo' : 'Venta mayorista por quintal cerrado'}
          </p>
        </div>

        <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg self-start">
          <button
            type="button"
            onClick={() => setTab('POS')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium ${
              tab === 'POS'
                ? 'bg-[#15803D] text-white'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Nuevo Pedido
          </button>
          <button
            type="button"
            onClick={() => setTab('HISTORIAL')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium ${
              tab === 'HISTORIAL'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Historial de Pedidos ({sales.length})
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

      {tab === 'POS' ? (
        <form onSubmit={handleConfirmSale} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Product Quick Picker & Cart */}
          <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display font-bold text-base text-slate-900 dark:text-slate-100">
                Productos del Pedido
              </h2>
              <button
                type="button"
                onClick={() => addCartLine()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-700 text-white text-xs font-medium hover:bg-slate-800"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar Línea</span>
              </button>
            </div>

            <div className="space-y-3">
              {cart.map((line, idx) => {
                const prod = products.find((p) => p.id === line.productoId);
                const subtotal = Number(line.cantidad || 0) * Number(line.precioUnitario || 0);
                const canKg = Boolean(allowsKilo && prod?.permiteFraccionado);

                return (
                  <div
                    key={idx}
                    className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-2"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end text-xs">
                      <div className="sm:col-span-5">
                        <label className="block text-[11px] text-slate-500 mb-1">
                          Producto y Marca
                        </label>
                        <select
                          value={line.productoId}
                          onChange={(e) => updateCartLine(idx, { productoId: e.target.value })}
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
                        <label className="block text-[11px] text-slate-500 mb-1">Modalidad</label>
                        <select
                          value={line.modalidad}
                          onChange={(e) =>
                            updateCartLine(idx, {
                              modalidad: e.target.value as 'QUINTAL' | 'KILO',
                            })
                          }
                          className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                        >
                          <option value="QUINTAL">Quintal cerrado</option>
                          {canKg && <option value="KILO">Por Kilo (kg)</option>}
                        </select>
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-[11px] text-slate-500 mb-1">
                          Cant. ({line.modalidad === 'KILO' ? 'kg' : 'qq'})
                        </label>
                        <input
                          type="number"
                          min={line.modalidad === 'KILO' ? '0.5' : '1'}
                          step={line.modalidad === 'KILO' ? '0.5' : '1'}
                          value={line.cantidad}
                          onChange={(e) =>
                            updateCartLine(idx, { cantidad: Number(e.target.value) })
                          }
                          className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-[11px] text-slate-500 mb-1">Precio Unit.</label>
                        <input
                          type="number"
                          step="0.01"
                          value={line.precioUnitario}
                          onChange={(e) =>
                            updateCartLine(idx, { precioUnitario: Number(e.target.value) })
                          }
                          className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                        />
                      </div>

                      <div className="sm:col-span-1 text-right">
                        {cart.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setCart((prev) => prev.filter((_, i) => i !== idx))}
                            className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {prod && (
                      <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                        <span>
                          Disponible: <strong className="font-mono">{prod.quintalesCerrados} qq cerrados</strong>
                          {canKg && (
                            <>
                              {' '}
                              · <strong className="font-mono">{prod.kilosSueltos} kg sueltos</strong>
                              {line.modalidad === 'KILO' &&
                                line.cantidad > prod.kilosSueltos &&
                                business.configuracion.autoAbrirQuintalEnVenta && (
                                  <span className="text-[#15803D] dark:text-emerald-400 ml-1">
                                    (Se abrirá 1 quintal de {prod.presentacionKg} kg automáticamente)
                                  </span>
                                )}
                            </>
                          )}
                        </span>
                        <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100">
                          Subtotal: {formatBs(subtotal)}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Customer & Payment Summary */}
          <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 text-xs">
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Tipo de Comprador
              </label>
              <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => setSaleTargetType('CLIENTE')}
                  className={`py-1.5 rounded-md font-medium ${
                    saleTargetType === 'CLIENTE'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Cliente Externo
                </button>
                <button
                  type="button"
                  onClick={() => setSaleTargetType('NEGOCIO_HERMANO')}
                  className={`py-1.5 rounded-md font-medium inline-flex items-center justify-center gap-1 ${
                    saleTargetType === 'NEGOCIO_HERMANO'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Building2 className="w-3 h-3" />
                  <span>Otro Negocio</span>
                </button>
              </div>
            </div>

            {saleTargetType === 'CLIENTE' ? (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-medium text-slate-700 dark:text-slate-300">Cliente</label>
                  <button
                    type="button"
                    onClick={() => setShowNewCustomer(true)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#15803D] dark:text-emerald-400 hover:underline"
                  >
                    <UserPlus className="w-3 h-3" />
                    <span>Nuevo Cliente</span>
                  </button>
                </div>
                <select
                  value={clienteId}
                  onChange={(e) => setClienteId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                >
                  <option value="ocasional">Cliente Ocasional (Mostrador)</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Negocio Receptor (Compra Interna Automática)
                </label>
                <select
                  value={destinoNegocioId}
                  onChange={(e) => setDestinoNegocioId(e.target.value as BusinessId)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                >
                  {otherBusinesses.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nombre} ({b.nombreCorto})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  Ingresará la mercadería automáticamente al depósito del negocio receptor y registrará la deuda entre ambos negocios sin duplicar deudas con proveedores.
                </p>
              </div>
            )}

            <div>
              <label className="block font-medium mb-1">Condición de Pago</label>
              <select
                value={tipoPago}
                onChange={(e) => setTipoPago(e.target.value as PaymentCondition)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="CONTADO">Al Contado</option>
                <option value="CREDITO">Al Crédito</option>
                <option value="PARCIAL">Pago Parcial</option>
              </select>
            </div>

            {tipoPago === 'PARCIAL' && (
              <div>
                <label className="block font-medium mb-1">Pago Inicial Recibido (Bs)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={totalCart}
                  value={pagoInicial}
                  onChange={(e) => setPagoInicial(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                />
              </div>
            )}

            {tipoPago !== 'CREDITO' && (
              <div>
                <label className="block font-medium mb-1">Método de Cobro</label>
                <select
                  value={metodoPago}
                  onChange={(e) => setMetodoPago(e.target.value as PaymentMethod)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                >
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="TRANSFERENCIA_QR">Transferencia / QR</option>
                  <option value="DEPOSITO">Depósito Bancario</option>
                </select>
              </div>
            )}

            <div>
              <label className="block font-medium mb-1">Nota del Pedido (Opcional)</label>
              <input
                type="text"
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Ej. Entrega en tienda por la tarde"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Total del Pedido</span>
                <span className="font-mono tabular-nums font-bold text-2xl text-slate-900 dark:text-slate-100">
                  {formatBs(totalCart)}
                </span>
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-lg bg-[#15803D] hover:bg-[#166534] text-white text-sm font-semibold transition-colors disabled:opacity-50"
              >
                <ShoppingCart className="w-4 h-4" />
                <span>{busy ? 'Procesando...' : 'Confirmar Pedido'}</span>
              </button>
            </div>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Buscar por pedido, cliente o producto..."
                className="pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs w-full sm:w-72"
              />
            </div>
            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg self-start flex-wrap">
              {(['TODOS', 'PAGADO', 'PARCIAL', 'PENDIENTE', 'ANULADO'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setHistoryStatus(st)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium ${
                    historyStatus === st
                      ? 'bg-[#15803D] text-white'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {st === 'TODOS' ? 'Todos' : st.charAt(0) + st.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    <th className="py-3 px-4">N° Pedido / Fecha</th>
                    <th className="py-3 px-4">Cliente</th>
                    <th className="py-3 px-4">Detalle</th>
                    <th className="py-3 px-4 text-right">Total</th>
                    <th className="py-3 px-4 text-right">Cobrado</th>
                    <th className="py-3 px-4 text-right">Saldo</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {filteredSales.map((s) => (
                    <tr key={s.id} className={s.estado === 'ANULADO' ? 'opacity-50' : ''}>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                          {s.numero}
                        </div>
                        <div className="text-[11px] text-slate-500">{formatDateTime(s.fecha)}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {s.clienteNombre}
                        </div>
                        <div className="text-[11px] text-slate-500">Atendido por {s.usuarioNombre}</div>
                      </td>
                      <td className="py-3 px-4">
                        {s.items.map((it, idx) => (
                          <div key={idx} className="text-slate-700 dark:text-slate-300">
                            {it.cantidad} {it.modalidad === 'KILO' ? 'kg' : 'qq'} · {it.productoNombre} ({it.marca})
                          </div>
                        ))}
                        {s.estado === 'ANULADO' && (
                          <div className="text-[11px] text-red-600 mt-0.5">
                            ANULADO: {s.motivoAnulacion}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                        {formatBs(s.total)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                        {formatBs(s.montoPagado)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-bold">
                        {s.saldoPendiente > 0 ? (
                          <span className="text-red-600 dark:text-red-400">
                            {formatBs(s.saldoPendiente)}
                          </span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400">Pagado</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setReceiptSale(s)}
                            className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                            title="Ver / Imprimir nota de entrega"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          {s.estado !== 'ANULADO' && canVoid && (
                            <button
                              type="button"
                              onClick={() => setVoidTarget(s)}
                              className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                              title="Anular pedido"
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
        </div>
      )}

      {/* Printable Order Receipt Modal */}
      {receiptSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 print:static print:bg-white print:p-0">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4 print-only-container">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div>
                <div className="text-xs font-semibold text-[#15803D] dark:text-emerald-400">
                  {business.nombre} · NIT {business.nit}
                </div>
                <h3 className="font-display font-bold text-lg text-slate-900 dark:text-slate-100">
                  Nota de Pedido {receiptSale.numero}
                </h3>
                <p className="text-xs text-slate-500">
                  {formatDateTime(receiptSale.fecha)} · Cliente: {receiptSale.clienteNombre}
                </p>
              </div>
              <div className="flex items-center gap-2 no-print">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#15803D] text-white text-xs font-semibold"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Imprimir</span>
                </button>
                <button
                  type="button"
                  onClick={() => setReceiptSale(null)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs"
                >
                  Cerrar
                </button>
              </div>
            </div>

            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500">
                  <th className="py-2">Producto</th>
                  <th className="py-2 text-right">Cant.</th>
                  <th className="py-2 text-right">P. Unit</th>
                  <th className="py-2 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {receiptSale.items.map((it, idx) => (
                  <tr key={idx}>
                    <td className="py-2">
                      {it.productoNombre} ({it.marca})
                    </td>
                    <td className="py-2 text-right font-mono">
                      {it.cantidad} {it.modalidad === 'KILO' ? 'kg' : 'qq'}
                    </td>
                    <td className="py-2 text-right font-mono">{formatBs(it.precioUnitario)}</td>
                    <td className="py-2 text-right font-mono font-semibold">
                      {formatBs(it.subtotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="border-t border-slate-200 dark:border-slate-800 pt-3 space-y-1 text-xs text-right font-mono tabular-nums">
              <div>
                Total Pedido: <strong className="text-sm">{formatBs(receiptSale.total)}</strong>
              </div>
              <div className="text-emerald-700 dark:text-emerald-400">
                Pagado: {formatBs(receiptSale.montoPagado)}
              </div>
              <div>
                Saldo Pendiente:{' '}
                <strong className={receiptSale.saldoPendiente > 0 ? 'text-red-600' : ''}>
                  {formatBs(receiptSale.saldoPendiente)}
                </strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Customer Modal */}
      {showNewCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60">
          <form
            onSubmit={handleCreateCustomer}
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4 text-xs"
          >
            <h3 className="font-display font-bold text-lg">Registrar Nuevo Cliente</h3>
            <div>
              <label className="block font-medium mb-1">Nombre completo o razón social</label>
              <input
                type="text"
                value={cliNombre}
                onChange={(e) => setCliNombre(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium mb-1">Teléfono / WhatsApp</label>
                <input
                  type="text"
                  value={cliTel}
                  onChange={(e) => setCliTel(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">CI / NIT</label>
                <input
                  type="text"
                  value={cliNit}
                  onChange={(e) => setCliNit(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>
            </div>
            <div>
              <label className="block font-medium mb-1">Dirección</label>
              <input
                type="text"
                value={cliDir}
                onChange={(e) => setCliDir(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewCustomer(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-[#15803D] hover:bg-[#166534] text-white font-semibold"
              >
                Guardar Cliente
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Void Sale Modal */}
      {voidTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60">
          <form
            onSubmit={handleVoidSale}
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4"
          >
            <h3 className="font-display font-bold text-lg text-red-600">
              Anular Pedido {voidTarget.numero}
            </h3>
            <p className="text-xs text-slate-500">
              La mercadería volverá al depósito y el pedido permanecerá visible como ANULADO para auditoría.
            </p>
            <textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="Indique el motivo de anulación..."
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
    </div>
  );
}
