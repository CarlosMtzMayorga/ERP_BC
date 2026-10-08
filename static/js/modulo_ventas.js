/**
 * Módulo Ventas ERP BC Refaccionarias
 * Consulta detallada de ventas, tickets de punto de venta y partidas vendidas por sucursal.
 */

let ventasDataCache = null;
let ventasSucursalesCache = null;
let ventasSucursalesCacheTs = 0;
const VENTAS_SUCURSALES_TTL = 300000; // 5 minutos

// Helpers seguros para formateo de números y moneda
function formatearMoneda(val) {
    if (val === null || val === undefined || isNaN(val)) return '$0.00';
    return '$' + Number(val).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatearNumero(val) {
    if (val === null || val === undefined || isNaN(val)) return '0';
    return Number(val).toLocaleString('es-MX');
}

async function cargarModuloVentas() {
    // 1. Inicializar fechas por defecto a HOY si están vacías
    const hoy = new Date().toISOString().split('T')[0];
    const fIni = document.getElementById('fechaIniVentas');
    const fFin = document.getElementById('fechaFinVentas');
    if (fIni && !fIni.value) fIni.value = hoy;
    if (fFin && !fFin.value) fFin.value = hoy;

    // 2. Cargar listado de sucursales en el selector
    await cargarSelectAlmacenesVentas();

    // 3. Ejecutar consultas con los filtros seleccionados (en paralelo, son independientes)
    await Promise.allSettled([consultarResumenVentas(), buscarTicketsVentas()]);
}

async function cargarSelectAlmacenesVentas() {
    const sel = document.getElementById('selectSucursalVentas');
    if (!sel) return;

    try {
        let sucursales = null;
        const ahora = Date.now();
        if (ventasSucursalesCache && (ahora - ventasSucursalesCacheTs) < VENTAS_SUCURSALES_TTL) {
            sucursales = ventasSucursalesCache;
        } else {
            // Intentar primero desde el endpoint de sucursales de ventas
            try {
                const res = await fetch('/api/ventas/sucursales');
                if (res.ok) {
                    const data = await res.json();
                    if (data.success && (data.sucursales || data.almacenes)) {
                        sucursales = data.sucursales || data.almacenes;
                    }
                }
            } catch (e1) {
                console.warn("Aviso: /api/ventas/sucursales falló, reintentando catálogo:", e1);
            }

            // Si no obtuvo resultados, fallback a /api/catalogos/sucursales-vendedores
            if (!sucursales || sucursales.length === 0) {
                try {
                    const resCat = await fetch('/api/catalogos/sucursales-vendedores');
                    if (resCat.ok) {
                        const dataCat = await resCat.json();
                        if (dataCat.success && dataCat.sucursales) {
                            sucursales = dataCat.sucursales;
                        }
                    }
                } catch (e2) {
                    console.warn("Aviso: /api/catalogos/sucursales-vendedores falló:", e2);
                }
            }

            if (sucursales && sucursales.length > 0) {
                ventasSucursalesCache = sucursales;
                ventasSucursalesCacheTs = Date.now();
            }
        }

        const valorActual = sel.value;
        const u = (typeof currentUser !== 'undefined') ? currentUser : null;
        const esAdmin = u && (u.rol === 'ADMIN' || (Array.isArray(u.permisos) && u.permisos.includes('*')));

        let html = '<option value="">-- Todas las Sucursales (Consolidado) --</option>';
        if (sucursales && sucursales.length > 0) {
            sucursales.forEach(s => {
                html += `<option value="${s.id}">${s.nombre}</option>`;
            });
        }
        sel.innerHTML = html;

        // Mantener selección previa o aplicar la sucursal del usuario si no es admin
        if (valorActual) {
            sel.value = valorActual;
        } else if (u && u.sucursal_id && !esAdmin) {
            sel.value = String(u.sucursal_id);
        }
    } catch (e) {
        console.error("Error al cargar sucursales para ventas:", e);
        sel.innerHTML = '<option value="">-- Todas las Sucursales (Consolidado) --</option>';
    }
}

async function consultarResumenVentas() {
    const selAlm = document.getElementById('selectSucursalVentas');
    const fIni = document.getElementById('fechaIniVentas');
    const fFin = document.getElementById('fechaFinVentas');

    const almId = selAlm ? selAlm.value : '';
    const fechaIni = fIni ? fIni.value : '';
    const fechaFin = fFin ? fFin.value : '';

    try {
        const query = new URLSearchParams();
        if (almId) query.append('almacen_id', almId);
        if (fechaIni) query.append('fecha_inicio', fechaIni);
        if (fechaFin) query.append('fecha_final', fechaFin);

        const res = await fetch(`/api/ventas/resumen-sucursal?${query.toString()}`);
        const data = await res.json();

        if (data.success) {
            const r = data.resumen || {};
            const elTot = document.getElementById('ventasResumenTotal');
            const elTcks = document.getElementById('ventasResumenTickets');
            const elProm = document.getElementById('ventasResumenPromedio');

            if (elTot) elTot.textContent = formatearMoneda(r.total_venta || 0);
            if (elTcks) elTcks.textContent = formatearNumero(r.tickets || 0);
            if (elProm) elProm.textContent = formatearMoneda(r.ticket_promedio || 0);

            renderizarTopArticulosVentas(data.top_articulos);
        }
    } catch (e) {
        console.error("Error al consultar resumen ventas:", e);
    }
}

function renderizarTopArticulosVentas(items) {
    const tbody = document.getElementById('tbodyTopVentasSucursal');
    if (!tbody) return;

    if (!items || items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="py-6 text-center text-slate-400">Sin ventas en el período.</td></tr>`;
        return;
    }

    tbody.innerHTML = items.map((it) => `
        <tr class="hover:bg-slate-50 transition border-b border-slate-100 last:border-0 text-xs">
            <td class="py-2.5 px-3 font-mono font-bold text-slate-700">${it.clave}</td>
            <td class="py-2.5 px-3 font-semibold text-slate-800 truncate max-w-xs" title="${it.nombre}">${it.nombre}</td>
            <td class="py-2.5 px-3 text-right font-black text-emerald-700">${formatearNumero(it.piezas)} pzas</td>
            <td class="py-2.5 px-3 text-right font-black text-slate-900">${formatearMoneda(it.importe)}</td>
        </tr>
    `).join('');
}

async function buscarTicketsVentas() {
    const selAlm = document.getElementById('selectSucursalVentas');
    const fIni = document.getElementById('fechaIniVentas');
    const fFin = document.getElementById('fechaFinVentas');
    const txtFolio = document.getElementById('buscarFolioTicket');

    const almId = selAlm ? selAlm.value : '';
    const fechaIni = fIni ? fIni.value : '';
    const fechaFin = fFin ? fFin.value : '';
    const folio = txtFolio ? txtFolio.value.trim() : '';

    const query = new URLSearchParams();
    if (almId) query.append('almacen_id', almId);
    if (fechaIni) query.append('fecha_inicio', fechaIni);
    if (fechaFin) query.append('fecha_final', fechaFin);
    if (folio) query.append('folio', folio);

    const tbody = document.getElementById('tbodyTicketsVenta');
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-slate-400">Cargando tickets...</td></tr>`;
    }

    try {
        const res = await fetch(`/api/ventas/tickets?${query.toString()}`);
        const data = await res.json();

        if (data.success && tbody) {
            if (!data.tickets || data.tickets.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-slate-400">No se encontraron tickets con los filtros seleccionados.</td></tr>`;
                return;
            }

            tbody.innerHTML = data.tickets.map(t => {
                const esCancelado = t.cancelado || t.estatus === 'C';
                const badgeTipo = esCancelado 
                    ? '<span class="px-2 py-0.5 rounded text-[10px] font-black bg-rose-100 text-rose-700">Cancelado</span>'
                    : (t.tipo === 'Factura'
                        ? '<span class="px-2 py-0.5 rounded text-[10px] font-black bg-purple-100 text-purple-700">Factura</span>'
                        : '<span class="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-700">Ticket</span>');

                return `
                <tr class="hover:bg-slate-50/80 transition border-b border-slate-100 text-xs ${esCancelado ? 'opacity-60 bg-rose-50/20' : ''}">
                    <td class="py-3 px-3 font-mono font-bold text-red-600">
                        ${t.folio}
                    </td>
                    <td class="py-3 px-3 text-slate-600">
                        ${t.fecha} ${t.hora}
                    </td>
                    <td class="py-3 px-3 font-semibold text-slate-800">
                        ${t.sucursal}
                    </td>
                    <td class="py-3 px-3 text-center">
                        ${badgeTipo}
                    </td>
                    <td class="py-3 px-3 text-right font-black ${esCancelado ? 'line-through text-slate-400' : 'text-slate-900'} text-xs">
                        ${formatearMoneda(t.total)}
                    </td>
                    <td class="py-3 px-3 text-center">
                        <button type="button" onclick="verDetalleTicket(${t.id}, '${t.folio}')" class="px-2.5 py-1 text-[11px] font-bold text-blue-600 hover:text-white hover:bg-blue-600 rounded-lg border border-blue-200 transition cursor-pointer">
                            Ver Partidas
                        </button>
                    </td>
                </tr>
            `}).join('');
        }
    } catch (e) {
        console.error("Error al buscar tickets:", e);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-red-500 font-bold">Error al cargar tickets. Intente nuevamente.</td></tr>`;
        }
    }
}

