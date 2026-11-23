import type { WorkspaceData } from './api.ts';
import { formatBs, formatDate } from './format.ts';
import type { NavSection } from '../components/Sidebar.tsx';

export type AlertCategory = 'STOCK' | 'COBRANZA' | 'PAGOS' | 'INTERNEGOCIOS' | 'SISTEMA';
export type AlertSeverity = 'ALTA' | 'MEDIA' | 'INFO';

export interface AppNotification {
  id: string;
  category: AlertCategory;
  severity: AlertSeverity;
  title: string;
  description: string;
  timestamp: string;
  actionLabel: string;
  targetSection: NavSection;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error';
  title: string;
  detail?: string;
}

export function buildWorkspaceNotifications(data: WorkspaceData): AppNotification[] {
  const alerts: AppNotification[] = [];
  const { business, currentUser, products, sales, purchases, loans, interDebts, backups } = data;
  const perms = currentUser.permisos;

  // 1. Stock bajo o agotado
  if (perms.includes('inventario_ver')) {
    for (const p of products) {
      if (!p.activo) continue;
      if (p.quintalesCerrados === 0) {
        alerts.push({
          id: `stock_out_${p.id}`,
          category: 'STOCK',
          severity: 'ALTA',
          title: `Sin stock cerrado: ${p.nombre} (${p.marca})`,
          description: `0 qq cerrados en depósito (${p.kilosSueltos} kg sueltos). Mínimo recomendado: ${p.stockMinimoQuintales} qq.`,
          timestamp: new Date().toISOString(),
          actionLabel: perms.includes('compras_crear') ? 'Registrar compra' : 'Ver almacén',
          targetSection: perms.includes('compras_crear') ? 'compras' : 'inventario',
        });
      } else if (p.quintalesCerrados <= p.stockMinimoQuintales) {
        alerts.push({
          id: `stock_low_${p.id}`,
          category: 'STOCK',
          severity: 'MEDIA',
          title: `Stock bajo: ${p.nombre} (${p.marca})`,
          description: `Quedan ${p.quintalesCerrados} qq cerrados (mínimo configurado: ${p.stockMinimoQuintales} qq).`,
          timestamp: new Date().toISOString(),
          actionLabel: 'Ir a almacén',
          targetSection: 'inventario',
        });
      }
    }
  }

  // 2. Cobranzas pendientes de clientes
  if (perms.includes('clientes_ver')) {
    const nowMs = Date.now();
    const pendingSales = sales.filter(
      (s) => s.estado !== 'ANULADO' && s.saldoPendiente > 0.01 && !s.destinoNegocioId
    );
    for (const s of pendingSales) {
      const ageDays = Math.floor((nowMs - new Date(s.fecha).getTime()) / (1000 * 60 * 60 * 24));
      alerts.push({
        id: `cxc_${s.id}`,
        category: 'COBRANZA',
        severity: ageDays >= 3 ? 'ALTA' : 'MEDIA',
        title: `Cobro pendiente ${s.numero} · ${s.clienteNombre}`,
        description: `Saldo: ${formatBs(s.saldoPendiente)} de ${formatBs(s.total)} · Emitido el ${formatDate(s.fecha)}${
          ageDays > 0 ? ` (hace ${ageDays} días)` : ' (hoy)'
        }.`,
        timestamp: s.fecha,
        actionLabel: 'Cobrar / Ver cuenta',
        targetSection: 'clientes',
      });
    }
  }

  // 3. Cuentas por pagar a proveedores
  if (perms.includes('compras_ver')) {
    const pendingPurchases = purchases.filter(
      (p) => p.estado !== 'ANULADO' && p.saldoPendiente > 0.01
    );
    for (const p of pendingPurchases) {
      alerts.push({
        id: `cxp_${p.id}`,
        category: 'PAGOS',
        severity: 'MEDIA',
        title: `Saldo a proveedor ${p.numero} · ${p.proveedorNombre}`,
        description: `Pendiente por pagar: ${formatBs(p.saldoPendiente)} (Total compra: ${formatBs(p.total)}).`,
        timestamp: p.fecha,
        actionLabel: 'Registrar abono',
        targetSection: 'compras',
      });
    }
  }

  // 4. Préstamos y deudas entre negocios
  if (perms.includes('prestamos_gestionar')) {
    for (const l of loans) {
      if (l.estado === 'DEVUELTO' || l.estado === 'ANULADO') continue;
      const isLender = l.negocioOrigenId === business.id;
      alerts.push({
        id: `loan_${l.id}`,
        category: 'INTERNEGOCIOS',
        severity: 'MEDIA',
        title: `Préstamo ${l.codigo}: ${l.cantidadPendienteQuintales} qq pendientes`,
        description: isLender
          ? `${l.negocioDestinoNombre} debe devolver ${l.cantidadPendienteQuintales} qq de ${l.productoNombre} (${l.marca}).`
          : `Debemos devolver ${l.cantidadPendienteQuintales} qq de ${l.productoNombre} (${l.marca}) a ${l.negocioOrigenNombre}.`,
        timestamp: l.fecha,
        actionLabel: 'Gestionar devolución',
        targetSection: 'internegocios',
      });
    }

    for (const d of interDebts) {
      if (d.estado === 'PAGADO' || d.estado === 'ANULADO' || d.saldoPendiente <= 0.01) continue;
      const weAreCreditor = d.acreedorNegocioId === business.id;
      alerts.push({
        id: `int_${d.id}`,
        category: 'INTERNEGOCIOS',
        severity: 'MEDIA',
        title: weAreCreditor
          ? `Por cobrar a ${d.deudorNombre}`
          : `Por reembolsar a ${d.acreedorNombre}`,
        description: `${d.referenciaDocumento} · Saldo pendiente: ${formatBs(d.saldoPendiente)}.`,
        timestamp: d.fecha,
        actionLabel: 'Ver cuenta interna',
        targetSection: 'internegocios',
      });
    }
  }

  // 5. Estado de copias de seguridad
  if (perms.includes('configuracion_respaldos') && backups.length > 0) {
    const latest = backups[0];
    alerts.push({
      id: `bkp_${latest.id}`,
      category: 'SISTEMA',
      severity: 'INFO',
      title: `Último respaldo ${latest.tipo.toLowerCase()} verificado`,
      description: `${latest.resumen} (${formatDate(latest.fecha)}).`,
      timestamp: latest.fecha,
      actionLabel: 'Ver respaldos',
      targetSection: 'configuracion',
    });
  }

  const severityOrder: Record<AlertSeverity, number> = { ALTA: 0, MEDIA: 1, INFO: 2 };
  return alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}
