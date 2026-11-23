export type BusinessId = 'neg_mama' | 'neg_hermano' | 'neg_propio';

export type PermissionKey =
  | 'dashboard'
  | 'inventario_ver'
  | 'inventario_editar'
  | 'ventas_crear'
  | 'ventas_anular'
  | 'compras_ver'
  | 'compras_crear'
  | 'clientes_ver'
  | 'clientes_cobrar'
  | 'proveedores_pagar'
  | 'prestamos_gestionar'
  | 'caja_reportes'
  | 'usuarios_gestionar'
  | 'configuracion_respaldos'
  | 'importaciones_ver';

export type UserRole = 'ADMINISTRADOR' | 'ENCARGADO_ALMACEN' | 'VENDEDOR_CAJERO';

export type PaymentMethod =
  | 'EFECTIVO'
  | 'TRANSFERENCIA_QR'
  | 'DEPOSITO'
  | 'CHEQUE'
  | 'REEMBOLSO_INTERNO';

export type PaymentCondition = 'CONTADO' | 'CREDITO' | 'PARCIAL';

export interface BusinessConfig {
  permitirVentaPorKilo: boolean;
  autoAbrirQuintalEnVenta: boolean;
  moneda: string;
}

export interface Business {
  id: BusinessId;
  nombre: string;
  nombreCorto: string;
  titular: string;
  ciudad: string;
  telefono: string;
  nit: string;
  configuracion: BusinessConfig;
}

export interface UserAccount {
  id: string;
  negocioId: BusinessId;
  nombre: string;
  cargo: string;
  email: string;
  pin: string;
  rol: UserRole;
  activo: boolean;
  permisos: PermissionKey[];
  accesoSoloSuNegocio: boolean;
}

export interface Product {
  id: string;
  negocioId: BusinessId;
  sku: string;
  nombre: string;
  marca: string;
  categoria: string;
  presentacionKg: number;
  unidadLabel: string;
  quintalesCerrados: number;
  kilosSueltos: number;
  permiteFraccionado: boolean;
  precioQuintal: number;
  precioKilo: number;
  costoPromedioQuintal: number;
  stockMinimoQuintales: number;
  activo: boolean;
}

export type MovementType =
  | 'COMPRA'
  | 'VENTA_QUINTAL'
  | 'VENTA_KILO'
  | 'APERTURA_QUINTAL'
  | 'AJUSTE_POSITIVO'
  | 'AJUSTE_NEGATIVO'
  | 'DEVOLUCION_CLIENTE'
  | 'DEVOLUCION_PROVEEDOR'
  | 'PRESTAMO_OTORGADO'
  | 'PRESTAMO_RECIBIDO'
  | 'DEVOLUCION_PRESTAMO_ENVIADA'
  | 'DEVOLUCION_PRESTAMO_RECIBIDA'
  | 'COMPRA_INTERNA'
  | 'VENTA_INTERNA'
  | 'ANULACION';

export interface InventoryMovement {
  id: string;
  negocioId: BusinessId;
  fecha: string;
  productoId: string;
  productoNombre: string;
  marca: string;
  presentacionKg: number;
  tipo: MovementType;
  deltaQuintales: number;
  deltaKilos: number;
  saldoQuintales: number;
  saldoKilos: number;
  referencia: string;
  motivo: string;
  usuarioNombre: string;
  anulado?: boolean;
}

export interface Supplier {
  id: string;
  negocioId: BusinessId;
  nombre: string;
  telefono: string;
  ciudad: string;
  nit: string;
  tipo: 'EXTERNO' | 'INTER_NEGOCIO';
  negocioVinculadoId?: BusinessId;
}

export interface PaymentRecord {
  id: string;
  fecha: string;
  monto: number;
  metodoPago: PaymentMethod;
  nota: string;
  usuarioNombre: string;
  anulado?: boolean;
}

export interface PurchaseItem {
  productoId: string;
  productoNombre: string;
  marca: string;
  presentacionKg: number;
  cantidadQuintales: number;
  precioQuintal: number;
  subtotal: number;
}

export interface Purchase {
  id: string;
  numero: string;
  negocioId: BusinessId;
  fecha: string;
  proveedorId: string;
  proveedorNombre: string;
  intermediarioNombre?: string;
  items: PurchaseItem[];
  total: number;
  tipoPago: PaymentCondition;
  pagadoPorOtroNegocioId?: BusinessId;
  pagadoPorOtroNegocioNombre?: string;
  montoPagado: number;
  saldoPendiente: number;
  abonos: PaymentRecord[];
  estado: 'PAGADO' | 'PARCIAL' | 'PENDIENTE' | 'ANULADO';
  motivoAnulacion?: string;
  usuarioNombre: string;
}