async function verDetalleTicket(doctoId, folio) {
    const modal = document.getElementById('modalDetalleTicket');
    const titulo = document.getElementById('modalDetalleTicketTitulo');
    const tbody = document.getElementById('tbodyPartidasTicket');

    if (titulo) titulo.textContent = `Detalle del Ticket / Factura: ${folio}`;
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-slate-400">Cargando partidas...</td></tr>`;
    if (modal) modal.classList.remove('hidden');

    try {
        const res = await fetch(`/api/ventas/detalle-ticket/${doctoId}`);
        const data = await res.json();

        if (data.success && tbody) {
            let totalAcum = 0;
            tbody.innerHTML = data.partidas.map((p, idx) => {
                totalAcum += p.total;
                return `
                    <tr class="hover:bg-slate-50 border-b border-slate-100 text-xs">
                        <td class="py-2.5 px-3 text-slate-400 text-center font-bold">#${idx + 1}</td>
                        <td class="py-2.5 px-3 font-mono font-bold text-slate-800">${p.clave}</td>
                        <td class="py-2.5 px-3 font-semibold text-slate-800">${p.articulo}</td>
                        <td class="py-2.5 px-3 text-right font-bold text-slate-700">${p.unidades}</td>
                        <td class="py-2.5 px-3 text-right font-semibold text-slate-600">${formatearMoneda(p.precio_unitario)}</td>
                        <td class="py-2.5 px-3 text-right font-black text-slate-900">${formatearMoneda(p.total)}</td>
                    </tr>
                `;
            }).join('');

            const elTotal = document.getElementById('modalDetalleTicketTotal');
            if (elTotal) elTotal.textContent = formatearMoneda(totalAcum);
        }
    } catch (e) {
        console.error("Error al ver detalle ticket:", e);
    }
}

function cerrarModalDetalleTicket() {
    const modal = document.getElementById('modalDetalleTicket');
    if (modal) modal.classList.add('hidden');
}
