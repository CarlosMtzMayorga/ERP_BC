/**
 * Módulo Administración del Negocio ERP BC Refaccionarias
 * Resumen financiero, ventas vs compras a proveedores, cobranza y flujo en cajas.
 */

let chartFormasCobro = null;

async function cargarModuloAdministracion() {
    const fIni = document.getElementById('fechaIniAdminNegocio');
    const fFin = document.getElementById('fechaFinAdminNegocio');

    // Inicializar fechas por defecto si están vacías (mes actual)
    if (fIni && !fIni.value) {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        fIni.value = `${y}-${m}-01`;
    }
    if (fFin && !fFin.value) {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dia = String(d.getDate()).padStart(2, '0');
        fFin.value = `${y}-${m}-${dia}`;
    }

    await consultarResumenNegocio();
}

async function consultarResumenNegocio() {
    const fIni = document.getElementById('fechaIniAdminNegocio');
    const fFin = document.getElementById('fechaFinAdminNegocio');

    const fechaIni = fIni ? fIni.value : '';
    const fechaFin = fFin ? fFin.value : '';

    const query = new URLSearchParams();
    if (fechaIni) query.append('fecha_inicio', fechaIni);
    if (fechaFin) query.append('fecha_final', fechaFin);

    try {
        const res = await fetch(`/api/admin/negocio/resumen?${query.toString()}`);
        const data = await res.json();

        if (data.success) {
            renderizarKpisNegocio(data.kpis);
            renderizarGraficoFormasCobro(data.formas_cobro);
            renderizarTablaFormasCobro(data.formas_cobro);
            renderizarTablaComprasNegocio(data.ultimas_compras);
        } else {
            console.error("Error al obtener resumen de negocio:", data.error);
        }
    } catch (e) {
        console.error("Error de conexión al cargar administración del negocio:", e);
    }
}

function renderizarKpisNegocio(k) {
    if (!k) return;

    const elVentas = document.getElementById('kpiAdminVentasTotales');
    const elCompras = document.getElementById('kpiAdminComprasTotales');
    const elCobrado = document.getElementById('kpiAdminCobrado');
    const elMargen = document.getElementById('kpiAdminMargen');
    const elTickets = document.getElementById('kpiAdminTickets');

    if (elVentas) elVentas.textContent = formatearMoneda(k.ventas_totales);
    if (elCompras) elCompras.textContent = formatearMoneda(k.compras_totales);
    if (elCobrado) elCobrado.textContent = formatearMoneda(k.total_cobrado);
    if (elTickets) elTickets.textContent = `${formatearNumero(k.tickets_totales)} tickets (Prom. ${formatearMoneda(k.ticket_promedio)})`;
    if (elMargen) {
        elMargen.textContent = formatearMoneda(k.margen_bruto);
        elMargen.className = k.margen_bruto >= 0 ? "text-2xl font-black text-theme-deep tracking-tight" : "text-2xl font-black text-rose-600 tracking-tight";
    }
}

function renderizarGraficoFormasCobro(items) {
    const canvas = document.getElementById('chartFormasCobroCanvas');
    if (!canvas || typeof Chart === 'undefined') return;

    if (chartFormasCobro) {
        chartFormasCobro.destroy();
    }

    const labels = (items || []).map(i => i.forma);
    const datos = (items || []).map(i => i.total);

    const ctx = canvas.getContext('2d');
    let paleta = null;
    if (typeof obtenerPaletaTema === 'function') paleta = obtenerPaletaTema();
    const prim = paleta ? paleta.primary : '#dc2626';
    const gris = paleta ? paleta.gris : '#94a3b8';
    const n = Math.max((items || []).length, 1);
    const fondo = [];
    for (let i = 0; i < n; i++) {
        const t = n > 1 ? i / (n - 1) : 0;
        const [r, g, b] = (prim.replace('#', '').length === 3 ? prim.replace('#', '').split('').map(c => c + c).join('') : prim.replace('#', ''));
        const rn = parseInt(r, 16), gn = parseInt(g, 16), bn = parseInt(b, 16);
        const c = v => Math.round(v + (255 - v) * t);
        fondo.push(`rgb(${c(rn)}, ${c(gn)}, ${c(bn)})`);
    }
    fondo[n - 1] = gris;
    chartFormasCobro = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: datos,
                backgroundColor: fondo,
                borderWidth: 2,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        boxWidth: 12,
                        font: { size: 11, weight: 'bold' },
                        color: '#334155'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return ` ${context.label}: ${formatearMoneda(context.parsed)}`;
                        }
                    }
                }
            },
            cutout: '60%'
        }
    });
}

function renderizarTablaFormasCobro(items) {
    const tbody = document.getElementById('tbodyFormasCobroAdmin');
    if (!tbody) return;

    if (!items || items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="py-6 text-center text-slate-400">Sin datos de cobro en el período.</td></tr>`;
        return;
    }

    tbody.innerHTML = items.map(it => `
        <tr class="hover:bg-slate-50 transition border-b border-slate-100 last:border-0 text-xs">
            <td class="py-2.5 px-3 font-bold text-slate-800 flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full bg-slate-700"></span>
                ${it.forma}
            </td>
            <td class="py-2.5 px-3 text-right font-semibold text-slate-600">
                ${formatearNumero(it.operaciones)} ops
            </td>
            <td class="py-2.5 px-3 text-right font-black text-slate-900">
                ${formatearMoneda(it.total)}
            </td>
            <td class="py-2.5 px-3 text-right font-bold text-slate-500">
                ${it.porcentaje}%
            </td>
        </tr>
    `).join('');
}

function renderizarTablaComprasNegocio(items) {
    const tbody = document.getElementById('tbodyComprasAdmin');
    if (!tbody) return;

    if (!items || items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="py-6 text-center text-slate-400">Sin compras registradas.</td></tr>`;
        return;
    }

    tbody.innerHTML = items.map(c => `
        <tr class="hover:bg-slate-50 transition border-b border-slate-100 last:border-0 text-xs">
            <td class="py-2.5 px-3 font-mono font-bold text-slate-800">
                ${c.folio}
            </td>
            <td class="py-2.5 px-3 text-slate-600">
                ${c.fecha}
            </td>
            <td class="py-2.5 px-3 font-semibold text-slate-800 truncate max-w-xs" title="${c.proveedor}">
                ${c.proveedor}
            </td>
            <td class="py-2.5 px-3 text-right font-black text-slate-900">
                ${formatearMoneda(c.total)}
            </td>
        </tr>
    `).join('');
}