export interface Customer {
  id: string;
  negocioId: BusinessId;
  nombre: string;
  telefono: string;
  direccion: string;
  ciNit: string;
  saldoAnticipo: number;
  esNegocioHermanoId?: BusinessId;
}

export interface SaleItem {
  productoId: string;
  productoNombre: string;
  marca: string;
  presentacionKg: number;
  modalidad: 'QUINTAL' | 'KILO';
  cantidad: number;
  precioUnitario: number;
  costoUnitarioEstimado: number;
  subtotal: number;
}

export interface SaleOrder {
  id: string;
  numero: string;
  negocioId: BusinessId;
  fecha: string;
  clienteId: string;
  clienteNombre: string;
  destinoNegocioId?: BusinessId;
  items: SaleItem[];
  total: number;
  costoTotalEstimado: number;
  tipoPago: PaymentCondition;
  montoPagado: number;
  saldoPendiente: number;
  pagos: PaymentRecord[];
  estado: 'PAGADO' | 'PARCIAL' | 'PENDIENTE' | 'ANULADO';
  motivoAnulacion?: string;
  usuarioNombre: string;
}

export interface LoanReturnEntry {
  id: string;
  fecha: string;
  cantidadQuintales: number;
  nota: string;
  usuarioNombre: string;
}

export interface InterBusinessLoan {
  id: string;
  codigo: string;
  fecha: string;
  negocioOrigenId: BusinessId;
  negocioOrigenNombre: string;
  negocioDestinoId: BusinessId;
  negocioDestinoNombre: string;
  productoOrigenId: string;
  productoNombre: string;
  marca: string;
  presentacionKg: number;
  cantidadPrestadaQuintales: number;
  cantidadDevueltaQuintales: number;
  cantidadPendienteQuintales: number;
  estado: 'PENDIENTE' | 'DEVOLUCION_PARCIAL' | 'DEVUELTO' | 'ANULADO';
  notas: string;
  devoluciones: LoanReturnEntry[];
  usuarioNombre: string;
}

export interface InterBusinessDebt {
  id: string;
  fecha: string;
  tipo: 'VENTA_INTERNA' | 'REEMBOLSO_COMPRA';
  acreedorNegocioId: BusinessId;
  acreedorNombre: string;
  deudorNegocioId: BusinessId;
  deudorNombre: string;
  concepto: string;
  referenciaDocumento: string;
  montoTotal: number;
  montoPagado: number;
  saldoPendiente: number;
  estado: 'PENDIENTE' | 'PARCIAL' | 'PAGADO' | 'ANULADO';
  abonos: PaymentRecord[];
}

export interface CashMovement {
  id: string;
  negocioId: BusinessId;
  fecha: string;
  tipo: 'INGRESO' | 'EGRESO';
  categoria:
    | 'VENTA_CONTADO'
    | 'COBRO_CLIENTE'
    | 'ANTICIPO_CLIENTE'
    | 'COMPRA_CONTADO'
    | 'PAGO_PROVEEDOR'
    | 'REEMBOLSO_INTERNO'
    | 'GASTO_OPERATIVO'
    | 'ANULACION';
  concepto: string;
  monto: number;
  metodoPago: PaymentMethod;
  referencia: string;
  usuarioNombre: string;
  anulado?: boolean;
}

export interface AuditLog {
  id: string;
  negocioId: BusinessId;
  fecha: string;
  usuarioNombre: string;
  accion: string;
  entidad: string;
  documentoRef: string;
  detalle: string;
}

export interface BackupSnapshot {
  id: string;
  fecha: string;
  tipo: 'AUTOMATICO' | 'MANUAL';
  archivo: string;
  tamanoBytes: number;
  resumen: string;
}

export interface ImportSimulation {
  id: string;
  negocioId: BusinessId;
  fecha: string;
  proveedorArgentina: string;
  productoNombre: string;
  cantidadQuintales: number;
  precioFobUsd: number;
  tipoCambioBs: number;
  fleteInternacionalBs: number;
  aduanaDespachanteBs: number;
  estibajeDescargaBs: number;
  otrosGastosBs: number;
  costoTotalBs: number;
  costoPorQuintalBs: number;
}

export interface DatabaseState {
  businesses: Business[];
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
