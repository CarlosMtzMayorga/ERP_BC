/**
 * Módulo Dashboard Ejecutivo ERP BC Refaccionarias
 * Visualización analítica de ventas, sucursales, existencias en almacén y mejores artículos.
 */

let chartVentasSucursales = null;
let chartAlmacenesStock = null;
let dashboardDataCache = null;

function formatearMoneda(val) {
    return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
        minimumFractionDigits: 2
    }).format(val || 0);
}

function formatearNumero(val) {
    return new Intl.NumberFormat('es-MX').format(Math.round(val || 0));
}

function paletaDeMarca() {
    if (typeof obtenerPaletaTema === 'function') return obtenerPaletaTema();
    return { primary: '#dc2626', hover: '#b91c1c', text: '#b91c1c', light: '#fef2f2', gris: '#94a3b8' };
}

function hexToRgb(hex) {
    hex = (hex || '#dc2626').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mezclarBlanco(hex, t) {
    const [r, g, b] = hexToRgb(hex);
    const c = v => Math.round(v + (255 - v) * t);
    return `rgb(${c(r)}, ${c(g)}, ${c(b)})`;
}

function escalaDeMarca(base, pasos) {
    const n = Math.max(pasos || 8, 1);
    const escala = [];
    for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0 : 0.85 * (i / (n - 1));
        escala.push(mezclarBlanco(base, t));
    }
    return escala;
}

async function cargarDashboard(periodo = 'mes_actual') {
    const loader = document.getElementById('dashboardLoader');
    const content = document.getElementById('dashboardContent');
    const btnRefrescar = document.getElementById('btnRefrescarDashboard');

    if (loader) loader.classList.remove('hidden');
    if (content) content.classList.add('opacity-50');
    if (btnRefrescar) btnRefrescar.classList.add('animate-spin');

    try {
        const res = await fetch(`/api/dashboard/resumen?periodo=${encodeURIComponent(periodo)}`);
        const data = await res.json();

        if (!data.success) {
            throw new Error(data.error || "No se pudo cargar la información del dashboard");
        }

        dashboardDataCache = data;
        renderizarKPIs(data.kpis);
        renderizarGraficoVentas(data.ventas_sucursales);
        renderizarGraficoAlmacenes(data.almacenes_stock);
        renderizarTablaTopArticulos(data.top_articulos);
        renderizarTablaSucursales(data.ventas_sucursales);

        const badgeActualizado = document.getElementById('badgeUltimaActualizacion');
        if (badgeActualizado) {
            const ahora = new Date();
            badgeActualizado.textContent = `Actualizado: ${ahora.toLocaleTimeString()}`;
        }

    } catch (err) {
        console.error("Error al cargar dashboard:", err);
        if (typeof mostrarAlerta === 'function') {
            mostrarAlerta('danger', `Error al cargar indicadores: ${err.message}`, 4000);
        }
    } finally {
        if (loader) loader.classList.add('hidden');
        if (content) content.classList.remove('opacity-50');
        if (btnRefrescar) btnRefrescar.classList.remove('animate-spin');
    }
}

