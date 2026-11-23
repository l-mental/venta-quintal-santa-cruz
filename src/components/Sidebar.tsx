import React from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  Truck,
  Package,
  Users,
  ArrowLeftRight,
  Wallet,
  ShieldCheck,
  Settings,
  Ship,
  LogOut,
  X,
  Building2,
} from 'lucide-react';
import type { Business, PermissionKey, UserAccount } from '../types.ts';

export type NavSection =
  | 'dashboard'
  | 'ventas'
  | 'compras'
  | 'inventario'
  | 'clientes'
  | 'internegocios'
  | 'caja'
  | 'usuarios'
  | 'importaciones'
  | 'configuracion';

interface NavItem {
  id: NavSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  requiredPerm: PermissionKey;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Tablero Principal', icon: LayoutDashboard, requiredPerm: 'dashboard' },
  { id: 'ventas', label: 'Ventas / POS', icon: ShoppingCart, requiredPerm: 'ventas_crear' },
  { id: 'compras', label: 'Compras y Proveedores', icon: Truck, requiredPerm: 'compras_ver' },
  { id: 'inventario', label: 'Almacén y Kardex', icon: Package, requiredPerm: 'inventario_ver' },
  { id: 'clientes', label: 'Cuentas Cobrar / Pagar', icon: Users, requiredPerm: 'clientes_ver' },
  { id: 'internegocios', label: 'Préstamos y Entre Negocios', icon: ArrowLeftRight, requiredPerm: 'prestamos_gestionar' },
  { id: 'caja', label: 'Caja y Reportes', icon: Wallet, requiredPerm: 'caja_reportes' },
  { id: 'usuarios', label: 'Equipo y Permisos', icon: ShieldCheck, requiredPerm: 'usuarios_gestionar' },
  { id: 'importaciones', label: 'Importaciones (Arg)', icon: Ship, requiredPerm: 'importaciones_ver' },
  { id: 'configuracion', label: 'Respaldos y Ajustes', icon: Settings, requiredPerm: 'configuracion_respaldos' },
];

interface SidebarProps {
  business: Business;
  user: UserAccount;
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  onOpenSwitcher: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({
  business,
  user,
  activeSection,
  onSelectSection,
  onOpenSwitcher,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const visibleItems = NAV_ITEMS.filter((item) => user.permisos.includes(item.requiredPerm));

  const content = (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 w-[264px] shrink-0">
      {/* Brand Header */}
      <div className="px-5 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-[#15803D] text-white flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="font-display font-bold text-sm tracking-tight text-slate-900 dark:text-slate-100 truncate">
              {business.nombre}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {business.nombreCorto} · {business.configuracion.moneda}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden p-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          aria-label="Cerrar menú"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectSection(item.id);
                onCloseMobile();
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                isActive
                  ? 'bg-emerald-50 text-[#15803D] dark:bg-emerald-950/50 dark:text-emerald-300'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-slate-100'
              }`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 ${
                  isActive ? 'text-[#15803D] dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'
                }`}
              />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Active User Footer */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
        <div className="px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-display font-bold text-xs flex items-center justify-center shrink-0">
              {user.nombre
                .split(' ')
                .slice(0, 2)
                .map((p) => p[0])
                .join('')}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                {user.nombre}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {user.cargo}
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenSwitcher}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors whitespace-nowrap"
        >
          <LogOut className="w-3.5 h-3.5 text-[#15803D] dark:text-emerald-400" />
          <span>Cambiar Negocio / Usuario</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block h-screen sticky top-0 no-print">{content}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div
            className="fixed inset-0 bg-slate-950/50"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{content}</div>
        </div>
      )}
    </>
  );
}
