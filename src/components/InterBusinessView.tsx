import React, { useState } from 'react';
import { ArrowLeftRight, Plus, RotateCcw, Building2, CreditCard } from 'lucide-react';
import { apiRequest, type WorkspaceData } from '../lib/api.ts';
import { formatBs, formatDateTime } from '../lib/format.ts';
import type {
  BusinessId,
  InterBusinessDebt,
  InterBusinessLoan,
  PaymentMethod,
} from '../types.ts';
import type { ToastMessage } from '../lib/notifications.ts';

interface InterBusinessViewProps {
  data: WorkspaceData;
  onRefresh: () => Promise<void>;
  onToast?: (toast: Omit<ToastMessage, 'id'>) => void;
}

export function InterBusinessView({ data, onRefresh, onToast }: InterBusinessViewProps) {
  const { business, siblingBusinesses, currentUser, products, loans, interDebts } = data;
  const [tab, setTab] = useState<'PRESTAMOS' | 'CUENTAS'>('PRESTAMOS');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  const otherBusinesses = siblingBusinesses.filter((b) => b.id !== business.id);

  // Loan creation modal
  const [showLoanModal, setShowLoanModal] = useState(false);
  const [loanDestId, setLoanDestId] = useState<BusinessId>(otherBusinesses[0]?.id || 'neg_hermano');
  const [loanProdId, setLoanProdId] = useState(products[0]?.id || '');
  const [loanQty, setLoanQty] = useState('5');
  const [loanNotes, setLoanNotes] = useState('');

  // Loan partial return modal
  const [returnTarget, setReturnTarget] = useState<InterBusinessLoan | null>(null);
  const [returnQty, setReturnQty] = useState('');
  const [returnNota, setReturnNota] = useState('');

  // Inter-business debt payment modal
  const [debtTarget, setDebtTarget] = useState<InterBusinessDebt | null>(null);
  const [debtPayAmount, setDebtPayAmount] = useState('');
  const [debtPayMethod, setDebtPayMethod] = useState<PaymentMethod>('TRANSFERENCIA_QR');
  const [debtPayNote, setDebtPayNote] = useState('');

  const handleCreateLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await apiRequest<{ loan: InterBusinessLoan }>('/api/loans', {
        method: 'POST',
        body: {
          negocioDestinoId: loanDestId,
          productoId: loanProdId,
          cantidadQuintales: Number(loanQty),
          notas: loanNotes,
        },
        userId: currentUser.id,
        businessId: business.id,
      });
      setSuccess(
        `Préstamo ${res.loan.codigo} registrado: ${res.loan.cantidadPrestadaQuintales} qq enviados a ${res.loan.negocioDestinoNombre}. No afecta ventas ni compras.`
      );
      onToast?.({
        type: 'success',
        title: `Préstamo ${res.loan.codigo} emitido`,
        detail: `${res.loan.cantidadPrestadaQuintales} qq → ${res.loan.negocioDestinoNombre}`,
      });
      setShowLoanModal(false);
      setLoanNotes('');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar préstamo');
    } finally {
      setBusy(false);
    }
  };

  const handleReturnLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnTarget) return;
    setError('');
    setBusy(true);
    try {
      await apiRequest(`/api/loans/${returnTarget.id}/return`, {
        method: 'POST',
        body: { cantidadQuintales: Number(returnQty), nota: returnNota },
        userId: currentUser.id,
        businessId: business.id,
      });
      setSuccess(
        `Devolución registrada en ${returnTarget.codigo}. Ambos inventarios actualizados automáticamente.`
      );
      onToast?.({
        type: 'success',
        title: `Devolución registrada (${returnTarget.codigo})`,
        detail: `+${returnQty} qq reintegrados al inventario.`,
      });
      setReturnTarget(null);
      setReturnQty('');
      setReturnNota('');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al devolver préstamo');
    } finally {
      setBusy(false);
    }
  };

  const handlePayInterDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!debtTarget) return;
    setError('');
    setBusy(true);
    try {
      await apiRequest(`/api/inter-debts/${debtTarget.id}/pay`, {
        method: 'POST',
        body: {
          monto: Number(debtPayAmount),
          metodoPago: debtPayMethod,
          nota: debtPayNote,
        },
        userId: currentUser.id,
        businessId: business.id,
      });
      setSuccess(`Pago/reembolso registrado en ${debtTarget.referenciaDocumento}.`);
      onToast?.({
        type: 'success',
        title: `Reembolso registrado (${debtTarget.referenciaDocumento})`,
        detail: formatBs(Number(debtPayAmount)),
      });
      setDebtTarget(null);
      setDebtPayAmount('');
      setDebtPayNote('');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar pago entre negocios');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-2xl text-slate-900 dark:text-slate-100">
            Préstamos y Operaciones Entre Negocios
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Préstamos de mercadería (con devolución parcial) y cuentas por compras/reembolsos entre Mamá, Hermano y Mi Negocio.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setTab('PRESTAMOS')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                tab === 'PRESTAMOS'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Préstamos de Mercadería ({loans.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('CUENTAS')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                tab === 'CUENTAS'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Deudas y Reembolsos ({interDebts.length})
            </button>
          </div>

          {tab === 'PRESTAMOS' && (
            <button
              type="button"
              onClick={() => {
                setLoanProdId(products[0]?.id || '');
                setShowLoanModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#15803D] hover:bg-[#166534] text-white text-xs font-semibold"
            >
              <Plus className="w-4 h-4" />
              <span>Prestar Mercadería</span>
            </button>
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

      {tab === 'PRESTAMOS' ? (
        <div className="space-y-4">
          {loans.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center space-y-2">
              <ArrowLeftRight className="w-8 h-8 text-slate-400 mx-auto" />
              <div className="font-display font-semibold text-sm">
                Sin préstamos de mercadería registrados
              </div>
              <p className="text-xs text-slate-500">
                Los préstamos descuentan stock del negocio origen y generan obligación de devolución en el receptor sin mezclarse con ventas.
              </p>
            </div>
          ) : (
            loans.map((loan) => {
              const isLender = loan.negocioOrigenId === business.id;
              return (
                <div
                  key={loan.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="text-xs font-mono text-slate-500">
                        {loan.codigo} · {formatDateTime(loan.fecha)} ·{' '}
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {loan.estado.replace('_', ' ')}
                        </span>
                      </div>
                      <h3 className="font-display font-bold text-base text-slate-900 dark:text-slate-100">
                        {loan.productoNombre} ({loan.marca}) · {loan.presentacionKg} kg
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-slate-300">
                        {isLender ? (
                          <>
                            <strong>Entregado en préstamo a:</strong> {loan.negocioDestinoNombre}
                          </>
                        ) : (
                          <>
                            <strong>Recibido en préstamo de:</strong> {loan.negocioOrigenNombre}
                          </>
                        )}
                      </p>
                      {loan.notas && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">{loan.notas}</p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-5">
                      <div className="text-right font-mono tabular-nums text-xs">
                        <div className="text-slate-500">Prestado</div>
                        <div className="font-bold text-sm">{loan.cantidadPrestadaQuintales} qq</div>
                      </div>
                      <div className="text-right font-mono tabular-nums text-xs">
                        <div className="text-slate-500">Devuelto</div>
                        <div className="font-bold text-sm text-emerald-600 dark:text-emerald-400">
                          {loan.cantidadDevueltaQuintales} qq
                        </div>
                      </div>
                      <div className="text-right font-mono tabular-nums text-xs">
                        <div className="text-slate-500">Pendiente</div>
                        <div className="font-bold text-base text-[#15803D] dark:text-emerald-400">
                          {loan.cantidadPendienteQuintales} qq
                        </div>
                      </div>

                      {loan.cantidadPendienteQuintales > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setReturnTarget(loan);
                            setReturnQty(String(loan.cantidadPendienteQuintales));
                          }}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white text-xs font-semibold"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Registrar Devolución</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {loan.devoluciones.length > 0 && (
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-xs space-y-1">
                      <div className="font-semibold text-slate-600 dark:text-slate-300">
                        Historial de devoluciones:
                      </div>
                      {loan.devoluciones.map((ret) => (
                        <div
                          key={ret.id}
                          className="flex items-center justify-between text-slate-500 dark:text-slate-400"
                        >
                          <span>
                            {formatDateTime(ret.fecha)} · {ret.nota} ({ret.usuarioNombre})
                          </span>
                          <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                            +{ret.cantidadQuintales} qq
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {interDebts.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center space-y-2">
              <Building2 className="w-8 h-8 text-slate-400 mx-auto" />
              <div className="font-display font-semibold text-sm">
                Sin deudas o reembolsos pendientes entre negocios
              </div>
              <p className="text-xs text-slate-500">
                Cuando un negocio vende mercadería a otro negocio o paga al proveedor por cuenta de otro, la cuenta aparece aquí sin duplicar deudas externas.
              </p>
            </div>
          ) : (
            interDebts.map((debt) => {
              const weAreCreditor = debt.acreedorNegocioId === business.id;
              return (
                <div
                  key={debt.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="text-xs font-mono text-slate-500">
                        {debt.referenciaDocumento} · {debt.tipo.replace('_', ' ')} ·{' '}
                        {formatDateTime(debt.fecha)}
                      </div>
                      <h3 className="font-display font-bold text-base text-slate-900 dark:text-slate-100">
                        {weAreCreditor
                          ? `Nos debe: ${debt.deudorNombre}`
                          : `Debemos a: ${debt.acreedorNombre}`}
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-slate-300">{debt.concepto}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-5">
                      <div className="text-right font-mono tabular-nums text-xs">
                        <div className="text-slate-500">Total</div>
                        <div className="font-semibold">{formatBs(debt.montoTotal)}</div>
                      </div>
                      <div className="text-right font-mono tabular-nums text-xs">
                        <div className="text-slate-500">Pagado</div>
                        <div className="font-semibold text-emerald-600 dark:text-emerald-400">
                          {formatBs(debt.montoPagado)}
                        </div>
                      </div>
                      <div className="text-right font-mono tabular-nums text-xs">
                        <div className="text-slate-500">Saldo</div>
                        <div
                          className={`font-bold text-base ${
                            debt.saldoPendiente > 0
                              ? weAreCreditor
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-red-600 dark:text-red-400'
                              : 'text-slate-500'
                          }`}
                        >
                          {debt.saldoPendiente > 0 ? formatBs(debt.saldoPendiente) : 'Saldado'}
                        </div>
                      </div>

                      {debt.saldoPendiente > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setDebtTarget(debt);
                            setDebtPayAmount(String(debt.saldoPendiente));
                          }}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#15803D] hover:bg-[#166534] text-white text-xs font-semibold"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>{weAreCreditor ? 'Registrar Cobro' : 'Pagar / Reembolsar'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* New Loan Modal */}
      {showLoanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60">
          <form
            onSubmit={handleCreateLoan}
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4 text-xs"
          >
            <h3 className="font-display font-bold text-lg">Prestar Mercadería a Otro Negocio</h3>
            <p className="text-slate-500">
              Se descontará de su stock actual y se registrará como préstamo pendiente de devolución (no como venta).
            </p>
            <div>
              <label className="block font-medium mb-1">Negocio receptor</label>
              <select
                value={loanDestId}
                onChange={(e) => setLoanDestId(e.target.value as BusinessId)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                {otherBusinesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nombre} ({b.nombreCorto})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Producto en quintales cerrados</label>
              <select
                value={loanProdId}
                onChange={(e) => setLoanProdId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} ({p.marca}) · Disponible: {p.quintalesCerrados} qq
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Cantidad a prestar (quintales)</label>
              <input
                type="number"
                min="1"
                step="1"
                value={loanQty}
                onChange={(e) => setLoanQty(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Observación</label>
              <input
                type="text"
                value={loanNotes}
                onChange={(e) => setLoanNotes(e.target.value)}
                placeholder="Ej. Reposición temporal hasta llegada de camión"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowLoanModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-[#15803D] hover:bg-[#166534] text-white font-semibold"
              >
                Confirmar Préstamo
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Loan Return Modal */}
      {returnTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60">
          <form
            onSubmit={handleReturnLoan}
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4 text-xs"
          >
            <h3 className="font-display font-bold text-lg">
              Devolución de Préstamo · {returnTarget.codigo}
            </h3>
            <p className="text-slate-500">
              Producto: <strong>{returnTarget.productoNombre}</strong> · Pendiente por devolver:{' '}
              <strong className="font-mono">{returnTarget.cantidadPendienteQuintales} qq</strong>
            </p>
            <div>
              <label className="block font-medium mb-1">Cantidad devuelta (quintales)</label>
              <input
                type="number"
                min="1"
                max={returnTarget.cantidadPendienteQuintales}
                step="1"
                value={returnQty}
                onChange={(e) => setReturnQty(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Nota</label>
              <input
                type="text"
                value={returnNota}
                onChange={(e) => setReturnNota(e.target.value)}
                placeholder="Ej. Devolución parcial de 6 quintales"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReturnTarget(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-[#15803D] hover:bg-[#166534] text-white font-semibold"
              >
                Registrar Devolución
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Pay Inter-Business Debt Modal */}
      {debtTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60">
          <form
            onSubmit={handlePayInterDebt}
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4 text-xs"
          >
            <h3 className="font-display font-bold text-lg">
              Pago / Reembolso · {debtTarget.referenciaDocumento}
            </h3>
            <p className="text-slate-500">
              {debtTarget.deudorNombre} → {debtTarget.acreedorNombre} · Saldo:{' '}
              <strong className="font-mono">{formatBs(debtTarget.saldoPendiente)}</strong>
            </p>
            <div>
              <label className="block font-medium mb-1">Monto (Bs)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={debtTarget.saldoPendiente}
                value={debtPayAmount}
                onChange={(e) => setDebtPayAmount(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Método</label>
              <select
                value={debtPayMethod}
                onChange={(e) => setDebtPayMethod(e.target.value as PaymentMethod)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="TRANSFERENCIA_QR">Transferencia / QR</option>
                <option value="EFECTIVO">Efectivo</option>
                <option value="DEPOSITO">Depósito</option>
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Nota</label>
              <input
                type="text"
                value={debtPayNote}
                onChange={(e) => setDebtPayNote(e.target.value)}
                placeholder="Ej. Reembolso parcial en efectivo"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDebtTarget(null)}
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
    </div>
  );
}