function renderizarKPIs(kpis) {
    if (!kpis) return;

    // 1. Total Venta
    const elVenta = document.getElementById('kpiTotalVenta');
    const elTickets = document.getElementById('kpiTotalTickets');
    if (elVenta) elVenta.textContent = formatearMoneda(kpis.total_venta);
    if (elTickets) elTickets.textContent = `${formatearNumero(kpis.total_tickets)} tickets (Prom. ${formatearMoneda(kpis.ticket_promedio)})`;

    // 2. Inventario Total
    const elStock = document.getElementById('kpiTotalStock');
    const elAlmacenes = document.getElementById('kpiTotalAlmacenes');
    if (elStock) elStock.textContent = `${formatearNumero(kpis.total_stock_piezas)} pzas`;
    if (elAlmacenes) elAlmacenes.textContent = `${kpis.sucursales_activas || 0} sucursales activas del Grupo`;

    // 3. Artículo Estrella
    const est = kpis.articulo_estrella || {};
    const elArtClave = document.getElementById('kpiArticuloClave');
    const elArtNombre = document.getElementById('kpiArticuloNombre');
    const elArtVenta = document.getElementById('kpiArticuloVenta');
    if (elArtClave) elArtClave.textContent = est.clave || "N/D";
    if (elArtNombre) elArtNombre.textContent = est.nombre || "Sin ventas";
    if (elArtVenta) elArtVenta.textContent = `${formatearNumero(est.piezas)} pzas (${formatearMoneda(est.importe)})`;

    // 4. Sucursal Líder
    const lid = kpis.sucursal_lider || {};
    const elSucNombre = document.getElementById('kpiSucursalLiderNombre');
    const elSucMonto = document.getElementById('kpiSucursalLiderMonto');
    if (elSucNombre) elSucNombre.textContent = lid.nombre || "N/D";
    if (elSucMonto) elSucMonto.textContent = formatearMoneda(lid.total);

    // 5. Mejor Cliente
    const cli = kpis.cliente_estrella || {};
    const elCliNombre = document.getElementById('kpiClienteNombre');
    const elCliVenta = document.getElementById('kpiClienteVenta');
    const elCliTickets = document.getElementById('kpiClienteTickets');
    if (elCliNombre) {
        elCliNombre.textContent = cli.nombre || "N/D";
        elCliNombre.title = cli.nombre || "";
    }
    if (elCliVenta) elCliVenta.textContent = formatearMoneda(cli.total);
    if (elCliTickets) elCliTickets.textContent = `${formatearNumero(cli.tickets)} tickets`;
}

function renderizarGraficoVentas(sucursales) {
    const canvas = document.getElementById('chartVentasCanvas');
    if (!canvas || typeof Chart === 'undefined') return;

    if (chartVentasSucursales) {
        chartVentasSucursales.destroy();
    }

    const labels = (sucursales || []).map(s => s.nombre.replace('Sucursal ', ''));
    const datos = (sucursales || []).map(s => s.total_venta);

    const ctx = canvas.getContext('2d');
    const paleta = paletaDeMarca();
    const maxVenta = Math.max(0, ...datos);
    const coloresBarras = datos.map(v => mezclarBlanco(paleta.primary, maxVenta > 0 ? 0.85 * (1 - v / maxVenta) : 0.85));
    chartVentasSucursales = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Ventas Netas ($)',
                data: datos,
                backgroundColor: coloresBarras,
                borderRadius: 8,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y', // Horizontal para mejor lectura de nombres de sucursal
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return ' Venta: ' + formatearMoneda(context.parsed.x);
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: '#f1f5f9' },
                    ticks: {
                        callback: function(value) {
                            return '$' + (value >= 1000000 ? (value / 1000000).toFixed(1) + 'M' : (value / 1000).toFixed(0) + 'k');
                        },
                        font: { size: 10, weight: 'bold' }
                    }
                },
                y: {
                    grid: { display: false },
                    ticks: { font: { size: 11, weight: '600' }, color: '#334155' }
                }
            }
        }
    });
}

function renderizarGraficoAlmacenes(almacenes) {
    const canvas = document.getElementById('chartAlmacenesCanvas');
    if (!canvas || typeof Chart === 'undefined') return;

    if (chartAlmacenesStock) {
        chartAlmacenesStock.destroy();
    }

    // Top 7 almacenes + "Otros"
    const topAlmacenes = (almacenes || []).slice(0, 7);
    const otros = (almacenes || []).slice(7);
    const sumaOtros = otros.reduce((acc, curr) => acc + curr.existencia, 0);

    const labels = topAlmacenes.map(a => a.nombre.replace('Sucursal ', ''));
    const datos = topAlmacenes.map(a => a.existencia);

    if (sumaOtros > 0) {
        labels.push('Otras Sucursales');
        datos.push(sumaOtros);
    }

    const ctx = canvas.getContext('2d');
    const paleta = paletaDeMarca();
    const escala = escalaDeMarca(paleta.primary, 7);
    const fondoAlmacenes = escala.concat([paleta.gris]);
    chartAlmacenesStock = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: datos,
                backgroundColor: fondoAlmacenes,
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
                        color: '#475569'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const val = context.parsed;
                            return ` ${context.label}: ${formatearNumero(val)} pzas`;
                        }
                    }
                }
            },
            cutout: '65%'
        }
    });
}

