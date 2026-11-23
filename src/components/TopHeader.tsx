import React from 'react';
import { Menu, Moon, Sun, ShoppingCart, ArrowLeftRight } from 'lucide-react';
import type { Business, UserAccount } from '../types.ts';
import type { AppNotification } from '../lib/notifications.ts';
import { NotificationBell } from './NotificationCenter.tsx';
import type { NavSection } from './Sidebar.tsx';

interface TopHeaderProps {
  business: Business;
  user: UserAccount;
  darkMode: boolean;
  notifications: AppNotification[];
  dismissedNotificationIds: string[];
  onDismissNotification: (id: string) => void;
  onDismissAllNotifications: () => void;
  onNavigate: (section: NavSection) => void;
  onToggleDarkMode: () => void;
  onOpenMobileMenu: () => void;
  onNewSale: () => void;
  onOpenSwitcher: () => void;
}

export function TopHeader({
  business,
  user,
  darkMode,
  notifications,
  dismissedNotificationIds,
  onDismissNotification,
  onDismissAllNotifications,
  onNavigate,
  onToggleDarkMode,
  onOpenMobileMenu,
  onNewSale,
  onOpenSwitcher,
}: TopHeaderProps) {
  const canSell = user.permisos.includes('ventas_crear');

  return (
    <header className="sticky top-0 z-30 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 h-16 flex items-center justify-between gap-4 no-print">
      {/* Zone 1: Menu trigger + Business identity */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Abrir menú"
        >
          <Menu className="w-5 h-5" />
        </button>
        <span className="font-display font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100 truncate">
          {business.nombre}
        </span>
        <span className="hidden md:inline text-xs text-slate-400 dark:text-slate-500">·</span>
        <span className="hidden md:inline text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
          {business.ciudad}
        </span>
      </div>

      {/* Zone 2: Utility actions (Notifications + Switch account + Nocturno) */}
      <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
        <NotificationBell
          notifications={notifications}
          dismissedIds={dismissedNotificationIds}
          onDismiss={onDismissNotification}
          onDismissAll={onDismissAllNotifications}
          onNavigate={onNavigate}
        />

        <button
          type="button"
          onClick={onOpenSwitcher}
          className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
        >
          <ArrowLeftRight className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
          <span>{business.nombreCorto}</span>
        </button>

        <button
          type="button"
          onClick={onToggleDarkMode}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          aria-label={darkMode ? 'Cambiar a modo diurno' : 'Cambiar a modo nocturno'}
        >
          {darkMode ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-slate-600" />}
          <span className="hidden md:inline">{darkMode ? 'Diurno' : 'Nocturno'}</span>
        </button>

        {/* Zone 3: Single Primary Action */}
        {canSell && (
          <button
            type="button"
            onClick={onNewSale}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-[#15803D] hover:bg-[#166534] text-white transition-colors whitespace-nowrap shrink-0"
          >
            <ShoppingCart className="w-4 h-4" />
            <span>Nueva Venta</span>
          </button>
        )}
      </div>
    </header>
  );
}
