import React, { useMemo, useState } from 'react';
import {
  CreditCard,
  FileText,
  Printer,
  Copy,
  Check,
  Download,
  UserPlus,
  Coins,
} from 'lucide-react';
import { apiRequest, type WorkspaceData } from '../lib/api.ts';
import { exportToCsv, formatBs, formatDate, formatDateTime } from '../lib/format.ts';
import type { ToastMessage } from '../lib/notifications.ts';
import type { Customer, PaymentMethod, Purchase, SaleOrder } from '../types.ts';

interface CustomersReceivablesViewProps {
  data: WorkspaceData;
  onRefresh: () => Promise<void>;
  onToast?: (toast: Omit<ToastMessage, 'id'>) => void;
}

export function CustomersReceivablesView({ data, onRefresh, onToast }: CustomersReceivablesViewProps) {
  const { business, currentUser, customers, sales, suppliers, purchases, interDebts } = data;
  const [tab, setTab] = useState<'CXC' | 'CXP' | 'HISTORIAL'>('CXC');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  // Supplier Abono Modal
  const [payPurchase, setPayPurchase] = useState<Purchase | null>(null);
  const [supPayAmount, setSupPayAmount] = useState('');
  const [supPayMethod, setSupPayMethod] = useState<PaymentMethod>('EFECTIVO');
  const [supPayNote, setSupPayNote] = useState('');

  // Payment Modal
  const [payCustomer, setPayCustomer] = useState<Customer | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState<'FIFO' | 'ESPECIFICO'>('FIFO');
  const [paySaleId, setPaySaleId] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('EFECTIVO');
  const [payNote, setPayNote] = useState('');
  const [useAdvance, setUseAdvance] = useState(false);

  // Advance Modal
  const [advCustomer, setAdvCustomer] = useState<Customer | null>(null);
  const [advAmount, setAdvAmount] = useState('');
  const [advMethod, setAdvMethod] = useState<PaymentMethod>('EFECTIVO');

  // Statement Modal
  const [statementCustomer, setStatementCustomer] = useState<Customer | null>(null);
  const [copiedWs, setCopiedWs] = useState(false);

  // New Customer Modal
  const [showNew, setShowNew] = useState(false);
  const [cliNombre, setCliNombre] = useState('');
  const [cliTel, setCliTel] = useState('');
  const [cliDir, setCliDir] = useState('');
  const [cliNit, setCliNit] = useState('');

  const canCollect = currentUser.permisos.includes('clientes_cobrar');
  const canSeePayables = currentUser.permisos.includes('compras_ver');
  const canPaySuppliers = currentUser.permisos.includes('proveedores_pagar');

  const customerSummaries = useMemo(() => {
    return customers.map((c) => {
      const orders = sales
        .filter((s) => s.clienteId === c.id && s.estado !== 'ANULADO')
        .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
      const openOrders = orders.filter((o) => o.saldoPendiente > 0.01);
      const totalDeuda = openOrders.reduce((acc, o) => acc + o.saldoPendiente, 0);
      const totalComprado = orders.reduce((acc, o) => acc + o.total, 0);
      return { customer: c, orders, openOrders, totalDeuda, totalComprado };
    });
  }, [customers, sales]);

  const supplierSummaries = useMemo(() => {
    return suppliers.map((sup) => {
      const supPurchases = purchases.filter(
        (p) => p.proveedorId === sup.id && p.estado !== 'ANULADO'
      );
      const openPurchases = supPurchases.filter((p) => p.saldoPendiente > 0.01);
      const totalDeuda = openPurchases.reduce((a, p) => a + p.saldoPendiente, 0);
      const totalComprado = supPurchases.reduce((a, p) => a + p.total, 0);
      return { supplier: sup, purchases: supPurchases, openPurchases, totalDeuda, totalComprado };
    });
  }, [suppliers, purchases]);

  const paymentHistory = useMemo(() => {
    const entries: Array<{
      id: string;
      fecha: string;
      tipo: 'COBRO_CLIENTE' | 'PAGO_PROVEEDOR' | 'INTER_NEGOCIO';
      contraparte: string;
      referencia: string;
      metodo: string;
      monto: number;
      nota: string;
    }> = [];

    for (const s of sales) {
      if (s.estado === 'ANULADO') continue;
      for (const p of s.pagos) {
        entries.push({
          id: p.id,
          fecha: p.fecha,
          tipo: 'COBRO_CLIENTE',
          contraparte: s.clienteNombre,
          referencia: s.numero,
          metodo: p.metodoPago,
          monto: p.monto,
          nota: p.nota,
        });
      }
    }

    if (canSeePayables) {
      for (const pur of purchases) {
        if (pur.estado === 'ANULADO') continue;
        for (const a of pur.abonos) {
          entries.push({
            id: a.id,
            fecha: a.fecha,
            tipo: 'PAGO_PROVEEDOR',
            contraparte: pur.proveedorNombre,
            referencia: pur.numero,
            metodo: a.metodoPago,
            monto: a.monto,
            nota: a.nota,
          });
        }
      }
    }

    for (const d of interDebts) {
      for (const a of d.abonos) {
        entries.push({
          id: a.id,
          fecha: a.fecha,
          tipo: 'INTER_NEGOCIO',
          contraparte:
            d.acreedorNegocioId === business.id ? d.deudorNombre : d.acreedorNombre,
          referencia: d.referenciaDocumento,
          metodo: a.metodoPago,
          monto: a.monto,
          nota: a.nota,
        });
      }
    }

    return entries.sort(
      (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
    );
  }, [sales, purchases, interDebts, business.id, canSeePayables]);

  const totalPorCobrar = customerSummaries.reduce((a, s) => a + s.totalDeuda, 0);

  // Live preview of FIFO allocation in payment modal
  const fifoPreview = useMemo(() => {
    if (!payCustomer) return [];
    const open = sales
      .filter(
        (s) =>
          s.clienteId === payCustomer.id &&
          s.estado !== 'ANULADO' &&
          s.saldoPendiente > 0.01
      )
      .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

    let rem =
      Math.max(0, Number(payAmount || 0)) +
      (useAdvance ? payCustomer.saldoAnticipo : 0);

    const list =
      payMode === 'ESPECIFICO' && paySaleId
        ? open.filter((o) => o.id === paySaleId)
        : open;

    return list
      .map((o) => {
        const applied = Math.min(rem, o.saldoPendiente);
        rem = Math.max(0, rem - applied);
        return { numero: o.numero, saldoActual: o.saldoPendiente, aplicado: applied };
      })
      .filter((x) => x.aplicado > 0);
  }, [payCustomer, payAmount, payMode, paySaleId, useAdvance, sales]);

  const openPaymentModal = (c: Customer, openOrders: SaleOrder[]) => {
    setPayCustomer(c);
    const total = openOrders.reduce((a, o) => a + o.saldoPendiente, 0);
    setPayAmount(String(Math.round(total * 100) / 100));
    setPayMode('FIFO');
    setPaySaleId(openOrders[0]?.id || '');
    setUseAdvance(c.saldoAnticipo > 0);
    setPayNote('');
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payCustomer) return;
    setError('');
    setBusy(true);
    try {
      const res = await apiRequest<{
        appliedDetails: Array<{ numero: string; aplicado: number }>;
        totalApplied: number;
      }>(`/api/customers/${payCustomer.id}/payments`, {
        method: 'POST',
        body: {
          monto: Number(payAmount || 0),
          modo: payMode,
          saleId: payMode === 'ESPECIFICO' ? paySaleId : undefined,
          metodoPago: payMethod,
          nota: payNote,
          usarAnticipo: useAdvance,
        },
        userId: currentUser.id,
        businessId: business.id,
      });
      const msg = `Cobro de ${formatBs(res.totalApplied)} aplicado a: ${res.appliedDetails
        .map((d) => `${d.numero} (${formatBs(d.aplicado)})`)
        .join(', ')}.`;
      setSuccess(msg);
      onToast?.({
        type: 'success',
        title: `Cobro registrado · ${payCustomer.nombre}`,
        detail: formatBs(res.totalApplied),
      });
      setPayCustomer(null);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar cobro');
    } finally {
      setBusy(false);
    }
  };

  const handleSupplierPaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payPurchase) return;
    setError('');
    setBusy(true);
    try {
      await apiRequest(`/api/purchases/${payPurchase.id}/abonos`, {
        method: 'POST',
        body: {
          monto: Number(supPayAmount),
          metodoPago: supPayMethod,
          nota: supPayNote,
        },
        userId: currentUser.id,
        businessId: business.id,
      });
      setSuccess(`Abono registrado para compra ${payPurchase.numero}.`);
      onToast?.({
        type: 'success',
        title: `Pago a proveedor · ${payPurchase.proveedorNombre}`,
        detail: formatBs(Number(supPayAmount)),
      });
      setPayPurchase(null);
      setSupPayAmount('');
      setSupPayNote('');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar abono a proveedor');
    } finally {
      setBusy(false);
    }
  };

  const handleAdvanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!advCustomer) return;
    setError('');
    setBusy(true);
    try {
      await apiRequest(`/api/customers/${advCustomer.id}/advance`, {
        method: 'POST',
        body: { monto: Number(advAmount), metodoPago: advMethod },
        userId: currentUser.id,
        businessId: business.id,
      });
      setSuccess(`Anticipo registrado para ${advCustomer.nombre}.`);
      onToast?.({
        type: 'success',
        title: `Anticipo registrado · ${advCustomer.nombre}`,
        detail: formatBs(Number(advAmount)),
      });
      setAdvCustomer(null);
      setAdvAmount('');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar anticipo');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await apiRequest('/api/customers', {
        method: 'POST',
        body: { nombre: cliNombre, telefono: cliTel, direccion: cliDir, ciNit: cliNit },
        userId: currentUser.id,
        businessId: business.id,
      });
      setShowNew(false);
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

  const statementOrders = useMemo(() => {
    if (!statementCustomer) return [];
    return sales
      .filter((s) => s.clienteId === statementCustomer.id && s.estado !== 'ANULADO')
      .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
  }, [statementCustomer, sales]);

  const copyStatementWhatsApp = () => {
    if (!statementCustomer) return;
    const totalDeuda = statementOrders.reduce((a, o) => a + o.saldoPendiente, 0);
    const lines = [
      `*ESTADO DE CUENTA — ${business.nombre}*`,
      `Cliente: ${statementCustomer.nombre}`,
      `Fecha: ${formatDate(new Date().toISOString())}`,
      '',
      ...statementOrders.map(
        (o) =>
          `• ${o.numero} (${formatDate(o.fecha)}): Total ${formatBs(o.total)} | Pagado ${formatBs(o.montoPagado)} | Saldo *${formatBs(o.saldoPendiente)}*`
      ),
      '',
      `*DEUDA TOTAL PENDIENTE: ${formatBs(totalDeuda)}*`,
    ];
    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedWs(true);
    setTimeout(() => setCopiedWs(false), 2000);
  };

  const exportStatementCsv = () => {
    if (!statementCustomer) return;
    exportToCsv(
      `estado_cuenta_${statementCustomer.nombre.replace(/\s+/g, '_')}.csv`,
      ['N° Pedido', 'Fecha', 'Detalle', 'Total (Bs)', 'Pagado (Bs)', 'Saldo Pendiente (Bs)', 'Estado'],
      statementOrders.map((o) => [
        o.numero,
        formatDate(o.fecha),
        o.items.map((i) => `${i.cantidad} ${i.modalidad === 'KILO' ? 'kg' : 'qq'} ${i.productoNombre}`).join('; '),
        o.total,
        o.montoPagado,
        o.saldoPendiente,
        o.estado,
      ])
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 no-print">
        <div>
          <h1 className="font-display font-bold text-2xl text-slate-900 dark:text-slate-100">
            Cuentas por Cobrar y Cuentas por Pagar
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Por cobrar clientes:{' '}
            <strong className="font-mono text-[#15803D] dark:text-emerald-400">
              {formatBs(totalPorCobrar)}
            </strong>
            {canSeePayables && (
              <>
                {' '}
                · Por pagar proveedores:{' '}
                <strong className="font-mono text-red-600 dark:text-red-400">
                  {formatBs(
                    supplierSummaries.reduce((a, s) => a + s.totalDeuda, 0)
                  )}
                </strong>
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setTab('CXC')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                tab === 'CXC'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Por Cobrar ({customers.length})
            </button>
            {canSeePayables && (
              <button
                type="button"
                onClick={() => setTab('CXP')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                  tab === 'CXP'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Por Pagar ({suppliers.length})
              </button>
            )}
            <button
              type="button"
              onClick={() => setTab('HISTORIAL')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                tab === 'HISTORIAL'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Historial de Pagos ({paymentHistory.length})
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#15803D] hover:bg-[#166534] text-white text-xs font-semibold"
          >
            <UserPlus className="w-4 h-4" />
            <span>Nuevo Cliente</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 no-print">
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-700 dark:text-emerald-300 no-print">
          {success}
        </div>
      )}

      {/* TAB 1: Customer Receivables */}
      {tab === 'CXC' && (
      <div className="space-y-4 no-print">
        {customerSummaries.map(({ customer, orders, openOrders, totalDeuda, totalComprado }) => (
          <div
            key={customer.id}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="font-display font-bold text-base text-slate-900 dark:text-slate-100">
                  {customer.nombre}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Tel: {customer.telefono || '—'} · {customer.direccion || 'Sin dirección'} ·{' '}
                  {orders.length} pedido(s) · Comprado: {formatBs(totalComprado)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                {customer.saldoAnticipo > 0 && (
                  <div className="text-right">
                    <div className="text-[11px] text-slate-500">Anticipo a favor</div>
                    <div className="font-mono tabular-nums font-semibold text-sm text-emerald-600 dark:text-emerald-400">
                      {formatBs(customer.saldoAnticipo)}
                    </div>
                  </div>
                )}

                <div className="text-right">
                  <div className="text-[11px] text-slate-500">Deuda Total Consolidada</div>
                  <div
                    className={`font-mono tabular-nums font-bold text-xl ${
                      totalDeuda > 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {formatBs(totalDeuda)}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStatementCustomer(customer)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Estado de Cuenta</span>
                  </button>

                  {canCollect && (
                    <button
                      type="button"
                      onClick={() => {
                        setAdvCustomer(customer);
                        setAdvAmount('');
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <Coins className="w-3.5 h-3.5" />
                      <span>Anticipo</span>
                    </button>
                  )}

                  {canCollect && openOrders.length > 0 && (
                    <button
                      type="button"
                      onClick={() => openPaymentModal(customer, openOrders)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#15803D] hover:bg-[#166534] text-white text-xs font-semibold"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>Cobrar / Abonar</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {orders.length > 0 && (
              <div className="overflow-x-auto border-t border-slate-100 dark:border-slate-800 pt-3">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="text-[11px] text-slate-500 dark:text-slate-400">
                      <th className="py-1.5 pr-4">Pedido</th>
                      <th className="py-1.5 pr-4">Fecha</th>
                      <th className="py-1.5 pr-4">Productos</th>
                      <th className="py-1.5 pr-4 text-right">Total</th>
                      <th className="py-1.5 pr-4 text-right">Pagado</th>
                      <th className="py-1.5 text-right">Saldo Pendiente</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                    {orders.map((ord) => (
                      <tr key={ord.id}>
                        <td className="py-2 pr-4 font-mono font-semibold">{ord.numero}</td>
                        <td className="py-2 pr-4 text-slate-500">{formatDate(ord.fecha)}</td>
                        <td className="py-2 pr-4 text-slate-700 dark:text-slate-300">
                          {ord.items
                            .map(
                              (i) =>
                                `${i.cantidad} ${i.modalidad === 'KILO' ? 'kg' : 'qq'} ${i.productoNombre}`
                            )
                            .join(', ')}
                        </td>
                        <td className="py-2 pr-4 text-right font-mono tabular-nums">
                          {formatBs(ord.total)}
                        </td>
                        <td className="py-2 pr-4 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                          {formatBs(ord.montoPagado)}
                        </td>
                        <td className="py-2 text-right font-mono tabular-nums font-semibold">
                          {ord.saldoPendiente > 0 ? (
                            <span className="text-red-600 dark:text-red-400">
                              {formatBs(ord.saldoPendiente)}
                            </span>
                          ) : (
                            <span className="text-emerald-600 dark:text-emerald-400">Saldado</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
      )}

      {/* TAB 2: Supplier Payables */}
      {tab === 'CXP' && canSeePayables && (
        <div className="space-y-4 no-print">
          {supplierSummaries.map(({ supplier, purchases: supPurs, totalDeuda, totalComprado }) => (
            <div
              key={supplier.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="font-display font-bold text-base text-slate-900 dark:text-slate-100">
                    {supplier.nombre}{' '}
                    {supplier.tipo === 'INTER_NEGOCIO' && (
                      <span className="text-xs font-normal text-[#15803D] dark:text-emerald-400">
                        · Negocio Hermano
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {supplier.ciudad} · Tel: {supplier.telefono || '—'} · Total comprado:{' '}
                    {formatBs(totalComprado)}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-slate-500">Saldo Total por Pagar</div>
                  <div
                    className={`font-mono tabular-nums font-bold text-xl ${
                      totalDeuda > 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {formatBs(totalDeuda)}
                  </div>
                </div>
              </div>

              {supPurs.length > 0 && (
                <div className="overflow-x-auto border-t border-slate-100 dark:border-slate-800 pt-3">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="text-[11px] text-slate-500">
                        <th className="py-1.5 pr-4">Compra</th>
                        <th className="py-1.5 pr-4">Fecha</th>
                        <th className="py-1.5 pr-4 text-right">Total</th>
                        <th className="py-1.5 pr-4 text-right">Pagado</th>
                        <th className="py-1.5 pr-4 text-right">Saldo</th>
                        <th className="py-1.5 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                      {supPurs.map((p) => (
                        <tr key={p.id}>
                          <td className="py-2 pr-4 font-mono font-semibold">{p.numero}</td>
                          <td className="py-2 pr-4 text-slate-500">{formatDate(p.fecha)}</td>
                          <td className="py-2 pr-4 text-right font-mono tabular-nums">
                            {formatBs(p.total)}
                          </td>
                          <td className="py-2 pr-4 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                            {formatBs(p.montoPagado)}
                          </td>
                          <td className="py-2 pr-4 text-right font-mono tabular-nums font-semibold">
                            {p.saldoPendiente > 0 ? (
                              <span className="text-red-600 dark:text-red-400">
                                {formatBs(p.saldoPendiente)}
                              </span>
                            ) : (
                              <span className="text-emerald-600 dark:text-emerald-400">Pagado</span>
                            )}
                          </td>
                          <td className="py-2 text-right">
                            {p.saldoPendiente > 0 && canPaySuppliers && (
                              <button
                                type="button"
                                onClick={() => {
                                  setPayPurchase(p);
                                  setSupPayAmount(String(p.saldoPendiente));
                                }}
                                className="px-2.5 py-1 rounded-md bg-[#15803D] hover:bg-[#166534] text-white text-[11px] font-semibold"
                              >
                                Abonar
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* TAB 3: Unified Payment & Collection History */}
      {tab === 'HISTORIAL' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden no-print">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-500">
                  <th className="py-3 px-4">Fecha</th>
                  <th className="py-3 px-4">Operación</th>
                  <th className="py-3 px-4">Cliente / Proveedor</th>
                  <th className="py-3 px-4">Documento</th>
                  <th className="py-3 px-4">Método y Nota</th>
                  <th className="py-3 px-4 text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paymentHistory.map((h) => (
                  <tr key={h.id}>
                    <td className="py-3 px-4 whitespace-nowrap text-slate-500">
                      {formatDateTime(h.fecha)}
                    </td>
                    <td className="py-3 px-4 font-semibold">
                      {h.tipo === 'COBRO_CLIENTE' ? (
                        <span className="text-emerald-700 dark:text-emerald-400">
                          Cobro de cliente
                        </span>
                      ) : h.tipo === 'PAGO_PROVEEDOR' ? (
                        <span className="text-red-600 dark:text-red-400">Pago a proveedor</span>
                      ) : (
                        <span className="text-slate-700 dark:text-slate-300">Entre negocios</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-medium">{h.contraparte}</td>
                    <td className="py-3 px-4 font-mono">{h.referencia}</td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                      {h.metodo} · {h.nota}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-bold">
                      {formatBs(h.monto)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Supplier Abono Modal */}
      {payPurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 no-print">
          <form
            onSubmit={handleSupplierPaySubmit}
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4 text-xs"
          >
            <h3 className="font-display font-bold text-lg">
              Abonar a Proveedor · {payPurchase.numero}
            </h3>
            <p className="text-slate-500">
              {payPurchase.proveedorNombre} · Saldo pendiente:{' '}
              <strong className="font-mono text-red-600">
                {formatBs(payPurchase.saldoPendiente)}
              </strong>
            </p>
            <div>
              <label className="block font-medium mb-1">Monto a pagar (Bs)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={payPurchase.saldoPendiente}
                value={supPayAmount}
                onChange={(e) => setSupPayAmount(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Método de pago</label>
              <select
                value={supPayMethod}
                onChange={(e) => setSupPayMethod(e.target.value as PaymentMethod)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="EFECTIVO">Efectivo</option>
                <option value="TRANSFERENCIA_QR">Transferencia / QR</option>
                <option value="DEPOSITO">Depósito Bancario</option>
                <option value="CHEQUE">Cheque</option>
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Nota</label>
              <input
                type="text"
                value={supPayNote}
                onChange={(e) => setSupPayNote(e.target.value)}
                placeholder="Ej. N° de transferencia o recibo"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPayPurchase(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-[#15803D] hover:bg-[#166534] text-white font-semibold"
              >
                Confirmar Pago
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Payment Modal (FIFO or Specific Order) */}
      {payCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 no-print">
          <form
            onSubmit={handlePaymentSubmit}
            className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4 text-xs"
          >
            <h3 className="font-display font-bold text-lg text-slate-900 dark:text-slate-100">
              Registrar Cobro · {payCustomer.nombre}
            </h3>

            <div>
              <label className="block font-medium mb-1">¿Cómo desea aplicar el pago?</label>
              <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => setPayMode('FIFO')}
                  className={`py-2 rounded-md font-medium ${
                    payMode === 'FIFO'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Al pedido más antiguo (FIFO)
                </button>
                <button
                  type="button"
                  onClick={() => setPayMode('ESPECIFICO')}
                  className={`py-2 rounded-md font-medium ${
                    payMode === 'ESPECIFICO'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  A un pedido específico
                </button>
              </div>
            </div>

            {payMode === 'ESPECIFICO' && (
              <div>
                <label className="block font-medium mb-1">Seleccione el pedido</label>
                <select
                  value={paySaleId}
                  onChange={(e) => setPaySaleId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                >
                  {sales
                    .filter(
                      (s) =>
                        s.clienteId === payCustomer.id &&
                        s.estado !== 'ANULADO' &&
                        s.saldoPendiente > 0.01
                    )
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.numero} ({formatDate(o.fecha)}) · Saldo: {formatBs(o.saldoPendiente)}
                      </option>
                    ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium mb-1">Monto recibido (Bs)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Método de cobro</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                >
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="TRANSFERENCIA_QR">Transferencia / QR</option>
                  <option value="DEPOSITO">Depósito Bancario</option>
                </select>
              </div>
            </div>

            {payCustomer.saldoAnticipo > 0 && (
              <label className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-medium">
                <input
                  type="checkbox"
                  checked={useAdvance}
                  onChange={(e) => setUseAdvance(e.target.checked)}
                />
                <span>
                  Aplicar también anticipo disponible ({formatBs(payCustomer.saldoAnticipo)})
                </span>
              </label>
            )}

            <div>
              <label className="block font-medium mb-1">Nota (Opcional)</label>
              <input
                type="text"
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
                placeholder="Ej. Abono semanal recibido en tienda"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>

            {fifoPreview.length > 0 && (
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 space-y-1">
                <div className="font-semibold text-slate-700 dark:text-slate-300">
                  Vista previa de aplicación:
                </div>
                {fifoPreview.map((item) => (
                  <div key={item.numero} className="flex justify-between font-mono">
                    <span>
                      {item.numero} (debe {formatBs(item.saldoActual)})
                    </span>
                    <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                      Se aplica {formatBs(item.aplicado)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPayCustomer(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-[#15803D] hover:bg-[#166534] text-white font-semibold"
              >
                Confirmar Cobro
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Advance Modal */}
      {advCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 no-print">
          <form
            onSubmit={handleAdvanceSubmit}
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4 text-xs"
          >
            <h3 className="font-display font-bold text-lg">
              Registrar Anticipo · {advCustomer.nombre}
            </h3>
            <div>
              <label className="block font-medium mb-1">Monto del anticipo (Bs)</label>
              <input
                type="number"
                step="0.01"
                min="1"
                value={advAmount}
                onChange={(e) => setAdvAmount(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Método de recepción</label>
              <select
                value={advMethod}
                onChange={(e) => setAdvMethod(e.target.value as PaymentMethod)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="EFECTIVO">Efectivo</option>
                <option value="TRANSFERENCIA_QR">Transferencia / QR</option>
                <option value="DEPOSITO">Depósito Bancario</option>
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAdvCustomer(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-[#15803D] hover:bg-[#166534] text-white font-semibold"
              >
                Guardar Anticipo
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Printable & Shareable Account Statement Modal */}
      {statementCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 print:static print:bg-white print:p-0">
          <div className="w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5 max-h-[90vh] overflow-y-auto print-only-container">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div>
                <div className="text-xs font-semibold text-[#15803D] dark:text-emerald-400">
                  {business.nombre} · {business.ciudad}
                </div>
                <h2 className="font-display font-bold text-xl text-slate-900 dark:text-slate-100">
                  Estado de Cuenta: {statementCustomer.nombre}
                </h2>
                <div className="text-xs text-slate-500">
                  Tel: {statementCustomer.telefono || '—'} · Emitido el {formatDateTime(new Date().toISOString())}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 no-print">
                <button
                  type="button"
                  onClick={copyStatementWhatsApp}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium"
                >
                  {copiedWs ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedWs ? 'Copiado' : 'Copiar WhatsApp'}</span>
                </button>
                <button
                  type="button"
                  onClick={exportStatementCsv}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>CSV</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Imprimir / PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStatementCustomer(null)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs"
                >
                  Cerrar
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500">
                    <th className="py-2 pr-3">Pedido</th>
                    <th className="py-2 pr-3">Fecha</th>
                    <th className="py-2 pr-3">Detalle de Productos</th>
                    <th className="py-2 pr-3 text-right">Total</th>
                    <th className="py-2 pr-3 text-right">Abonado</th>
                    <th className="py-2 text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {statementOrders.map((o) => (
                    <tr key={o.id}>
                      <td className="py-2.5 pr-3 font-mono font-semibold">{o.numero}</td>
                      <td className="py-2.5 pr-3 whitespace-nowrap">{formatDate(o.fecha)}</td>
                      <td className="py-2.5 pr-3">
                        {o.items.map((it, idx) => (
                          <div key={idx}>
                            {it.cantidad} {it.modalidad === 'KILO' ? 'kg' : 'qq'} {it.productoNombre} ({it.marca})
                          </div>
                        ))}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono tabular-nums">
                        {formatBs(o.total)}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                        {formatBs(o.montoPagado)}
                      </td>
                      <td className="py-2.5 text-right font-mono tabular-nums font-semibold">
                        {formatBs(o.saldoPendiente)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end border-t border-slate-200 dark:border-slate-800 pt-4">
              <div className="text-right space-y-1">
                <div className="text-xs text-slate-500">Deuda Total Pendiente del Cliente</div>
                <div className="font-mono tabular-nums font-bold text-2xl text-red-600 dark:text-red-400">
                  {formatBs(statementOrders.reduce((a, o) => a + o.saldoPendiente, 0))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Customer Modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 no-print">
          <form
            onSubmit={handleCreateCustomer}
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4 text-xs"
          >
            <h3 className="font-display font-bold text-lg">Registrar Nuevo Cliente</h3>
            <div>
              <label className="block font-medium mb-1">Nombre completo</label>
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
                <label className="block font-medium mb-1">Teléfono</label>
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
                onClick={() => setShowNew(false)}
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
    </div>
  );
}
