import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createInitialDatabase } from './server/seed.ts';
import type {
  BusinessId,
  DatabaseState,
  InterBusinessDebt,
  PaymentCondition,
  PaymentMethod,
  PermissionKey,
  Product,
  Purchase,
  SaleItem,
  SaleOrder,
  UserAccount,
} from './src/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = process.env.VERCEL
  ? path.join('/tmp', 'abarrotes-data')
  : path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

let mutationCounter = 0;

function loadDb(): DatabaseState {
  ensureDirs();
  if (!fs.existsSync(DB_FILE)) {
    const initial = createInitialDatabase();
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
    createBackupSnapshot(initial, 'AUTOMATICO', 'Respaldo inicial automático del sistema');
    return initial;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw) as DatabaseState;
  } catch {
    const initial = createInitialDatabase();
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }
}

function createBackupSnapshot(
  db: DatabaseState,
  tipo: 'AUTOMATICO' | 'MANUAL',
  resumen: string
) {
  ensureDirs();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `backup_${tipo.toLowerCase()}_${stamp}.json`;
  const fullPath = path.join(BACKUPS_DIR, filename);
  const payload = JSON.stringify(db, null, 2);
  fs.writeFileSync(fullPath, payload, 'utf-8');

  const snapshot = {
    id: uid('bkp'),
    fecha: new Date().toISOString(),
    tipo,
    archivo: filename,
    tamanoBytes: Buffer.byteLength(payload, 'utf-8'),
    resumen,
  };
  db.backups = [snapshot, ...(db.backups || [])].slice(0, 15);
  return snapshot;
}