function renderizarTablaTopArticulos(articulos) {
    const tbody = document.getElementById('tbodyTopArticulos');
    if (!tbody) return;

    if (!articulos || articulos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-slate-400 font-medium">No hay datos de venta en este período.</td></tr>`;
        return;
    }

    const medallas = ['🥇', '🥈', '🥉'];

    tbody.innerHTML = articulos.map((item, idx) => {
        const medalla = idx < 3 ? `<span class="text-base">${medallas[idx]}</span>` : `<span class="text-xs font-bold text-slate-400 w-5 text-center">#${idx + 1}</span>`;
        return `
            <tr class="hover:bg-slate-50/80 transition-colors border-b border-slate-100 last:border-0">
                <td class="py-3 px-3 text-center">
                    ${medalla}
                </td>
                <td class="py-3 px-3">
                    <span class="font-mono font-black text-slate-800 text-xs bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        ${item.clave}
                    </span>
                </td>
                <td class="py-3 px-3">
                    <div class="font-bold text-slate-800 text-xs truncate max-w-xs md:max-w-md" title="${item.nombre}">
                        ${item.nombre}
                    </div>
                </td>
                <td class="py-3 px-3 text-right">
                    <span class="inline-flex items-center gap-1 font-black text-xs text-theme-deep bg-theme-light px-2 py-0.5 rounded-full border border-theme-soft">
                        ${formatearNumero(item.piezas)} pzas
                    </span>
                </td>
                <td class="py-3 px-3 text-right font-black text-slate-900 text-xs">
                    ${formatearMoneda(item.importe)}
                </td>
            </tr>
        `;
    }).join('');
}

function renderizarTablaSucursales(sucursales) {
    const tbody = document.getElementById('tbodyResumenSucursales');
    if (!tbody) return;

    if (!sucursales || sucursales.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-slate-400 font-medium">No se encontraron sucursales activas.</td></tr>`;
        return;
    }

    tbody.innerHTML = sucursales.map((suc, idx) => {
        return `
            <tr class="hover:bg-slate-50 transition border-b border-slate-100 last:border-0">
                <td class="py-2.5 px-3 font-bold text-xs text-slate-800 flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full ${idx === 0 ? 'bg-theme-primary ring-theme-soft' : 'bg-slate-300'}"></span>
                    ${suc.nombre}
                </td>
                <td class="py-2.5 px-3 text-right text-xs font-semibold text-slate-600">
                    ${formatearNumero(suc.tickets)}
                </td>
                <td class="py-2.5 px-3 text-right text-xs font-black text-slate-900">
                    ${formatearMoneda(suc.total_venta)}
                </td>
                <td class="py-2.5 px-3 text-right text-xs font-bold text-slate-500">
                    ${suc.porcentaje}%
                </td>
                <td class="py-2.5 px-3">
                    <div class="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div class="h-2 rounded-full ${idx === 0 ? 'bg-theme-primary' : 'bg-slate-400'}" style="width: ${Math.min(100, suc.porcentaje * 3)}%"></div>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Inicialización de eventos al cargar documento
document.addEventListener('DOMContentLoaded', () => {
    const selPeriodo = document.getElementById('selectPeriodoDashboard');
    if (selPeriodo) {
        selPeriodo.addEventListener('change', (e) => {
            cargarDashboard(e.target.value);
        });
    }

    const btnRefrescar = document.getElementById('btnRefrescarDashboard');
    if (btnRefrescar) {
        btnRefrescar.addEventListener('click', () => {
            const p = selPeriodo ? selPeriodo.value : 'mes_actual';
            cargarDashboard(p);
        });
    }
});
