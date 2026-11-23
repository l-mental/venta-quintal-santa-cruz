import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest, type AuthDirectory, type WorkspaceData } from './lib/api.ts';
import { buildWorkspaceNotifications, type ToastMessage } from './lib/notifications.ts';
import type { BusinessId, UserAccount } from './types.ts';
import { Sidebar, type NavSection } from './components/Sidebar.tsx';
import { TopHeader } from './components/TopHeader.tsx';
import { ToastContainer } from './components/NotificationCenter.tsx';
import { AuthSwitchModal } from './components/AuthSwitchModal.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { InventoryView } from './components/InventoryView.tsx';
import { PurchasesView } from './components/PurchasesView.tsx';
import { SalesPosView } from './components/SalesPosView.tsx';
import { CustomersReceivablesView } from './components/CustomersReceivablesView.tsx';
import { InterBusinessView } from './components/InterBusinessView.tsx';
import { CashReportsView } from './components/CashReportsView.tsx';
import { TeamPermissionsView } from './components/TeamPermissionsView.tsx';
import { SettingsBackupView } from './components/SettingsBackupView.tsx';
import { ImportsArgentinaView } from './components/ImportsArgentinaView.tsx';

const SECTION_PERMS: Record<NavSection, string> = {
  dashboard: 'dashboard',
  ventas: 'ventas_crear',
  compras: 'compras_ver',
  inventario: 'inventario_ver',
  clientes: 'clientes_ver',
  internegocios: 'prestamos_gestionar',
  caja: 'caja_reportes',
  usuarios: 'usuarios_gestionar',
  importaciones: 'importaciones_ver',
  configuracion: 'configuracion_respaldos',
};

