import type {
  AuditLog,
  BackupSnapshot,
  Business,
  BusinessConfig,
  BusinessId,
  CashMovement,
  Customer,
  ImportSimulation,
  InterBusinessDebt,
  InterBusinessLoan,
  InventoryMovement,
  Product,
  Purchase,
  SaleOrder,
  Supplier,
  UserAccount,
} from '../types.ts';

export interface SiblingBusinessSummary {
  id: BusinessId;
  nombre: string;
  nombreCorto: string;
  titular: string;
  ciudad: string;
  configuracion: BusinessConfig;
}

export interface DirectoryUser {
  id: string;
  negocioId: BusinessId;
  nombre: string;
  cargo: string;
  rol: string;
  pinHint: string;
}

export interface AuthDirectory {
  businesses: Business[];
  users: DirectoryUser[];
}

export interface WorkspaceData {
  business: Business;
  siblingBusinesses: SiblingBusinessSummary[];
  currentUser: UserAccount;
  users: UserAccount[];
  products: Product[];
  movements: InventoryMovement[];
  suppliers: Supplier[];
  purchases: Purchase[];
  customers: Customer[];
  sales: SaleOrder[];
  loans: InterBusinessLoan[];
  interDebts: InterBusinessDebt[];
  cashMovements: CashMovement[];
  auditLogs: AuditLog[];
  backups: BackupSnapshot[];
  importSimulations: ImportSimulation[];
}

export async function apiRequest<T>(
  url: string,
  options: {
    method?: string;
    body?: unknown;
    userId?: string;
    businessId?: BusinessId;
  } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.userId) headers['x-user-id'] = options.userId;
  if (options.businessId) headers['x-business-id'] = options.businessId;

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Error en la solicitud (${res.status})`);
  }
  return data as T;
}
