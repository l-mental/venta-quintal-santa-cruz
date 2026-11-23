import React, { useState } from 'react';
import { X, Lock, ShieldCheck, Building2 } from 'lucide-react';
import type { AuthDirectory, DirectoryUser } from '../lib/api.ts';
import type { BusinessId } from '../types.ts';

interface AuthSwitchModalProps {
  directory: AuthDirectory;
  currentUserId: string;
  onSelectUser: (userId: string, pin: string) => Promise<void>;
  onClose: () => void;
}

export function AuthSwitchModal({
  directory,
  currentUserId,
  onSelectUser,
  onClose,
}: AuthSwitchModalProps) {
  const [selectedUser, setSelectedUser] = useState<DirectoryUser | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (targetUser: DirectoryUser, pinValue: string) => {
    setError('');
    setLoading(true);
    try {
      await onSelectUser(targetUser.id, pinValue);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al validar PIN');
    } finally {
      setLoading(false);
    }
  };

  const bizList = directory.businesses;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60">
      <div className="w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="font-display font-bold text-lg text-slate-900 dark:text-slate-100">
              Cambiar de Negocio o Usuario
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Cada cuenta trabaja aislada sobre su propio inventario, compras, ventas y finanzas.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {selectedUser ? (
            <div className="max-w-sm mx-auto space-y-4 py-4">
              <div className="text-center space-y-1">
                <div className="w-11 h-11 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-[#15803D] dark:text-emerald-400 flex items-center justify-center mx-auto">
                  <Lock className="w-5 h-5" />
                </div>
                <h3 className="font-display font-semibold text-base text-slate-900 dark:text-slate-100">
                  Ingresar como {selectedUser.nombre}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {selectedUser.cargo} · PIN de prueba: <span className="font-mono font-semibold">{selectedUser.pinHint}</span>
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  PIN de acceso
                </label>
                <input
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleLogin(selectedUser, pin);
                  }}
                  placeholder="Ingrese PIN (ej. 1234)"
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#15803D]"
                  autoFocus
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedUser(null);
                    setPin('');
                    setError('');
                  }}
                  className="flex-1 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Volver
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleLogin(selectedUser, pin)}
                  className="flex-1 px-4 py-2 rounded-lg bg-[#15803D] hover:bg-[#166534] text-white text-xs font-semibold disabled:opacity-50"
                >
                  {loading ? 'Validando...' : 'Ingresar'}
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {bizList.map((biz) => {
                const bizUsers = directory.users.filter(
                  (u) => u.negocioId === (biz.id as BusinessId)
                );
                return (
                  <div
                    key={biz.id}
                    className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col justify-between bg-slate-50/50 dark:bg-slate-800/30"
                  >
                    <div>
                      <div className="flex items-center gap-2.5 mb-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-slate-700 text-white flex items-center justify-center shrink-0">
                          <Building2 className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-display font-bold text-sm text-slate-900 dark:text-slate-100 truncate">
                            {biz.nombre}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {biz.nombreCorto} · {biz.configuracion.permitirVentaPorKilo ? 'Quintal + Kilo' : 'Solo Quintal'}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {bizUsers.map((u) => {
                          const isCurrent = u.id === currentUserId;
                          return (
                            <div
                              key={u.id}
                              className={`p-2.5 rounded-lg border transition-colors ${
                                isCurrent
                                  ? 'border-[#15803D] bg-emerald-50/60 dark:bg-emerald-950/30'
                                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                                    {u.nombre}
                                  </div>
                                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                    {u.cargo}
                                  </div>
                                  <div className="text-[11px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">
                                    PIN: {u.pinHint}
                                  </div>
                                </div>
                                {isCurrent ? (
                                  <span className="text-[11px] font-semibold text-[#15803D] dark:text-emerald-400 shrink-0">
                                    Activo
                                  </span>
                                ) : (
                                  <ShieldCheck className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                                )}
                              </div>

                              {!isCurrent && (
                                <div className="mt-2 flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleLogin(u, u.pinHint)}
                                    className="flex-1 px-2.5 py-1.5 rounded-md bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 text-white text-[11px] font-medium transition-colors"
                                  >
                                    Acceso rápido
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedUser(u);
                                      setPin('');
                                    }}
                                    className="px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                                  >
                                    PIN
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