export default function App() {
  const [directory, setDirectory] = useState<AuthDirectory | null>(null);
  const [session, setSession] = useState<{ userId: string; businessId: BusinessId }>(() => {
    try {
      const saved = localStorage.getItem('abarrotes_session');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore storage errors
    }
    return { userId: 'u_mama_admin', businessId: 'neg_mama' as BusinessId };
  });

  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    try {
      return localStorage.getItem('abarrotes_dark') === 'true';
    } catch {
      return false;
    }
  });
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<string[]>([]);

  const pushToast = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-3), { ...toast, id }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const notifications = useMemo(
    () => (workspace ? buildWorkspaceNotifications(workspace) : []),
    [workspace]
  );

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    try {
      localStorage.setItem('abarrotes_dark', String(darkMode));
    } catch {
      // ignore
    }
  }, [darkMode]);

  const loadWorkspace = useCallback(
    async (userId: string, businessId: BusinessId) => {
      setError('');
      try {
        const [dir, ws] = await Promise.all([
          apiRequest<AuthDirectory>('/api/auth/directory'),
          apiRequest<WorkspaceData>('/api/workspace', { userId, businessId }),
        ]);
        setDirectory(dir);
        setWorkspace(ws);
      } catch (err) {
        // Fallback to default admin if saved user no longer exists
        if (userId !== 'u_mama_admin') {
          const fallback = { userId: 'u_mama_admin', businessId: 'neg_mama' as BusinessId };
          setSession(fallback);
          localStorage.setItem('abarrotes_session', JSON.stringify(fallback));
        } else {
          setError(err instanceof Error ? err.message : 'Error cargando sistema');
        }
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    loadWorkspace(session.userId, session.businessId);
  }, [session.userId, session.businessId, loadWorkspace]);

  const handleRefresh = useCallback(async () => {
    await loadWorkspace(session.userId, session.businessId);
  }, [loadWorkspace, session.userId, session.businessId]);

  const handleSwitchUser = async (userId: string, pin: string) => {
    const res = await apiRequest<{ user: UserAccount }>('/api/auth/login', {
      method: 'POST',
      body: { userId, pin },
    });
    const nextSession = { userId: res.user.id, businessId: res.user.negocioId };
    setSession(nextSession);
    setDismissedNotificationIds([]);
    localStorage.setItem('abarrotes_session', JSON.stringify(nextSession));

    const required = SECTION_PERMS[activeSection];
    if (!res.user.permisos.includes(required as never)) {
      setActiveSection('dashboard');
    }
    pushToast({
      type: 'info',
      title: `Sesión iniciada: ${res.user.nombre}`,
      detail: `${res.user.cargo} · Espacio independiente`,
    });
  };

  if (loading && !workspace) {
    return (
      <div className="min-h-screen bg-[#F6F7F9] dark:bg-slate-950 flex items-center justify-center p-6">
        <div className="text-sm text-slate-500 dark:text-slate-400 font-medium">
          Cargando espacio independiente del negocio...
        </div>
      </div>
    );
  }

  if (error || !workspace) {
    return (
      <div className="min-h-screen bg-[#F6F7F9] dark:bg-slate-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3 text-center">
          <h2 className="font-display font-bold text-lg text-slate-900 dark:text-slate-100">
            No se pudo cargar el sistema
          </h2>
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          <button
            type="button"
            onClick={handleRefresh}
            className="px-4 py-2 rounded-lg bg-[#15803D] hover:bg-[#166534] text-white text-xs font-semibold"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-[#F6F7F9] dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <Sidebar
        business={workspace.business}
        user={workspace.currentUser}
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        onOpenSwitcher={() => setShowSwitcher(true)}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <TopHeader
          business={workspace.business}
          user={workspace.currentUser}
          darkMode={darkMode}
          notifications={notifications}
          dismissedNotificationIds={dismissedNotificationIds}
          onDismissNotification={(id) =>
            setDismissedNotificationIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
          }
          onDismissAllNotifications={() =>
            setDismissedNotificationIds(notifications.map((n) => n.id))
          }
          onNavigate={setActiveSection}
          onToggleDarkMode={() => setDarkMode((d) => !d)}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onNewSale={() => setActiveSection('ventas')}
          onOpenSwitcher={() => setShowSwitcher(true)}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1400px] w-full mx-auto">
          {activeSection === 'dashboard' && (
            <DashboardView data={workspace} onNavigate={setActiveSection} />
          )}
          {activeSection === 'inventario' && (
            <InventoryView data={workspace} onRefresh={handleRefresh} onToast={pushToast} />
          )}
          {activeSection === 'compras' && (
            <PurchasesView data={workspace} onRefresh={handleRefresh} onToast={pushToast} />
          )}
          {activeSection === 'ventas' && (
            <SalesPosView data={workspace} onRefresh={handleRefresh} onToast={pushToast} />
          )}
          {activeSection === 'clientes' && (
            <CustomersReceivablesView
              data={workspace}
              onRefresh={handleRefresh}
              onToast={pushToast}
            />
          )}
          {activeSection === 'internegocios' && (
            <InterBusinessView data={workspace} onRefresh={handleRefresh} onToast={pushToast} />
          )}
          {activeSection === 'caja' && (
            <CashReportsView data={workspace} onRefresh={handleRefresh} onToast={pushToast} />
          )}
          {activeSection === 'usuarios' && (
            <TeamPermissionsView data={workspace} onRefresh={handleRefresh} onToast={pushToast} />
          )}
          {activeSection === 'importaciones' && (
            <ImportsArgentinaView data={workspace} onRefresh={handleRefresh} onToast={pushToast} />
          )}
          {activeSection === 'configuracion' && (
            <SettingsBackupView data={workspace} onRefresh={handleRefresh} onToast={pushToast} />
          )}
        </main>
      </div>

      {showSwitcher && directory && (
        <AuthSwitchModal
          directory={directory}
          currentUserId={workspace.currentUser.id}
          onSelectUser={handleSwitchUser}
          onClose={() => setShowSwitcher(false)}
        />
      )}

      <ToastContainer
        toasts={toasts}
        onRemove={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />
    </div>
  );
}
