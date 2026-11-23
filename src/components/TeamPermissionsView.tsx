import React, { useState } from 'react';
import { Plus, ShieldCheck } from 'lucide-react';
import { apiRequest, type WorkspaceData } from '../lib/api.ts';
import type { PermissionKey, UserAccount, UserRole } from '../types.ts';
import type { ToastMessage } from '../lib/notifications.ts';

interface TeamPermissionsViewProps {
  data: WorkspaceData;
  onRefresh: () => Promise<void>;
  onToast?: (toast: Omit<ToastMessage, 'id'>) => void;
}

const ALL_PERMISSIONS: Array<{ key: PermissionKey; label: string }> = [
  { key: 'dashboard', label: 'Tablero Principal' },
  { key: 'inventario_ver', label: 'Consultar Inventario / Abrir Quintal' },
  { key: 'inventario_editar', label: 'Editar Productos / Ajustes' },
  { key: 'ventas_crear', label: 'Registrar Ventas / Pedidos' },
  { key: 'ventas_anular', label: 'Anular Pedidos' },
  { key: 'compras_ver', label: 'Ver Compras y Costos' },
  { key: 'compras_crear', label: 'Registrar / Anular Compras' },
  { key: 'clientes_ver', label: 'Ver Clientes y Deudas' },
  { key: 'clientes_cobrar', label: 'Cobrar / Registrar Anticipos' },
  { key: 'proveedores_pagar', label: 'Pagar Abonos a Proveedores' },
  { key: 'prestamos_gestionar', label: 'Préstamos Entre Negocios' },
  { key: 'caja_reportes', label: 'Caja, Ganancias y Reportes' },
  { key: 'usuarios_gestionar', label: 'Administrar Usuarios y Permisos' },
  { key: 'configuracion_respaldos', label: 'Configuración y Respaldos' },
  { key: 'importaciones_ver', label: 'Módulo Importaciones (Arg)' },
];

export function TeamPermissionsView({ data, onRefresh, onToast }: TeamPermissionsViewProps) {
  const { business, currentUser, users } = data;
  const [showNew, setShowNew] = useState(false);
  const [nombre, setNombre] = useState('');
  const [cargo, setCargo] = useState('Vendedor de Mostrador');
  const [pin, setPin] = useState('');
  const [rol, setRol] = useState<UserRole>('VENDEDOR_CAJERO');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const togglePermission = async (targetUser: UserAccount, perm: PermissionKey) => {
    setError('');
    setSuccess('');
    const has = targetUser.permisos.includes(perm);
    const nextPerms = has
      ? targetUser.permisos.filter((p) => p !== perm)
      : [...targetUser.permisos, perm];
    try {
      await apiRequest(`/api/users/${targetUser.id}`, {
        method: 'PATCH',
        body: { permisos: nextPerms },
        userId: currentUser.id,
        businessId: business.id,
      });
      setSuccess(`Permisos actualizados para ${targetUser.nombre}.`);
      onToast?.({
        type: 'info',
        title: 'Permisos actualizados',
        detail: `${targetUser.nombre} · Acceso actualizado.`,
      });
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar permisos');
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const defaultPerms: PermissionKey[] =
      rol === 'ADMINISTRADOR'
        ? ALL_PERMISSIONS.map((p) => p.key)
        : rol === 'ENCARGADO_ALMACEN'
        ? [
            'dashboard',
            'inventario_ver',
            'inventario_editar',
            'compras_ver',
            'compras_crear',
            'prestamos_gestionar',
          ]
        : ['dashboard', 'inventario_ver', 'ventas_crear', 'clientes_ver', 'clientes_cobrar'];

    try {
      await apiRequest('/api/users', {
        method: 'POST',
        body: { nombre, cargo, pin, rol, permisos: defaultPerms },
        userId: currentUser.id,
        businessId: business.id,
      });
      setShowNew(false);
      setNombre('');
      setPin('');
      setSuccess(`Usuario ${nombre} creado exclusivamente para ${business.nombre}.`);
      onToast?.({
        type: 'success',
        title: 'Nuevo usuario creado',
        detail: `${nombre} · ${cargo} (${business.nombreCorto})`,
      });
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear usuario');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-2xl text-slate-900 dark:text-slate-100">
            Equipo y Permisos · {business.nombre}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Los empleados de este negocio solo acceden a sus módulos autorizados y nunca ven los otros dos negocios.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#15803D] hover:bg-[#166534] text-white text-xs font-semibold self-start"
        >
          <Plus className="w-4 h-4" />
          <span>Nuevo Usuario</span>
        </button>
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

      <div className="space-y-4">
        {users.map((u) => (
          <div
            key={u.id}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4 text-[#15803D] dark:text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-sm text-slate-900 dark:text-slate-100">
                    {u.nombre}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {u.cargo} · Rol: {u.rol} · PIN: <span className="font-mono">{u.pin}</span> · Acceso aislado a {business.nombreCorto}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
              {ALL_PERMISSIONS.map((perm) => {
                const checked = u.permisos.includes(perm.key);
                return (
                  <label
                    key={perm.key}
                    className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                      checked
                        ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20'
                        : 'border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={u.id === currentUser.id && perm.key === 'usuarios_gestionar'}
                      onChange={() => togglePermission(u, perm.key)}
                    />
                    <span className="text-slate-700 dark:text-slate-300">{perm.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60">
          <form
            onSubmit={handleCreateUser}
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4 text-xs"
          >
            <h3 className="font-display font-bold text-lg">
              Agregar Usuario a {business.nombre}
            </h3>
            <div>
              <label className="block font-medium mb-1">Nombre completo</label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Cargo</label>
              <input
                type="text"
                value={cargo}
                onChange={(e) => setCargo(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium mb-1">Rol Base</label>
                <select
                  value={rol}
                  onChange={(e) => setRol(e.target.value as UserRole)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                >
                  <option value="VENDEDOR_CAJERO">Vendedor / Cajero</option>
                  <option value="ENCARGADO_ALMACEN">Encargado de Almacén</option>
                  <option value="ADMINISTRADOR">Administrador</option>
                </select>
              </div>
              <div>
                <label className="block font-medium mb-1">PIN de acceso</label>
                <input
                  type="text"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  required
                  placeholder="Ej. 4455"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
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
                Crear Usuario
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