function saveDb(db: DatabaseState, autoBackupReason?: string) {
  ensureDirs();
  mutationCounter += 1;
  if (mutationCounter % 8 === 0) {
    createBackupSnapshot(
      db,
      'AUTOMATICO',
      autoBackupReason || 'Copia automática periódica tras operaciones'
    );
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

function logAudit(
  db: DatabaseState,
  negocioId: BusinessId,
  usuarioNombre: string,
  accion: string,
  entidad: string,
  documentoRef: string,
  detalle: string
) {
  db.auditLogs.unshift({
    id: uid('aud'),
    negocioId,
    fecha: new Date().toISOString(),
    usuarioNombre,
    accion,
    entidad,
    documentoRef,
    detalle,
  });
}

function nextDocNumber(prefix: string, existingNumbers: string[]): string {
  let max = 0;
  for (const num of existingNumbers) {
    const parts = num.split('-');
    const last = Number(parts[parts.length - 1]);
    if (Number.isFinite(last) && last > max) max = last;
  }
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function resolveSession(
  db: DatabaseState,
  req: express.Request,
  requiredPerm?: PermissionKey
): { user: UserAccount; businessId: BusinessId } | { errorStatus: number; error: string } {
  const userId = String(req.header('x-user-id') || '');
  const requestedBiz = String(req.header('x-business-id') || '') as BusinessId;

  const user = db.users.find((u) => u.id === userId && u.activo);
  if (!user) {
    return { errorStatus: 401, error: 'Sesión de usuario no válida o inactiva.' };
  }
  if (requestedBiz && user.negocioId !== requestedBiz) {
    return {
      errorStatus: 403,
      error: 'Acceso denegado: no tiene permiso para operar sobre otro negocio.',
    };
  }
  if (requiredPerm && !user.permisos.includes(requiredPerm)) {
    return {
      errorStatus: 403,
      error: `Permiso insuficiente: requiere "${requiredPerm}".`,
    };
  }
  return { user, businessId: user.negocioId };
}

export function createApiApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // Public directory for login / business switcher
  app.get('/api/auth/directory', (_req, res) => {
    const db = loadDb();
    res.json({
      businesses: db.businesses,
      users: db.users
        .filter((u) => u.activo)
        .map((u) => ({
          id: u.id,
          negocioId: u.negocioId,
          nombre: u.nombre,
          cargo: u.cargo,
          rol: u.rol,
          pinHint: u.pin,
        })),
    });
  });

  // Verify PIN when switching user
  app.post('/api/auth/login', (req, res) => {
    const db = loadDb();
    const { userId, pin } = req.body as { userId?: string; pin?: string };
    const user = db.users.find((u) => u.id === userId && u.activo);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }
    if (String(user.pin) !== String(pin)) {
      return res.status(401).json({ error: 'PIN incorrecto.' });
    }
    const business = db.businesses.find((b) => b.id === user.negocioId);
    return res.json({ user, business });
  });

  // Strictly isolated workspace data for the authenticated user's business
  app.get('/api/workspace', (req, res) => {
    const db = loadDb();
    const auth = resolveSession(db, req, 'dashboard');
    if ('error' in auth) return res.status(auth.errorStatus).json({ error: auth.error });

    const { user, businessId } = auth;
    const business = db.businesses.find((b) => b.id === businessId)!;
    const canSeePurchases = user.permisos.includes('compras_ver');
    const canManageUsers = user.permisos.includes('usuarios_gestionar');

    res.json({
      business,
      siblingBusinesses: db.businesses.map((b) => ({
        id: b.id,
        nombre: b.nombre,
        nombreCorto: b.nombreCorto,
        titular: b.titular,
        ciudad: b.ciudad,
        configuracion: b.configuracion,
      })),
      currentUser: user,
      users: db.users
        .filter((u) => u.negocioId === businessId)
        .map((u) => (canManageUsers ? u : { ...u, pin: '****' })),
      products: db.products.filter((p) => p.negocioId === businessId),
      movements: db.movements.filter((m) => m.negocioId === businessId),
      suppliers: db.suppliers.filter((s) => s.negocioId === businessId),
      purchases: canSeePurchases
        ? db.purchases.filter((p) => p.negocioId === businessId)
        : [],
      customers: db.customers.filter((c) => c.negocioId === businessId),
      sales: db.sales.filter((s) => s.negocioId === businessId),
      loans: db.loans.filter(
        (l) => l.negocioOrigenId === businessId || l.negocioDestinoId === businessId
      ),
      interDebts: db.interDebts.filter(
        (d) => d.acreedorNegocioId === businessId || d.deudorNegocioId === businessId
      ),
      cashMovements: db.cashMovements.filter((c) => c.negocioId === businessId),
      auditLogs: db.auditLogs.filter((a) => a.negocioId === businessId),
      backups: db.backups || [],
      importSimulations: db.importSimulations.filter((i) => i.negocioId === businessId),
    });
  });

  // --- PRODUCTS & INVENTORY ---
  app.post('/api/products', (req, res) => {
    const db = loadDb();
    const auth = resolveSession(db, req, 'inventario_editar');
    if ('error' in auth) return res.status(auth.errorStatus).json({ error: auth.error });

    const { user, businessId } = auth;
    const body = req.body as Partial<Product>;
    if (!body.nombre || !body.marca || !body.presentacionKg) {
      return res.status(400).json({ error: 'Nombre, marca y peso/presentación son obligatorios.' });
    }

    const product: Product = {
      id: uid('prod'),
      negocioId: businessId,
      sku: (body.sku || `${body.nombre.slice(0, 3)}-${body.marca.slice(0, 3)}-${body.presentacionKg}`).toUpperCase(),
      nombre: body.nombre.trim(),
      marca: body.marca.trim(),
      categoria: (body.categoria || 'Abarrotes').trim(),
      presentacionKg: Number(body.presentacionKg),
      unidadLabel: body.unidadLabel || 'Quintal',
      quintalesCerrados: Math.max(0, Number(body.quintalesCerrados || 0)),
      kilosSueltos: Math.max(0, Number(body.kilosSueltos || 0)),
      permiteFraccionado: Boolean(body.permiteFraccionado),
      precioQuintal: Math.max(0, Number(body.precioQuintal || 0)),
      precioKilo: Math.max(0, Number(body.precioKilo || 0)),
      costoPromedioQuintal: Math.max(0, Number(body.costoPromedioQuintal || 0)),
      stockMinimoQuintales: Math.max(0, Number(body.stockMinimoQuintales || 5)),
      activo: true,
    };

    db.products.push(product);
    if (product.quintalesCerrados > 0 || product.kilosSueltos > 0) {
      db.movements.unshift({
        id: uid('mov'),
        negocioId: businessId,
        fecha: new Date().toISOString(),
        productoId: product.id,
        productoNombre: product.nombre,
        marca: product.marca,
        presentacionKg: product.presentacionKg,
        tipo: 'AJUSTE_POSITIVO',
        deltaQuintales: product.quintalesCerrados,
        deltaKilos: product.kilosSueltos,
        saldoQuintales: product.quintalesCerrados,
        saldoKilos: product.kilosSueltos,
        referencia: product.sku,
        motivo: 'Stock inicial al registrar producto',
        usuarioNombre: user.nombre,
      });
    }

    logAudit(db, businessId, user.nombre, 'PRODUCTO_CREADO', 'Producto', product.sku, `${product.nombre} (${product.marca}) ${product.presentacionKg} kg`);
    saveDb(db);
    res.json({ product });
  });

  app.patch('/api/products/:id', (req, res) => {
    const db = loadDb();
    const auth = resolveSession(db, req, 'inventario_editar');
    if ('error' in auth) return res.status(auth.errorStatus).json({ error: auth.error });

    const { user, businessId } = auth;
    const product = db.products.find((p) => p.id === req.params.id && p.negocioId === businessId);
    if (!product) return res.status(404).json({ error: 'Producto no encontrado en este negocio.' });

    const body = req.body as Partial<Product>;
    if (body.nombre !== undefined) product.nombre = body.nombre.trim();
    if (body.marca !== undefined) product.marca = body.marca.trim();
    if (body.categoria !== undefined) product.categoria = body.categoria.trim();
    if (body.presentacionKg !== undefined) product.presentacionKg = Number(body.presentacionKg);
    if (body.unidadLabel !== undefined) product.unidadLabel = body.unidadLabel;
    if (body.permiteFraccionado !== undefined) product.permiteFraccionado = Boolean(body.permiteFraccionado);
    if (body.precioQuintal !== undefined) product.precioQuintal = Math.max(0, Number(body.precioQuintal));
    if (body.precioKilo !== undefined) product.precioKilo = Math.max(0, Number(body.precioKilo));
    if (body.costoPromedioQuintal !== undefined) product.costoPromedioQuintal = Math.max(0, Number(body.costoPromedioQuintal));
    if (body.stockMinimoQuintales !== undefined) product.stockMinimoQuintales = Math.max(0, Number(body.stockMinimoQuintales));

    logAudit(db, businessId, user.nombre, 'PRODUCTO_EDITADO', 'Producto', product.sku, `Actualización de precios/datos de ${product.nombre}`);
    saveDb(db);
    res.json({ product });
  });

  // Open N closed quintales into loose kilos
  app.post('/api/products/:id/open-quintal', (req, res) => {
    const db = loadDb();
    const auth = resolveSession(db, req, 'inventario_ver');
    if ('error' in auth) return res.status(auth.errorStatus).json({ error: auth.error });

    const { user, businessId } = auth;
    const biz = db.businesses.find((b) => b.id === businessId)!;
    if (!biz.configuracion.permitirVentaPorKilo) {
      return res.status(400).json({ error: 'Este negocio tiene desactivada la venta fraccionada por kilo.' });
    }

    const product = db.products.find((p) => p.id === req.params.id && p.negocioId === businessId);
    if (!product) return res.status(404).json({ error: 'Producto no encontrado.' });
    if (!product.permiteFraccionado) {
      return res.status(400).json({ error: 'Este producto no permite fraccionamiento por kilo.' });
    }

    const count = Math.max(1, Math.floor(Number(req.body.cantidadQuintales || 1)));
    if (product.quintalesCerrados < count) {
      return res.status(400).json({ error: 'No hay suficientes quintales cerrados disponibles.' });
    }

    const addedKilos = round2(count * product.presentacionKg);
    product.quintalesCerrados -= count;
    product.kilosSueltos = round2(product.kilosSueltos + addedKilos);

    db.movements.unshift({
      id: uid('mov'),
      negocioId: businessId,
      fecha: new Date().toISOString(),
      productoId: product.id,
      productoNombre: product.nombre,
      marca: product.marca,
      presentacionKg: product.presentacionKg,
      tipo: 'APERTURA_QUINTAL',
      deltaQuintales: -count,
      deltaKilos: addedKilos,
      saldoQuintales: product.quintalesCerrados,
      saldoKilos: product.kilosSueltos,
      referencia: `AP-${Date.now().toString().slice(-4)}`,
      motivo: req.body.motivo || `Apertura de ${count} ${product.unidadLabel.toLowerCase()}(es) a ${addedKilos} kg disponibles`,
      usuarioNombre: user.nombre,
    });

    logAudit(db, businessId, user.nombre, 'APERTURA_QUINTAL', 'Inventario', product.sku, `Se abrió ${count} qq (+${addedKilos} kg) de ${product.nombre}`);
    saveDb(db);
    res.json({ product });
  });

  // Inventory Adjustments & Returns
  app.post('/api/inventory/adjust', (req, res) => {
    const db = loadDb();
    const auth = resolveSession(db, req, 'inventario_editar');
    if ('error' in auth) return res.status(auth.errorStatus).json({ error: auth.error });

    const { user, businessId } = auth;
    const { productoId, tipo, cantidadQuintales, cantidadKilos, motivo } = req.body as {
      productoId: string;
      tipo: 'AJUSTE_POSITIVO' | 'AJUSTE_NEGATIVO' | 'DEVOLUCION_CLIENTE' | 'DEVOLUCION_PROVEEDOR';
      cantidadQuintales: number;
      cantidadKilos: number;
      motivo: string;
    };

    const product = db.products.find((p) => p.id === productoId && p.negocioId === businessId);
    if (!product) return res.status(404).json({ error: 'Producto no encontrado.' });
    if (!motivo || !motivo.trim()) {
      return res.status(400).json({ error: 'Debe especificar un motivo para el ajuste o devolución.' });
    }

    const q = Math.max(0, Number(cantidadQuintales || 0));
    const k = Math.max(0, Number(cantidadKilos || 0));
    if (q === 0 && k === 0) {
      return res.status(400).json({ error: 'Ingrese una cantidad mayor a cero.' });
    }

    const isPositive = tipo === 'AJUSTE_POSITIVO' || tipo === 'DEVOLUCION_CLIENTE';
    const deltaQ = isPositive ? q : -q;
    const deltaK = isPositive ? k : -k;

    if (product.quintalesCerrados + deltaQ < 0 || product.kilosSueltos + deltaK < 0) {
      return res.status(400).json({ error: 'El ajuste negativo excede el stock disponible.' });
    }

    product.quintalesCerrados = round2(product.quintalesCerrados + deltaQ);
    product.kilosSueltos = round2(product.kilosSueltos + deltaK);

    db.movements.unshift({
      id: uid('mov'),
      negocioId: businessId,
      fecha: new Date().toISOString(),
      productoId: product.id,
      productoNombre: product.nombre,
      marca: product.marca,
      presentacionKg: product.presentacionKg,
      tipo,
      deltaQuintales: deltaQ,
      deltaKilos: deltaK,
      saldoQuintales: product.quintalesCerrados,
      saldoKilos: product.kilosSueltos,
      referencia: `AJ-${Date.now().toString().slice(-5)}`,
      motivo: motivo.trim(),
      usuarioNombre: user.nombre,
    });

    logAudit(db, businessId, user.nombre, tipo, 'Inventario', product.sku, `${motivo.trim()} (${deltaQ} qq / ${deltaK} kg)`);
    saveDb(db);
    res.json({ product });
  });

  // --- SUPPLIERS & PURCHASES ---
  app.post('/api/suppliers', (req, res) => {
    const db = loadDb();
    const auth = resolveSession(db, req, 'compras_crear');
    if ('error' in auth) return res.status(auth.errorStatus).json({ error: auth.error });

    const { user, businessId } = auth;
    const { nombre, telefono, ciudad, nit } = req.body as Record<string, string>;
    if (!nombre?.trim()) return res.status(400).json({ error: 'Nombre del proveedor requerido.' });

    const supplier = {
      id: uid('sup'),
      negocioId: businessId,
      nombre: nombre.trim(),
      telefono: (telefono || '').trim(),
      ciudad: (ciudad || 'Santa Cruz, Bolivia').trim(),
      nit: (nit || '').trim(),
      tipo: 'EXTERNO' as const,
    };
    db.suppliers.push(supplier);
    logAudit(db, businessId, user.nombre, 'PROVEEDOR_CREADO', 'Proveedor', supplier.id, supplier.nombre);
    saveDb(db);
    res.json({ supplier });
  });

  app.post('/api/purchases', (req, res) => {
    const db = loadDb();
    const auth = resolveSession(db, req, 'compras_crear');
    if ('error' in auth) return res.status(auth.errorStatus).json({ error: auth.error });

    const { user, businessId } = auth;
    const body = req.body as {
      proveedorId: string;
      intermediarioNombre?: string;
      items: Array<{ productoId: string; cantidadQuintales: number; precioQuintal: number }>;
      tipoPago: PaymentCondition;
      pagoInicial?: number;
      metodoPago?: PaymentMethod;
      pagadoPorOtroNegocioId?: BusinessId | '';
      nota?: string;
    };

    const supplier = db.suppliers.find((s) => s.id === body.proveedorId && s.negocioId === businessId);
    if (!supplier) return res.status(404).json({ error: 'Proveedor no encontrado.' });
    if (!body.items || body.items.length === 0) {
      return res.status(400).json({ error: 'Debe incluir al menos un producto en la compra.' });
    }

    const builtItems = [];
    let total = 0;

    for (const line of body.items) {
      const prod = db.products.find((p) => p.id === line.productoId && p.negocioId === businessId);
      if (!prod) return res.status(404).json({ error: 'Producto de compra inválido.' });
      const qty = Math.max(0, Number(line.cantidadQuintales));
      const price = Math.max(0, Number(line.precioQuintal));
      if (qty <= 0) return res.status(400).json({ error: 'Cantidad debe ser mayor a cero.' });
      const subtotal = round2(qty * price);
      total = round2(total + subtotal);
      builtItems.push({
        productoId: prod.id,
        productoNombre: prod.nombre,
        marca: prod.marca,
        presentacionKg: prod.presentacionKg,
        cantidadQuintales: qty,
        precioQuintal: price,
        subtotal,
      });
    }

    const bizPrefix = businessId === 'neg_mama' ? 'COM-M' : businessId === 'neg_hermano' ? 'COM-H' : 'COM-P';
    const numero = nextDocNumber(
      bizPrefix,
      db.purchases.filter((p) => p.negocioId === businessId).map((p) => p.numero)
    );

    const pagadorExterno = body.pagadoPorOtroNegocioId
      ? db.businesses.find((b) => b.id === body.pagadoPorOtroNegocioId && b.id !== businessId)
      : undefined;

    let montoPagado = 0;
    let saldoPendiente = total;
    let estado: Purchase['estado'] = 'PENDIENTE';
    const abonos: Purchase['abonos'] = [];
    const metodo = body.metodoPago || 'EFECTIVO';
    const nowIso = new Date().toISOString();

    if (pagadorExterno) {
      // Special case (Point 6): Another family business paid the supplier on our behalf!
      // External supplier balance is settled (0 owed to supplier), and debt is created toward the paying sibling business.
      montoPagado = total;
      saldoPendiente = 0;
      estado = 'PAGADO';
      abonos.push({
        id: uid('abo'),
        fecha: nowIso,
        monto: total,
        metodoPago: 'REEMBOLSO_INTERNO',
        nota: `Pagado al proveedor directamente por ${pagadorExterno.nombre} (Reembolso pendiente)`,
        usuarioNombre: user.nombre,
      });

      const myBiz = db.businesses.find((b) => b.id === businessId)!;
      const debt: InterBusinessDebt = {
        id: uid('int'),
        fecha: nowIso,
        tipo: 'REEMBOLSO_COMPRA',
        acreedorNegocioId: pagadorExterno.id,
        acreedorNombre: pagadorExterno.nombre,
        deudorNegocioId: businessId,
        deudorNombre: myBiz.nombre,
        concepto: `Reembolso compra ${numero} (${supplier.nombre}) pagada por ${pagadorExterno.nombre}`,
        referenciaDocumento: numero,
        montoTotal: total,
        montoPagado: 0,
        saldoPendiente: total,
        estado: 'PENDIENTE',
        abonos: [],
      };
      db.interDebts.unshift(debt);

      db.cashMovements.unshift({
        id: uid('cash'),
        negocioId: pagadorExterno.id,
        fecha: nowIso,
        tipo: 'EGRESO',
        categoria: 'REEMBOLSO_INTERNO',
        concepto: `Pago a proveedor ${supplier.nombre} por cuenta de ${myBiz.nombre} (${numero})`,
        monto: total,
        metodoPago: metodo,
        referencia: numero,
        usuarioNombre: user.nombre,
      });
    } else {
      if (body.tipoPago === 'CONTADO') {
        montoPagado = total;
        saldoPendiente = 0;
        estado = 'PAGADO';
      } else if (body.tipoPago === 'PARCIAL') {
        montoPagado = Math.min(total, Math.max(0, round2(Number(body.pagoInicial || 0))));
        saldoPendiente = round2(total - montoPagado);
        estado = saldoPendiente === 0 ? 'PAGADO' : montoPagado > 0 ? 'PARCIAL' : 'PENDIENTE';
      }

      if (montoPagado > 0) {
        abonos.push({
          id: uid('abo'),
          fecha: nowIso,
          monto: montoPagado,
          metodoPago: metodo,
          nota: body.nota || (body.tipoPago === 'CONTADO' ? 'Pago total al contado' : 'Anticipo inicial de compra'),
          usuarioNombre: user.nombre,
        });
        db.cashMovements.unshift({
          id: uid('cash'),
          negocioId: businessId,
          fecha: nowIso,
          tipo: 'EGRESO',
          categoria: 'COMPRA_CONTADO',
          concepto: `Compra ${numero} · ${supplier.nombre}`,
          monto: montoPagado,
          metodoPago: metodo,
          referencia: numero,
          usuarioNombre: user.nombre,
        });
      }

      // If supplier is a sibling business, mirror InterBusinessDebt automatically
      if (supplier.tipo === 'INTER_NEGOCIO' && supplier.negocioVinculadoId) {
        const myBiz = db.businesses.find((b) => b.id === businessId)!;
        const creditorBiz = db.businesses.find((b) => b.id === supplier.negocioVinculadoId)!;
        db.interDebts.unshift({
          id: uid('int'),
          fecha: nowIso,
          tipo: 'VENTA_INTERNA',
          acreedorNegocioId: creditorBiz.id,
          acreedorNombre: creditorBiz.nombre,
          deudorNegocioId: businessId,
          deudorNombre: myBiz.nombre,
          concepto: `Compra interna ${numero} a ${creditorBiz.nombre}`,
          referenciaDocumento: numero,
          montoTotal: total,
          montoPagado,
          saldoPendiente,
          estado: saldoPendiente === 0 ? 'PAGADO' : montoPagado > 0 ? 'PARCIAL' : 'PENDIENTE',
          abonos: [...abonos],
        });
      }
    }

    // Update product inventory & weighted average cost
    for (const item of builtItems) {
      const prod = db.products.find((p) => p.id === item.productoId)!;
      const existingValue = prod.quintalesCerrados * prod.costoPromedioQuintal;
      const incomingValue = item.cantidadQuintales * item.precioQuintal;
      const totalQ = prod.quintalesCerrados + item.cantidadQuintales;
      if (totalQ > 0) {
        prod.costoPromedioQuintal = round2((existingValue + incomingValue) / totalQ);
      }
      prod.quintalesCerrados = round2(prod.quintalesCerrados + item.cantidadQuintales);

      db.movements.unshift({
        id: uid('mov'),
        negocioId: businessId,
        fecha: nowIso,
        productoId: prod.id,
        productoNombre: prod.nombre,
        marca: prod.marca,
        presentacionKg: prod.presentacionKg,
        tipo: supplier.tipo === 'INTER_NEGOCIO' ? 'COMPRA_INTERNA' : 'COMPRA',
        deltaQuintales: item.cantidadQuintales,
        deltaKilos: 0,
        saldoQuintales: prod.quintalesCerrados,
        saldoKilos: prod.kilosSueltos,
        referencia: numero,
        motivo: body.intermediarioNombre
          ? `Compra a ${supplier.nombre} (Intermediario: ${body.intermediarioNombre})`
          : `Compra a ${supplier.nombre}`,
        usuarioNombre: user.nombre,
      });
    }

    const purchase: Purchase = {
      id: uid('pur'),
      numero,
      negocioId: businessId,
      fecha: nowIso,
      proveedorId: supplier.id,
      proveedorNombre: supplier.nombre,
      intermediarioNombre: body.intermediarioNombre?.trim() || undefined,
      items: builtItems,
      total,
      tipoPago: body.tipoPago,
      pagadoPorOtroNegocioId: pagadorExterno?.id,
      pagadoPorOtroNegocioNombre: pagadorExterno?.nombre,
      montoPagado,
      saldoPendiente,
      abonos,
      estado,
      usuarioNombre: user.nombre,
    };

    db.purchases.unshift(purchase);
    logAudit(
      db,
      businessId,
      user.nombre,
      'COMPRA_REGISTRADA',
      'Compra',
      numero,
      `Proveedor: ${supplier.nombre} · Total: Bs ${total}`
    );
    saveDb(db, `Respaldo automático tras compra ${numero}`);
    res.json({ purchase });
  });

  app.post('/api/purchases/:id/abonos', (req, res) => {
    const db = loadDb();
    const auth = resolveSession(db, req, 'proveedores_pagar');
    if ('error' in auth) return res.status(auth.errorStatus).json({ error: auth.error });

    const { user, businessId } = auth;
    const purchase = db.purchases.find((p) => p.id === req.params.id && p.negocioId === businessId);
    if (!purchase) return res.status(404).json({ error: 'Compra no encontrada.' });
    if (purchase.estado === 'ANULADO') return res.status(400).json({ error: 'La compra está anulada.' });

    const monto = round2(Number(req.body.monto || 0));
    if (monto <= 0 || monto > purchase.saldoPendiente + 0.01) {
      return res.status(400).json({ error: 'Monto de abono inválido o superior al saldo pendiente.' });
    }

    const applied = Math.min(monto, purchase.saldoPendiente);
    const nowIso = new Date().toISOString();
    const metodo = (req.body.metodoPago || 'EFECTIVO') as PaymentMethod;
    const nota = String(req.body.nota || 'Abono a cuenta de proveedor');

    const abono = {
      id: uid('abo'),
      fecha: nowIso,
      monto: applied,
      metodoPago: metodo,
      nota,
      usuarioNombre: user.nombre,
    };

    purchase.abonos.push(abono);
    purchase.montoPagado = round2(purchase.montoPagado + applied);
    purchase.saldoPendiente = round2(purchase.total - purchase.montoPagado);
    purchase.estado = purchase.saldoPendiente <= 0.01 ? 'PAGADO' : 'PARCIAL';
    if (purchase.saldoPendiente < 0.01) purchase.saldoPendiente = 0;

    db.cashMovements.unshift({
      id: uid('cash'),
      negocioId: businessId,
      fecha: nowIso,
      tipo: 'EGRESO',
      categoria: 'PAGO_PROVEEDOR',
      concepto: `Abono compra ${purchase.numero} · ${purchase.proveedorNombre}`,
      monto: applied,
      metodoPago: metodo,
      referencia: purchase.numero,
      usuarioNombre: user.nombre,
    });

    logAudit(db, businessId, user.nombre, 'ABONO_PROVEEDOR', 'Compra', purchase.numero, `Abono de Bs ${applied} (${metodo})`);
    saveDb(db);
    res.json({ purchase });
  });

  app.post('/api/purchases/:id/void', (req, res) => {
    const db = loadDb();
    const auth = resolveSession(db, req, 'compras_crear');
    if ('error' in auth) return res.status(auth.errorStatus).json({ error: auth.error });

    const { user, businessId } = auth;
    const purchase = db.purchases.find((p) => p.id === req.params.id && p.negocioId === businessId);
    if (!purchase) return res.status(404).json({ error: 'Compra no encontrada.' });
    if (purchase.estado === 'ANULADO') return res.status(400).json({ error: 'Ya fue anulada.' });

    const motivo = String(req.body.motivo || '').trim();
    if (!motivo) return res.status(400).json({ error: 'Debe indicar el motivo de anulación.' });

    // Verify stock availability before reversing
    for (const item of purchase.items) {
      const prod = db.products.find((p) => p.id === item.productoId && p.negocioId === businessId);
      if (prod && prod.quintalesCerrados < item.cantidadQuintales) {
        return res.status(400).json({
          error: `No se puede anular: parte del stock de ${prod.nombre} ya fue vendido o utilizado.`,
        });
      }
    }

    const nowIso = new Date().toISOString();
    for (const item of purchase.items) {
      const prod = db.products.find((p) => p.id === item.productoId && p.negocioId === businessId);
      if (prod) {
        prod.quintalesCerrados = round2(prod.quintalesCerrados - item.cantidadQuintales);
        db.movements.unshift({
          id: uid('mov'),
          negocioId: businessId,
          fecha: nowIso,
          productoId: prod.id,
          productoNombre: prod.nombre,
          marca: prod.marca,
          presentacionKg: prod.presentacionKg,
          tipo: 'ANULACION',
          deltaQuintales: -item.cantidadQuintales,
          deltaKilos: 0,
          saldoQuintales: prod.quintalesCerrados,
          saldoKilos: prod.kilosSueltos,
          referencia: purchase.numero,
          motivo: `Anulación de compra: ${motivo}`,
          usuarioNombre: user.nombre,
        });
      }
    }

    if (purchase.montoPagado > 0 && !purchase.pagadoPorOtroNegocioId) {
      db.cashMovements.unshift({
        id: uid('cash'),
        negocioId: businessId,
        fecha: nowIso,
        tipo: 'INGRESO',
        categoria: 'ANULACION',
        concepto: `Reversión caja por anulación ${purchase.numero}`,
        monto: purchase.montoPagado,
        metodoPago: 'EFECTIVO',
        referencia: purchase.numero,
        usuarioNombre: user.nombre,
      });
    }

    purchase.estado = 'ANULADO';
    purchase.motivoAnulacion = motivo;
    purchase.saldoPendiente = 0;

    logAudit(db, businessId, user.nombre, 'COMPRA_ANULADA', 'Compra', purchase.numero, motivo);
    saveDb(db);
    res.json({ purchase });
  });

  // --- CUSTOMERS & SALES ---
  app.post('/api/customers', (req, res) => {
    const db = loadDb();
    const auth = resolveSession(db, req, 'clientes_ver');
    if ('error' in auth) return res.status(auth.errorStatus).json({ error: auth.error });

    const { user, businessId } = auth;
    const { nombre, telefono, direccion, ciNit } = req.body as Record<string, string>;
    if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre del cliente es obligatorio.' });

    const customer = {
      id: uid('cli'),
      negocioId: businessId,
      nombre: nombre.trim(),
      telefono: (telefono || '').trim(),
      direccion: (direccion || '').trim(),
      ciNit: (ciNit || '').trim(),
      saldoAnticipo: 0,
    };
    db.customers.push(customer);
    logAudit(db, businessId, user.nombre, 'CLIENTE_CREADO', 'Cliente', customer.id, customer.nombre);
    saveDb(db);
    res.json({ customer });
  });

  app.post('/api/customers/:id/advance', (req, res) => {
    const db = loadDb();
    const auth = resolveSession(db, req, 'clientes_cobrar');
    if ('error' in auth) return res.status(auth.errorStatus).json({ error: auth.error });

    const { user, businessId } = auth;
    const customer = db.customers.find((c) => c.id === req.params.id && c.negocioId === businessId);
    if (!customer) return res.status(404).json({ error: 'Cliente no encontrado.' });

    const monto = round2(Number(req.body.monto || 0));
    if (monto <= 0) return res.status(400).json({ error: 'El anticipo debe ser mayor a cero.' });

    const metodo = (req.body.metodoPago || 'EFECTIVO') as PaymentMethod;
    const nowIso = new Date().toISOString();
    customer.saldoAnticipo = round2(customer.saldoAnticipo + monto);

    db.cashMovements.unshift({
      id: uid('cash'),
      negocioId: businessId,
      fecha: nowIso,
      tipo: 'INGRESO',
      categoria: 'ANTICIPO_CLIENTE',
      concepto: `Anticipo recibido de ${customer.nombre}`,
      monto,
      metodoPago: metodo,
      referencia: customer.id,
      usuarioNombre: user.nombre,
    });

    logAudit(db, businessId, user.nombre, 'ANTICIPO_CLIENTE', 'Cliente', customer.nombre, `Anticipo registrado: Bs ${monto}`);
    saveDb(db);
    res.json({ customer });
  });

  app.post('/api/sales', (req, res) => {
    const db = loadDb();
    const auth = resolveSession(db, req, 'ventas_crear');
    if ('error' in auth) return res.status(auth.errorStatus).json({ error: auth.error });

    const { user, businessId } = auth;
    const biz = db.businesses.find((b) => b.id === businessId)!;

    const body = req.body as {
      clienteId?: string;
      destinoNegocioId?: BusinessId | '';
      items: Array<{
        productoId: string;
        modalidad: 'QUINTAL' | 'KILO';
        cantidad: number;
        precioUnitario?: number;
      }>;
      tipoPago: PaymentCondition;
      pagoInicial?: number;
      metodoPago?: PaymentMethod;
      nota?: string;
    };

    if (!body.items || body.items.length === 0) {
      return res.status(400).json({ error: 'Agregue al menos un producto al pedido.' });
    }

    const targetBiz = body.destinoNegocioId
      ? db.businesses.find((b) => b.id === body.destinoNegocioId && b.id !== businessId)
      : undefined;

    let customerNombre = 'Cliente Ocasional';
    let customerId = 'ocasional';
    if (targetBiz) {
      customerId = `biz_${targetBiz.id}`;
      customerNombre = `${targetBiz.nombre} (${targetBiz.nombreCorto})`;
    } else if (body.clienteId && body.clienteId !== 'ocasional') {
      const c = db.customers.find((cli) => cli.id === body.clienteId && cli.negocioId === businessId);
      if (!c) return res.status(404).json({ error: 'Cliente no encontrado.' });
      customerId = c.id;
      customerNombre = c.nombre;
    }

    // Pre-validate stock (including auto-opening quintales if enabled)
    const builtItems: SaleItem[] = [];
    let total = 0;
    let costoTotal = 0;
    const pendingOpens: Array<{ prod: Product; qqToOpen: number; addedKg: number }> = [];

    // Track simulated stock per product in case same product appears twice (e.g., 1 quintal + 5 kg)
    const simStock = new Map<string, { qq: number; kg: number }>();

    for (const line of body.items) {
      const prod = db.products.find((p) => p.id === line.productoId && p.negocioId === businessId);
      if (!prod) return res.status(404).json({ error: 'Producto no encontrado.' });

      if (!simStock.has(prod.id)) {
        simStock.set(prod.id, { qq: prod.quintalesCerrados, kg: prod.kilosSueltos });
      }
      const stock = simStock.get(prod.id)!;
      const qty = Math.max(0, Number(line.cantidad));
      if (qty <= 0) return res.status(400).json({ error: 'Cantidad debe ser mayor a cero.' });

      if (line.modalidad === 'KILO') {
        if (!biz.configuracion.permitirVentaPorKilo || !prod.permiteFraccionado) {
          return res.status(400).json({ error: `El producto ${prod.nombre} no permite venta por kilo en este negocio.` });
        }
        if (stock.kg < qty) {
          const deficitKg = qty - stock.kg;
          const qqNeeded = Math.ceil(deficitKg / prod.presentacionKg);
          if (biz.configuracion.autoAbrirQuintalEnVenta && stock.qq >= qqNeeded) {
            const addedKg = round2(qqNeeded * prod.presentacionKg);
            stock.qq -= qqNeeded;
            stock.kg = round2(stock.kg + addedKg);
            pendingOpens.push({ prod, qqToOpen: qqNeeded, addedKg });
          } else {
            return res.status(400).json({
              error: `Stock insuficiente en kilos para ${prod.nombre} (${prod.marca}). Disponible: ${stock.kg} kg y ${stock.qq} qq cerrados.`,
            });
          }
        }
        stock.kg = round2(stock.kg - qty);
        const unitPrice = line.precioUnitario !== undefined ? Number(line.precioUnitario) : prod.precioKilo;
        const unitCost = prod.presentacionKg > 0 ? round2(prod.costoPromedioQuintal / prod.presentacionKg) : 0;
        const subtotal = round2(qty * unitPrice);
        total = round2(total + subtotal);
        costoTotal = round2(costoTotal + qty * unitCost);
        builtItems.push({
          productoId: prod.id,
          productoNombre: prod.nombre,
          marca: prod.marca,
          presentacionKg: prod.presentacionKg,
          modalidad: 'KILO',
          cantidad: qty,
          precioUnitario: unitPrice,
          costoUnitarioEstimado: unitCost,
          subtotal,
        });
      } else {
        if (stock.qq < qty) {
          return res.status(400).json({
            error: `Stock insuficiente en quintales cerrados para ${prod.nombre} (${prod.marca}). Disponible: ${stock.qq} qq.`,
          });
        }
        stock.qq = round2(stock.qq - qty);
        const unitPrice = line.precioUnitario !== undefined ? Number(line.precioUnitario) : prod.precioQuintal;
        const unitCost = prod.costoPromedioQuintal;
        const subtotal = round2(qty * unitPrice);
        total = round2(total + subtotal);
        costoTotal = round2(costoTotal + qty * unitCost);
        builtItems.push({
          productoId: prod.id,
          productoNombre: prod.nombre,
          marca: prod.marca,
          presentacionKg: prod.presentacionKg,
          modalidad: 'QUINTAL',
          cantidad: qty,
          precioUnitario: unitPrice,
          costoUnitarioEstimado: unitCost,
          subtotal,
        });
      }
    }

    const nowIso = new Date().toISOString();
    const prefix = businessId === 'neg_mama' ? 'PED-M' : businessId === 'neg_hermano' ? 'PED-H' : 'PED-P';
    const numero = nextDocNumber(
      prefix,
      db.sales.filter((s) => s.negocioId === businessId).map((s) => s.numero)
    );

    // Apply stock updates and Kardex movements
    for (const openOp of pendingOpens) {
      openOp.prod.quintalesCerrados -= openOp.qqToOpen;
      openOp.prod.kilosSueltos = round2(openOp.prod.kilosSueltos + openOp.addedKg);
      db.movements.unshift({
        id: uid('mov'),
        negocioId: businessId,
        fecha: nowIso,
        productoId: openOp.prod.id,
        productoNombre: openOp.prod.nombre,
        marca: openOp.prod.marca,
        presentacionKg: openOp.prod.presentacionKg,
        tipo: 'APERTURA_QUINTAL',
        deltaQuintales: -openOp.qqToOpen,
        deltaKilos: openOp.addedKg,
        saldoQuintales: openOp.prod.quintalesCerrados,
        saldoKilos: openOp.prod.kilosSueltos,
        referencia: numero,
        motivo: `Apertura automática al vender fraccionado (${numero})`,
        usuarioNombre: user.nombre,
      });
    }

    for (const item of builtItems) {
      const prod = db.products.find((p) => p.id === item.productoId)!;
      if (item.modalidad === 'KILO') {
        prod.kilosSueltos = round2(prod.kilosSueltos - item.cantidad);
      } else {
        prod.quintalesCerrados = round2(prod.quintalesCerrados - item.cantidad);
      }

      db.movements.unshift({
        id: uid('mov'),
        negocioId: businessId,
        fecha: nowIso,
        productoId: prod.id,
        productoNombre: prod.nombre,
        marca: prod.marca,
        presentacionKg: prod.presentacionKg,
        tipo: targetBiz
          ? 'VENTA_INTERNA'
          : item.modalidad === 'KILO'
          ? 'VENTA_KILO'
          : 'VENTA_QUINTAL',
        deltaQuintales: item.modalidad === 'QUINTAL' ? -item.cantidad : 0,
        deltaKilos: item.modalidad === 'KILO' ? -item.cantidad : 0,
        saldoQuintales: prod.quintalesCerrados,
        saldoKilos: prod.kilosSueltos,
        referencia: numero,
        motivo: `Pedido ${numero} · ${customerNombre}`,
        usuarioNombre: user.nombre,
      });
    }

    let montoPagado = 0;
    if (body.tipoPago === 'CONTADO') {
      montoPagado = total;
    } else if (body.tipoPago === 'PARCIAL') {
      montoPagado = Math.min(total, Math.max(0, round2(Number(body.pagoInicial || 0))));
    }
    const saldoPendiente = round2(total - montoPagado);
    const estado: SaleOrder['estado'] =
      saldoPendiente <= 0.01 ? 'PAGADO' : montoPagado > 0 ? 'PARCIAL' : 'PENDIENTE';

    const metodo = body.metodoPago || 'EFECTIVO';
    const pagos =
      montoPagado > 0
        ? [
            {
              id: uid('pag'),
              fecha: nowIso,
              monto: montoPagado,
              metodoPago: metodo,
              nota: body.nota || (body.tipoPago === 'CONTADO' ? 'Pago completo al contado' : 'Pago inicial del pedido'),
              usuarioNombre: user.nombre,
            },
          ]
        : [];

    if (montoPagado > 0) {
      db.cashMovements.unshift({
        id: uid('cash'),
        negocioId: businessId,
        fecha: nowIso,
        tipo: 'INGRESO',
        categoria: 'VENTA_CONTADO',
        concepto: `Pedido ${numero} · ${customerNombre}`,
        monto: montoPagado,
        metodoPago: metodo,
        referencia: numero,
        usuarioNombre: user.nombre,
      });
    }

    const sale: SaleOrder = {
      id: uid('sal'),
      numero,
      negocioId: businessId,
      fecha: nowIso,
      clienteId: customerId,
      clienteNombre: customerNombre,
      destinoNegocioId: targetBiz?.id,
      items: builtItems,
      total,
      costoTotalEstimado: round2(costoTotal),
      tipoPago: body.tipoPago,
      montoPagado,
      saldoPendiente: saldoPendiente < 0.01 ? 0 : saldoPendiente,
      pagos,
      estado,
      usuarioNombre: user.nombre,
    };

    db.sales.unshift(sale);

    // Inter-business Sale Mirror (Point 6):
    // Automatically registers mirrored Purchase + Inventory entry in destination business + InterBusinessDebt
    if (targetBiz) {
      let siblingSupplier = db.suppliers.find(
        (s) => s.negocioId === targetBiz.id && s.negocioVinculadoId === businessId
      );
      if (!siblingSupplier) {
        siblingSupplier = {
          id: uid('sup'),
          negocioId: targetBiz.id,
          nombre: `${biz.nombre} (${biz.nombreCorto})`,
          telefono: biz.telefono,
          ciudad: biz.ciudad,
          nit: biz.nit,
          tipo: 'INTER_NEGOCIO',
          negocioVinculadoId: businessId,
        };
        db.suppliers.push(siblingSupplier);
      }

      const targetPrefix =
        targetBiz.id === 'neg_mama' ? 'COM-M' : targetBiz.id === 'neg_hermano' ? 'COM-H' : 'COM-P';
      const targetPurNum = nextDocNumber(
        targetPrefix,
        db.purchases.filter((p) => p.negocioId === targetBiz.id).map((p) => p.numero)
      );

      const targetPurItems = [];
      for (const sItem of builtItems) {
        let destProd = db.products.find(
          (p) =>
            p.negocioId === targetBiz.id &&
            p.nombre.toLowerCase() === sItem.productoNombre.toLowerCase() &&
            p.marca.toLowerCase() === sItem.marca.toLowerCase() &&
            p.presentacionKg === sItem.presentacionKg
        );
        if (!destProd) {
          destProd = {
            id: uid('prod'),
            negocioId: targetBiz.id,
            sku: `${sItem.productoNombre.slice(0, 3)}-${sItem.marca.slice(0, 3)}-${sItem.presentacionKg}`.toUpperCase(),
            nombre: sItem.productoNombre,
            marca: sItem.marca,
            categoria: 'Abarrotes',
            presentacionKg: sItem.presentacionKg,
            unidadLabel: 'Quintal',
            quintalesCerrados: 0,
            kilosSueltos: 0,
            permiteFraccionado: targetBiz.configuracion.permitirVentaPorKilo,
            precioQuintal: round2(sItem.precioUnitario * 1.1),
            precioKilo: targetBiz.configuracion.permitirVentaPorKilo
              ? round2((sItem.precioUnitario / sItem.presentacionKg) * 1.15)
              : 0,
            costoPromedioQuintal: sItem.modalidad === 'QUINTAL' ? sItem.precioUnitario : round2(sItem.precioUnitario * sItem.presentacionKg),
            stockMinimoQuintales: 5,
            activo: true,
          };
          db.products.push(destProd);
        }

        if (sItem.modalidad === 'QUINTAL') {
          const prevVal = destProd.quintalesCerrados * destProd.costoPromedioQuintal;
          const addVal = sItem.cantidad * sItem.precioUnitario;
          const totalQ = destProd.quintalesCerrados + sItem.cantidad;
          if (totalQ > 0) destProd.costoPromedioQuintal = round2((prevVal + addVal) / totalQ);
          destProd.quintalesCerrados = round2(destProd.quintalesCerrados + sItem.cantidad);
        } else {
          destProd.kilosSueltos = round2(destProd.kilosSueltos + sItem.cantidad);
        }

        db.movements.unshift({
          id: uid('mov'),
          negocioId: targetBiz.id,
          fecha: nowIso,
          productoId: destProd.id,
          productoNombre: destProd.nombre,
          marca: destProd.marca,
          presentacionKg: destProd.presentacionKg,
          tipo: 'COMPRA_INTERNA',
          deltaQuintales: sItem.modalidad === 'QUINTAL' ? sItem.cantidad : 0,
          deltaKilos: sItem.modalidad === 'KILO' ? sItem.cantidad : 0,
          saldoQuintales: destProd.quintalesCerrados,
          saldoKilos: destProd.kilosSueltos,
          referencia: targetPurNum,
          motivo: `Compra interna recibida desde ${biz.nombre} (${numero})`,
          usuarioNombre: user.nombre,
        });

        targetPurItems.push({
          productoId: destProd.id,
          productoNombre: destProd.nombre,
          marca: destProd.marca,
          presentacionKg: destProd.presentacionKg,
          cantidadQuintales:
            sItem.modalidad === 'QUINTAL'
              ? sItem.cantidad
              : round2(sItem.cantidad / destProd.presentacionKg),
          precioQuintal:
            sItem.modalidad === 'QUINTAL'
              ? sItem.precioUnitario
              : round2(sItem.precioUnitario * destProd.presentacionKg),
          subtotal: sItem.subtotal,
        });
      }

      db.purchases.unshift({
        id: uid('pur'),
        numero: targetPurNum,
        negocioId: targetBiz.id,
        fecha: nowIso,
        proveedorId: siblingSupplier.id,
        proveedorNombre: siblingSupplier.nombre,
        items: targetPurItems,
        total,
        tipoPago: body.tipoPago,
        montoPagado,
        saldoPendiente: sale.saldoPendiente,
        abonos: [...pagos],
        estado,
        usuarioNombre: user.nombre,
      });

      if (montoPagado > 0) {
        db.cashMovements.unshift({
          id: uid('cash'),
          negocioId: targetBiz.id,
          fecha: nowIso,
          tipo: 'EGRESO',
          categoria: 'REEMBOLSO_INTERNO',
          concepto: `Pago por compra interna ${targetPurNum} a ${biz.nombre}`,
          monto: montoPagado,
          metodoPago: metodo,
          referencia: targetPurNum,
          usuarioNombre: user.nombre,
        });
      }

      db.interDebts.unshift({
        id: uid('int'),
        fecha: nowIso,
        tipo: 'VENTA_INTERNA',
        acreedorNegocioId: businessId,
        acreedorNombre: biz.nombre,
        deudorNegocioId: targetBiz.id,
        deudorNombre: targetBiz.nombre,
        concepto: `Venta entre negocios (${numero} → ${targetPurNum})`,
        referenciaDocumento: `${numero} / ${targetPurNum}`,
        montoTotal: total,
        montoPagado,
        saldoPendiente: sale.saldoPendiente,
        estado: sale.saldoPendiente === 0 ? 'PAGADO' : montoPagado > 0 ? 'PARCIAL' : 'PENDIENTE',
        abonos: [...pagos],
      });
    }

    logAudit(db, businessId, user.nombre, 'VENTA_REGISTRADA', 'Pedido', numero, `Cliente: ${customerNombre} · Total: Bs ${total}`);
    saveDb(db, `Respaldo automático tras venta ${numero}`);
    res.json({ sale });
  });

  app.post('/api/sales/:id/void', (req, res) => {
    const db = loadDb();
    const auth = resolveSession(db, req, 'ventas_anular');
    if ('error' in auth) return res.status(auth.errorStatus).json({ error: auth.error });

    const { user, businessId } = auth;
    const sale = db.sales.find((s) => s.id === req.params.id && s.negocioId === businessId);
    if (!sale) return res.status(404).json({ error: 'Pedido no encontrado.' });
    if (sale.estado === 'ANULADO') return res.status(400).json({ error: 'El pedido ya está anulado.' });

    const motivo = String(req.body.motivo || '').trim();
    if (!motivo) return res.status(400).json({ error: 'Debe indicar el motivo de anulación.' });

    const nowIso = new Date().toISOString();
    for (const item of sale.items) {
      const prod = db.products.find((p) => p.id === item.productoId && p.negocioId === businessId);
      if (prod) {
        if (item.modalidad === 'KILO') {
          prod.kilosSueltos = round2(prod.kilosSueltos + item.cantidad);
        } else {
          prod.quintalesCerrados = round2(prod.quintalesCerrados + item.cantidad);
        }
        db.movements.unshift({
          id: uid('mov'),
          negocioId: businessId,
          fecha: nowIso,
          productoId: prod.id,
          productoNombre: prod.nombre,
          marca: prod.marca,
          presentacionKg: prod.presentacionKg,
          tipo: 'ANULACION',
          deltaQuintales: item.modalidad === 'QUINTAL' ? item.cantidad : 0,
          deltaKilos: item.modalidad === 'KILO' ? item.cantidad : 0,
          saldoQuintales: prod.quintalesCerrados,
          saldoKilos: prod.kilosSueltos,
          referencia: sale.numero,
          motivo: `Anulación de pedido: ${motivo}`,
          usuarioNombre: user.nombre,
        });
      }
    }

    if (sale.montoPagado > 0) {
      db.cashMovements.unshift({
        id: uid('cash'),
        negocioId: businessId,
        fecha: nowIso,
        tipo: 'EGRESO',
        categoria: 'ANULACION',
        concepto: `Devolución/reversión por anulación de ${sale.numero}`,
        monto: sale.montoPagado,
        metodoPago: 'EFECTIVO',
        referencia: sale.numero,
        usuarioNombre: user.nombre,
      });
    }

    sale.estado = 'ANULADO';
    sale.motivoAnulacion = motivo;
    sale.saldoPendiente = 0;

    logAudit(db, businessId, user.nombre, 'VENTA_ANULADA', 'Pedido', sale.numero, motivo);
    saveDb(db);
    res.json({ sale });
  });

  // Apply customer payment (FIFO oldest order OR specific order)
  app.post('/api/customers/:id/payments', (req, res) => {
    const db = loadDb();
    const auth = resolveSession(db, req, 'clientes_cobrar');
    if ('error' in auth) return res.status(auth.errorStatus).json({ error: auth.error });

    const { user, businessId } = auth;
    const customer = db.customers.find((c) => c.id === req.params.id && c.negocioId === businessId);
    if (!customer) return res.status(404).json({ error: 'Cliente no encontrado.' });

    const {
      monto,
      modo,
      saleId,
      metodoPago,
      nota,
      usarAnticipo,
    } = req.body as {
      monto: number;
      modo: 'FIFO' | 'ESPECIFICO';
      saleId?: string;
      metodoPago: PaymentMethod;
      nota?: string;
      usarAnticipo?: boolean;
    };

    let cashPaid = Math.max(0, round2(Number(monto || 0)));
    let advanceUsed = 0;
    if (usarAnticipo && customer.saldoAnticipo > 0) {
      advanceUsed = customer.saldoAnticipo;
    }
    let availableToApply = round2(cashPaid + advanceUsed);
    if (availableToApply <= 0) {
      return res.status(400).json({ error: 'Ingrese un monto válido para registrar el pago.' });
    }

    const openOrders = db.sales
      .filter(
        (s) =>
          s.negocioId === businessId &&
          s.clienteId === customer.id &&
          s.estado !== 'ANULADO' &&
          s.saldoPendiente > 0.01
      )
      .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

    if (openOrders.length === 0) {
      return res.status(400).json({ error: 'El cliente no tiene pedidos con saldo pendiente.' });
    }

    const targets =
      modo === 'ESPECIFICO' && saleId
        ? openOrders.filter((o) => o.id === saleId)
        : openOrders;

    if (targets.length === 0) {
      return res.status(404).json({ error: 'El pedido seleccionado no tiene saldo pendiente.' });
    }

    const nowIso = new Date().toISOString();
    const appliedDetails: Array<{ numero: string; aplicado: number }> = [];
    let totalApplied = 0;

    for (const order of targets) {
      if (availableToApply <= 0.009) break;
      const applyAmount = round2(Math.min(availableToApply, order.saldoPendiente));
      if (applyAmount <= 0) continue;

      order.pagos.push({
        id: uid('pag'),
        fecha: nowIso,
        monto: applyAmount,
        metodoPago: metodoPago || 'EFECTIVO',
        nota:
          nota?.trim() ||
          (modo === 'FIFO' ? 'Pago aplicado automáticamente al pedido más antiguo' : 'Pago directo al pedido'),
        usuarioNombre: user.nombre,
      });

      order.montoPagado = round2(order.montoPagado + applyAmount);
      order.saldoPendiente = round2(order.total - order.montoPagado);
      if (order.saldoPendiente < 0.01) order.saldoPendiente = 0;
      order.estado = order.saldoPendiente === 0 ? 'PAGADO' : 'PARCIAL';

      availableToApply = round2(availableToApply - applyAmount);
      totalApplied = round2(totalApplied + applyAmount);
      appliedDetails.push({ numero: order.numero, aplicado: applyAmount });
    }

    // Consume advance first, then cash
    if (advanceUsed > 0) {
      const consumedAdv = Math.min(advanceUsed, totalApplied);
      customer.saldoAnticipo = round2(customer.saldoAnticipo - consumedAdv);
    }

    // If cashPaid exceeded total pending debt, put remainder into customer's saldoAnticipo
    if (cashPaid > totalApplied - advanceUsed && availableToApply > 0.01) {
      customer.saldoAnticipo = round2(customer.saldoAnticipo + availableToApply);
    }

    if (cashPaid > 0) {
      db.cashMovements.unshift({
        id: uid('cash'),
        negocioId: businessId,
        fecha: nowIso,
        tipo: 'INGRESO',
        categoria: 'COBRO_CLIENTE',
        concepto: `Cobro a ${customer.nombre} (${appliedDetails.map((d) => d.numero).join(', ')})`,
        monto: cashPaid,
        metodoPago: metodoPago || 'EFECTIVO',
        referencia: appliedDetails.map((d) => d.numero).join(','),
        usuarioNombre: user.nombre,
      });
    }

    logAudit(
      db,
      businessId,
      user.nombre,
      'COBRO_REGISTRADO',
      'Cliente',
      customer.nombre,
      `Aplicado Bs ${totalApplied} (${modo}): ${appliedDetails.map((d) => `${d.numero}=Bs ${d.aplicado}`).join('; ')}`
    );
    saveDb(db);
    res.json({ appliedDetails, totalApplied, customer });
  });

  // --- INTER-BUSINESS LOANS (Point 5) ---
  app.post('/api/loans', (req, res) => {
    const db = loadDb();
    const auth = resolveSession(db, req, 'prestamos_gestionar');
    if ('error' in auth) return res.status(auth.errorStatus).json({ error: auth.error });

    const { user, businessId } = auth;
    const {
      negocioDestinoId,
      productoId,
      cantidadQuintales,
      notas,
    } = req.body as {
      negocioDestinoId: BusinessId;
      productoId: string;
      cantidadQuintales: number;
      notas?: string;
    };

    if (!negocioDestinoId || negocioDestinoId === businessId) {
      return res.status(400).json({ error: 'Seleccione un negocio hermano distinto como destinatario.' });
    }

    const originBiz = db.businesses.find((b) => b.id === businessId)!;
    const destBiz = db.businesses.find((b) => b.id === negocioDestinoId);
    if (!destBiz) return res.status(404).json({ error: 'Negocio destino no encontrado.' });

    const originProd = db.products.find((p) => p.id === productoId && p.negocioId === businessId);
    if (!originProd) return res.status(404).json({ error: 'Producto no encontrado en su inventario.' });

    const qty = Math.max(0, round2(Number(cantidadQuintales || 0)));
    if (qty <= 0 || originProd.quintalesCerrados < qty) {
      return res.status(400).json({ error: 'Cantidad inválida o stock insuficiente en quintales cerrados.' });
    }

    const nowIso = new Date().toISOString();
    const codigo = nextDocNumber('PREST', db.loans.map((l) => l.codigo));

    // Deduct from lender
    originProd.quintalesCerrados = round2(originProd.quintalesCerrados - qty);
    db.movements.unshift({
      id: uid('mov'),
      negocioId: businessId,
      fecha: nowIso,
      productoId: originProd.id,
      productoNombre: originProd.nombre,
      marca: originProd.marca,
      presentacionKg: originProd.presentacionKg,
      tipo: 'PRESTAMO_OTORGADO',
      deltaQuintales: -qty,
      deltaKilos: 0,
      saldoQuintales: originProd.quintalesCerrados,
      saldoKilos: originProd.kilosSueltos,
      referencia: codigo,
      motivo: `Préstamo de mercadería entregado a ${destBiz.nombre}`,
      usuarioNombre: user.nombre,
    });

    // Add to borrower
    let destProd = db.products.find(
      (p) =>
        p.negocioId === destBiz.id &&
        p.nombre.toLowerCase() === originProd.nombre.toLowerCase() &&
        p.marca.toLowerCase() === originProd.marca.toLowerCase() &&
        p.presentacionKg === originProd.presentacionKg
    );
    if (!destProd) {
      destProd = {
        ...originProd,
        id: uid('prod'),
        negocioId: destBiz.id,
        quintalesCerrados: 0,
        kilosSueltos: 0,
        permiteFraccionado: destBiz.configuracion.permitirVentaPorKilo,
      };
      db.products.push(destProd);
    }
    destProd.quintalesCerrados = round2(destProd.quintalesCerrados + qty);

    db.movements.unshift({
      id: uid('mov'),
      negocioId: destBiz.id,
      fecha: nowIso,
      productoId: destProd.id,
      productoNombre: destProd.nombre,
      marca: destProd.marca,
      presentacionKg: destProd.presentacionKg,
      tipo: 'PRESTAMO_RECIBIDO',
      deltaQuintales: qty,
      deltaKilos: 0,
      saldoQuintales: destProd.quintalesCerrados,
      saldoKilos: destProd.kilosSueltos,
      referencia: codigo,
      motivo: `Préstamo recibido de ${originBiz.nombre} (no es compra)`,
      usuarioNombre: user.nombre,
    });

    const loan = {
      id: uid('loan'),
      codigo,
      fecha: nowIso,
      negocioOrigenId: originBiz.id,
      negocioOrigenNombre: `${originBiz.nombre} (${originBiz.nombreCorto})`,
      negocioDestinoId: destBiz.id,
      negocioDestinoNombre: `${destBiz.nombre} (${destBiz.nombreCorto})`,
      productoOrigenId: originProd.id,
      productoNombre: originProd.nombre,
      marca: originProd.marca,
      presentacionKg: originProd.presentacionKg,
      cantidadPrestadaQuintales: qty,
      cantidadDevueltaQuintales: 0,
      cantidadPendienteQuintales: qty,
      estado: 'PENDIENTE' as const,
      notas: (notas || '').trim(),
      devoluciones: [],
      usuarioNombre: user.nombre,
    };

    db.loans.unshift(loan);
    logAudit(db, businessId, user.nombre, 'PRESTAMO_OTORGADO', 'Préstamo', codigo, `${qty} qq de ${originProd.nombre} a ${destBiz.nombre}`);
    saveDb(db);
    res.json({ loan });
  });

  app.post('/api/loans/:id/return', (req, res) => {
    const db = loadDb();
    const auth = resolveSession(db, req, 'prestamos_gestionar');
    if ('error' in auth) return res.status(auth.errorStatus).json({ error: auth.error });

    const { user, businessId } = auth;
    const loan = db.loans.find((l) => l.id === req.params.id);
    if (!loan) return res.status(404).json({ error: 'Préstamo no encontrado.' });
    if (loan.negocioOrigenId !== businessId && loan.negocioDestinoId !== businessId) {
      return res.status(403).json({ error: 'No pertenece a este préstamo.' });
    }
    if (loan.estado === 'DEVUELTO' || loan.estado === 'ANULADO') {
      return res.status(400).json({ error: 'Este préstamo ya está cerrado.' });
    }

    const qty = round2(Number(req.body.cantidadQuintales || 0));
    if (qty <= 0 || qty > loan.cantidadPendienteQuintales + 0.01) {
      return res.status(400).json({ error: 'Cantidad de devolución inválida o excede lo pendiente.' });
    }
    const returnQty = Math.min(qty, loan.cantidadPendienteQuintales);

    const borrowerProd = db.products.find(
      (p) =>
        p.negocioId === loan.negocioDestinoId &&
        p.nombre.toLowerCase() === loan.productoNombre.toLowerCase() &&
        p.marca.toLowerCase() === loan.marca.toLowerCase() &&
        p.presentacionKg === loan.presentacionKg
    );
    if (!borrowerProd || borrowerProd.quintalesCerrados < returnQty) {
      return res.status(400).json({
        error: `El negocio receptor (${loan.negocioDestinoNombre}) no tiene suficientes quintales cerrados para devolver.`,
      });
    }

    const lenderProd = db.products.find((p) => p.id === loan.productoOrigenId);
    const nowIso = new Date().toISOString();

    borrowerProd.quintalesCerrados = round2(borrowerProd.quintalesCerrados - returnQty);
    db.movements.unshift({
      id: uid('mov'),
      negocioId: loan.negocioDestinoId,
      fecha: nowIso,
      productoId: borrowerProd.id,
      productoNombre: borrowerProd.nombre,
      marca: borrowerProd.marca,
      presentacionKg: borrowerProd.presentacionKg,
      tipo: 'DEVOLUCION_PRESTAMO_ENVIADA',
      deltaQuintales: -returnQty,
      deltaKilos: 0,
      saldoQuintales: borrowerProd.quintalesCerrados,
      saldoKilos: borrowerProd.kilosSueltos,
      referencia: loan.codigo,
      motivo: `Devolución de préstamo a ${loan.negocioOrigenNombre}`,
      usuarioNombre: user.nombre,
    });

    if (lenderProd) {
      lenderProd.quintalesCerrados = round2(lenderProd.quintalesCerrados + returnQty);
      db.movements.unshift({
        id: uid('mov'),
        negocioId: loan.negocioOrigenId,
        fecha: nowIso,
        productoId: lenderProd.id,
        productoNombre: lenderProd.nombre,
        marca: lenderProd.marca,
        presentacionKg: lenderProd.presentacionKg,
        tipo: 'DEVOLUCION_PRESTAMO_RECIBIDA',
        deltaQuintales: returnQty,
        deltaKilos: 0,
        saldoQuintales: lenderProd.quintalesCerrados,
        saldoKilos: lenderProd.kilosSueltos,
        referencia: loan.codigo,
        motivo: `Devolución recibida de ${loan.negocioDestinoNombre}`,
        usuarioNombre: user.nombre,
      });
    }

    loan.cantidadDevueltaQuintales = round2(loan.cantidadDevueltaQuintales + returnQty);
    loan.cantidadPendienteQuintales = round2(loan.cantidadPrestadaQuintales - loan.cantidadDevueltaQuintales);
    if (loan.cantidadPendienteQuintales < 0.01) loan.cantidadPendienteQuintales = 0;
    loan.estado = loan.cantidadPendienteQuintales === 0 ? 'DEVUELTO' : 'DEVOLUCION_PARCIAL';
    loan.devoluciones.push({
      id: uid('ret'),
      fecha: nowIso,
      cantidadQuintales: returnQty,
      nota: String(req.body.nota || 'Devolución de mercadería'),
      usuarioNombre: user.nombre,
    });

    logAudit(
      db,
      businessId,
      user.nombre,
      'DEVOLUCION_PRESTAMO',
      'Préstamo',
      loan.codigo,
      `Devueltos ${returnQty} qq (pendiente: ${loan.cantidadPendienteQuintales} qq)`
    );
    saveDb(db);
    res.json({ loan });
  });

  // --- INTER-BUSINESS DEBTS & REIMBURSEMENTS ---
  app.post('/api/inter-debts/:id/pay', (req, res) => {
    const db = loadDb();
    const auth = resolveSession(db, req, 'caja_reportes');
    if ('error' in auth) return res.status(auth.errorStatus).json({ error: auth.error });

    const { user, businessId } = auth;
    const debt = db.interDebts.find((d) => d.id === req.params.id);
    if (!debt) return res.status(404).json({ error: 'Cuenta entre negocios no encontrada.' });
    if (debt.acreedorNegocioId !== businessId && debt.deudorNegocioId !== businessId) {
      return res.status(403).json({ error: 'No autorizado para esta cuenta.' });
    }

    const monto = round2(Number(req.body.monto || 0));
    if (monto <= 0 || monto > debt.saldoPendiente + 0.01) {
      return res.status(400).json({ error: 'Monto inválido o superior al saldo pendiente.' });
    }
    const applied = Math.min(monto, debt.saldoPendiente);
    const nowIso = new Date().toISOString();
    const metodo = (req.body.metodoPago || 'TRANSFERENCIA_QR') as PaymentMethod;
    const nota = String(req.body.nota || 'Pago / reembolso entre negocios');

    debt.abonos.push({
      id: uid('int_abo'),
      fecha: nowIso,
      monto: applied,
      metodoPago: metodo,
      nota,
      usuarioNombre: user.nombre,
    });
    debt.montoPagado = round2(debt.montoPagado + applied);
    debt.saldoPendiente = round2(debt.montoTotal - debt.montoPagado);
    if (debt.saldoPendiente < 0.01) debt.saldoPendiente = 0;
    debt.estado = debt.saldoPendiente === 0 ? 'PAGADO' : 'PARCIAL';

    // Mirror cash impact for both businesses
    db.cashMovements.unshift({
      id: uid('cash'),
      negocioId: debt.deudorNegocioId,
      fecha: nowIso,
      tipo: 'EGRESO',
      categoria: 'REEMBOLSO_INTERNO',
      concepto: `Pago/reembolso a ${debt.acreedorNombre} (${debt.referenciaDocumento})`,
      monto: applied,
      metodoPago: metodo,
      referencia: debt.referenciaDocumento,
      usuarioNombre: user.nombre,
    });
    db.cashMovements.unshift({
      id: uid('cash'),
      negocioId: debt.acreedorNegocioId,
      fecha: nowIso,
      tipo: 'INGRESO',
      categoria: 'REEMBOLSO_INTERNO',
      concepto: `Cobro/reembolso de ${debt.deudorNombre} (${debt.referenciaDocumento})`,
      monto: applied,
      metodoPago: metodo,
      referencia: debt.referenciaDocumento,
      usuarioNombre: user.nombre,
    });

    logAudit(
      db,
      businessId,
      user.nombre,
      'PAGO_INTER_NEGOCIO',
      'Cuenta Interna',
      debt.referenciaDocumento,
      `Pago de Bs ${applied} entre ${debt.deudorNombre} y ${debt.acreedorNombre}`
    );
    saveDb(db);
    res.json({ debt });
  });

  // --- CASH MOVEMENTS ---
  app.post('/api/cash/movement', (req, res) => {
    const db = loadDb();
    const auth = resolveSession(db, req, 'caja_reportes');
    if ('error' in auth) return res.status(auth.errorStatus).json({ error: auth.error });

    const { user, businessId } = auth;
    const { tipo, concepto, monto, metodoPago } = req.body as {
      tipo: 'INGRESO' | 'EGRESO';
      concepto: string;
      monto: number;
      metodoPago: PaymentMethod;
    };
    const m = round2(Number(monto || 0));
    if (!concepto?.trim() || m <= 0) {
      return res.status(400).json({ error: 'Concepto y monto válido son obligatorios.' });
    }

    const entry = {
      id: uid('cash'),
      negocioId: businessId,
      fecha: new Date().toISOString(),
      tipo,
      categoria: 'GASTO_OPERATIVO' as const,
      concepto: concepto.trim(),
      monto: m,
      metodoPago: metodoPago || 'EFECTIVO',
      referencia: 'CAJA-MANUAL',
      usuarioNombre: user.nombre,
    };
    db.cashMovements.unshift(entry);
    logAudit(db, businessId, user.nombre, `CAJA_${tipo}`, 'Caja', 'CAJA-MANUAL', `${concepto.trim()} · Bs ${m}`);
    saveDb(db);
    res.json({ entry });
  });

  // --- USERS & PERMISSIONS ---
  app.post('/api/users', (req, res) => {
    const db = loadDb();
    const auth = resolveSession(db, req, 'usuarios_gestionar');
    if ('error' in auth) return res.status(auth.errorStatus).json({ error: auth.error });

    const { user, businessId } = auth;
    const { nombre, cargo, email, pin, rol, permisos } = req.body as Partial<UserAccount>;
    if (!nombre?.trim() || !pin?.trim()) {
      return res.status(400).json({ error: 'Nombre y PIN son obligatorios.' });
    }

    const newUser: UserAccount = {
      id: uid('usr'),
      negocioId: businessId,
      nombre: nombre.trim(),
      cargo: (cargo || 'Colaborador').trim(),
      email: (email || '').trim(),
      pin: pin.trim(),
      rol: rol || 'VENDEDOR_CAJERO',
      activo: true,
      accesoSoloSuNegocio: true,
      permisos: permisos || ['dashboard', 'inventario_ver', 'ventas_crear', 'clientes_ver'],
    };
    db.users.push(newUser);
    logAudit(db, businessId, user.nombre, 'USUARIO_CREADO', 'Usuario', newUser.nombre, `Rol: ${newUser.rol}`);
    saveDb(db);
    res.json({ user: newUser });
  });

  app.patch('/api/users/:id', (req, res) => {
    const db = loadDb();
    const auth = resolveSession(db, req, 'usuarios_gestionar');
    if ('error' in auth) return res.status(auth.errorStatus).json({ error: auth.error });

    const { user, businessId } = auth;
    const target = db.users.find((u) => u.id === req.params.id && u.negocioId === businessId);
    if (!target) return res.status(404).json({ error: 'Usuario no encontrado en este negocio.' });

    const { permisos, rol, activo, cargo } = req.body as Partial<UserAccount>;
    if (permisos !== undefined) target.permisos = permisos;
    if (rol !== undefined) target.rol = rol;
    if (activo !== undefined) target.activo = activo;
    if (cargo !== undefined) target.cargo = cargo;

    logAudit(db, businessId, user.nombre, 'PERMISOS_ACTUALIZADOS', 'Usuario', target.nombre, `Permisos actualizados (${target.permisos.length})`);
    saveDb(db);
    res.json({ user: target });
  });

  // --- BUSINESS CONFIG, BACKUPS & IMPORT SIMULATOR ---
  app.patch('/api/business/config', (req, res) => {
    const db = loadDb();
    const auth = resolveSession(db, req, 'configuracion_respaldos');
    if ('error' in auth) return res.status(auth.errorStatus).json({ error: auth.error });

    const { user, businessId } = auth;
    const biz = db.businesses.find((b) => b.id === businessId)!;
    const { nombre, ciudad, telefono, permitirVentaPorKilo, autoAbrirQuintalEnVenta } = req.body as {
      nombre?: string;
      ciudad?: string;
      telefono?: string;
      permitirVentaPorKilo?: boolean;
      autoAbrirQuintalEnVenta?: boolean;
    };

    if (nombre) biz.nombre = nombre.trim();
    if (ciudad) biz.ciudad = ciudad.trim();
    if (telefono) biz.telefono = telefono.trim();
    if (permitirVentaPorKilo !== undefined) {
      biz.configuracion.permitirVentaPorKilo = Boolean(permitirVentaPorKilo);
    }
    if (autoAbrirQuintalEnVenta !== undefined) {
      biz.configuracion.autoAbrirQuintalEnVenta = Boolean(autoAbrirQuintalEnVenta);
    }

    logAudit(db, businessId, user.nombre, 'CONFIG_NEGOCIO', 'Configuración', biz.id, `Venta por kilo: ${biz.configuracion.permitirVentaPorKilo ? 'Activada' : 'Desactivada'}`);
    saveDb(db);
    res.json({ business: biz });
  });

  app.post('/api/backups/create', (req, res) => {
    const db = loadDb();
    const auth = resolveSession(db, req, 'configuracion_respaldos');
    if ('error' in auth) return res.status(auth.errorStatus).json({ error: auth.error });

    const { user, businessId } = auth;
    const snapshot = createBackupSnapshot(db, 'MANUAL', `Respaldo manual generado por ${user.nombre}`);
    logAudit(db, businessId, user.nombre, 'RESPALDO_MANUAL', 'Sistema', snapshot.archivo, 'Copia de seguridad manual creada');
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
    res.json({ snapshot, backups: db.backups });
  });

  app.get('/api/backups/download', (req, res) => {
    const db = loadDb();
    const auth = resolveSession(db, req, 'configuracion_respaldos');
    if ('error' in auth) return res.status(auth.errorStatus).json({ error: auth.error });

    res.setHeader('Content-Disposition', `attachment; filename="respaldo_abarrotes_${new Date().toISOString().slice(0, 10)}.json"`);
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(db, null, 2));
  });

  app.post('/api/backups/reset-demo', (req, res) => {
    const db = loadDb();
    const auth = resolveSession(db, req, 'configuracion_respaldos');
    if ('error' in auth) return res.status(auth.errorStatus).json({ error: auth.error });

    const fresh = createInitialDatabase();
    createBackupSnapshot(fresh, 'MANUAL', 'Restauración de datos iniciales de demostración');
    fs.writeFileSync(DB_FILE, JSON.stringify(fresh, null, 2), 'utf-8');
    res.json({ ok: true });
  });

  app.post('/api/imports/simulate', (req, res) => {
    const db = loadDb();
    const auth = resolveSession(db, req, 'importaciones_ver');
    if ('error' in auth) return res.status(auth.errorStatus).json({ error: auth.error });

    const { user, businessId } = auth;
    const {
      proveedorArgentina,
      productoNombre,
      cantidadQuintales,
      precioFobUsd,
      tipoCambioBs,
      fleteInternacionalBs,
      aduanaDespachanteBs,
      estibajeDescargaBs,
      otrosGastosBs,
    } = req.body as Record<string, string | number>;

    const qty = Math.max(1, Number(cantidadQuintales || 1));
    const fobBs = qty * Number(precioFobUsd || 0) * Number(tipoCambioBs || 6.96);
    const total = round2(
      fobBs +
        Number(fleteInternacionalBs || 0) +
        Number(aduanaDespachanteBs || 0) +
        Number(estibajeDescargaBs || 0) +
        Number(otrosGastosBs || 0)
    );
    const costoPorQuintalBs = round2(total / qty);

    const sim = {
      id: uid('imp'),
      negocioId: businessId,
      fecha: new Date().toISOString(),
      proveedorArgentina: String(proveedorArgentina || 'Proveedor Argentina'),
      productoNombre: String(productoNombre || 'Harina 000'),
      cantidadQuintales: qty,
      precioFobUsd: Number(precioFobUsd || 0),
      tipoCambioBs: Number(tipoCambioBs || 6.96),
      fleteInternacionalBs: Number(fleteInternacionalBs || 0),
      aduanaDespachanteBs: Number(aduanaDespachanteBs || 0),
      estibajeDescargaBs: Number(estibajeDescargaBs || 0),
      otrosGastosBs: Number(otrosGastosBs || 0),
      costoTotalBs: total,
      costoPorQuintalBs,
    };

    db.importSimulations.unshift(sim);
    logAudit(db, businessId, user.nombre, 'SIMULACION_IMPORTACION', 'Importaciones', sim.id, `${sim.productoNombre}: Bs ${costoPorQuintalBs}/qq`);
    saveDb(db);
    res.json({ simulation: sim });
  });

  return app;
}

async function startServer() {
  const app = createApiApp();

  // Vite Dev Middleware or Static Production Serving
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${port}`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}
