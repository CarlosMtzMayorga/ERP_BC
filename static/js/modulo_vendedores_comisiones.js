// ================= MÓDULO VENTAS: CONTROL DE VENDEDORES Y COMISIONES =================

let vendedoresDataCache = [];
let sucursalesVendedoresCache = [];
let resumenKpisVendedores = {};
let filtroPeriodoVendedores = 'quincena_actual';
let filtroSucursalVendedores = '';
let filtroBusquedaVendedores = '';
let incluirOcultosVendedores = false;
let ordenColumnaVendedores = 'total_neto';
let ordenDireccionVendedores = 'desc';

// Vendedor seleccionado para ver detalle de tickets
let vendedorDetalleSeleccionado = null;
let ticketsVendedorCache = [];

async function inicializarModuloVendedoresComisiones() {
    const selPeriodo = document.getElementById('selPeriodoVendedores');
    if (selPeriodo) {
        filtroPeriodoVendedores = selPeriodo.value || 'quincena_actual';
    }
    actualizarVisibilidadFechasPersonalizadas();
    await cargarResumenComisionesVendedores();
}

function actualizarVisibilidadFechasPersonalizadas() {
    const selPeriodo = document.getElementById('selPeriodoVendedores');
    const boxFechas = document.getElementById('boxFechasPersonalizadasVendedores');
    if (!selPeriodo || !boxFechas) return;

    if (selPeriodo.value === 'rango_fechas') {
        boxFechas.classList.remove('hidden');
    } else {
        boxFechas.classList.add('hidden');
    }
}

async function cargarResumenComisionesVendedores() {
    const tbody = document.getElementById('tablaVendedoresBody');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="p-10 text-center text-slate-400 italic">
                    <div class="flex flex-col items-center gap-2">
                        <div class="w-7 h-7 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                        <span class="text-xs font-bold text-slate-600">Calculando ventas y comisiones desde Microsip...</span>
                    </div>
                </td>
            </tr>
        `;
    }

    const selPeriodo = document.getElementById('selPeriodoVendedores');
    const periodo = selPeriodo ? selPeriodo.value : filtroPeriodoVendedores;
    const inpIni = document.getElementById('fechaIniVendedores');
    const inpFin = document.getElementById('fechaFinVendedores');
    const selSuc = document.getElementById('selSucursalVendedores');
    const chkOcultos = document.getElementById('chkIncluirOcultosVendedores');

    let url = `/api/vendedores/resumen-comisiones?periodo=${encodeURIComponent(periodo)}`;
    if (periodo === 'rango_fechas' && inpIni && inpFin && inpIni.value && inpFin.value) {
        url += `&fecha_inicio=${inpIni.value}&fecha_fin=${inpFin.value}`;
    }
    if (selSuc && selSuc.value) {
        url += `&sucursal_id=${encodeURIComponent(selSuc.value)}`;
    }
    if (chkOcultos && chkOcultos.checked) {
        url += `&incluir_ocultos=1`;
    }

    try {
        const res = await fetch(url);
        const data = await res.json();

        if (!data.success) {
            throw new Error(data.error || 'Error al obtener datos de comisiones.');
        }

        vendedoresDataCache = data.vendedores || [];
        resumenKpisVendedores = data.kpis || {};
        sucursalesVendedoresCache = data.sucursales || [];

        // Actualizar catálogo de sucursales en el selector si está vacío
        if (selSuc && selSuc.options.length <= 1 && sucursalesVendedoresCache.length > 0) {
            sucursalesVendedoresCache.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.id;
                opt.textContent = s.nombre;
                selSuc.appendChild(opt);
            });
        }

        // Actualizar indicador de periodo en pantalla
        const lblPeriodo = document.getElementById('lblPeriodoActivoVendedores');
        if (lblPeriodo) {
            lblPeriodo.textContent = data.periodo_texto || periodo;
        }

        renderizarKpisVendedores(resumenKpisVendedores);
        filtrarYRenderizarVendedores();

    } catch (err) {
        console.error("Error al cargar comisiones de vendedores:", err);
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="10" class="p-8 text-center text-rose-500 font-bold text-xs">
                        ⚠️ No se pudo cargar el reporte de vendedores: ${err.message}
                    </td>
                </tr>
            `;
        }
    }
}

function renderizarKpisVendedores(kpis) {
    const elNeto = document.getElementById('kpiVentasNetasVendedores');
    const elComisiones = document.getElementById('kpiComisionesVendedores');
    const elTickets = document.getElementById('kpiTicketsVendedores');
    const elPromedio = document.getElementById('kpiTicketPromedioVendedores');
    const elTotalVend = document.getElementById('kpiTotalVendedoresActivos');

    const fmtMoney = (val) => '$' + (Number(val) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    if (elNeto) elNeto.textContent = fmtMoney(kpis.total_neto);
    if (elComisiones) elComisiones.textContent = fmtMoney(kpis.total_comisiones);
    if (elTickets) elTickets.textContent = (kpis.total_tickets || 0).toLocaleString('es-MX');
    if (elPromedio) elPromedio.textContent = fmtMoney(kpis.ticket_promedio);
    if (elTotalVend) elTotalVend.textContent = (kpis.total_vendedores || 0).toLocaleString('es-MX');
}

function filtrarYRenderizarVendedores() {
    const inputBusq = document.getElementById('inputBusquedaVendedores');
    const query = inputBusq ? inputBusq.value.trim().toUpperCase() : '';

    let filtrados = vendedoresDataCache.filter(v => {
        if (!query) return true;
        return (v.nombre && v.nombre.toUpperCase().includes(query)) ||
               (v.politica_nombre && v.politica_nombre.toUpperCase().includes(query));
    });

    // Ordenamiento
    filtrados.sort((a, b) => {
        let valA = a[ordenColumnaVendedores];
        let valB = b[ordenColumnaVendedores];

        if (typeof valA === 'string') valA = valA.toUpperCase();
        if (typeof valB === 'string') valB = valB.toUpperCase();

        if (valA < valB) return ordenDireccionVendedores === 'asc' ? -1 : 1;
        if (valA > valB) return ordenDireccionVendedores === 'asc' ? 1 : -1;
        return 0;
    });

    renderizarTablaVendedores(filtrados);
}

function ordenarTablaVendedores(columna) {
    if (ordenColumnaVendedores === columna) {
        ordenDireccionVendedores = (ordenDireccionVendedores === 'asc') ? 'desc' : 'asc';
    } else {
        ordenColumnaVendedores = columna;
        ordenDireccionVendedores = 'desc';
    }
    filtrarYRenderizarVendedores();
}

function renderizarTablaVendedores(lista) {
    const tbody = document.getElementById('tablaVendedoresBody');
    if (!tbody) return;

    if (!lista || lista.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="p-10 text-center text-slate-400 italic">
                    <div class="space-y-1">
                        <div class="text-2xl">👨‍💼</div>
                        <div class="font-bold text-slate-600 text-xs">No se encontraron ventas para este periodo</div>
                        <div class="text-[11px] text-slate-400">Verifica los filtros seleccionados o selecciona otro rango de fechas.</div>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    const fmtMoney = (val) => '$' + (Number(val) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    tbody.innerHTML = lista.map((v, idx) => {
        let medalla = '';
        if (idx === 0) medalla = '🥇';
        else if (idx === 1) medalla = '🥈';
        else if (idx === 2) medalla = '🥉';
        else medalla = `<span class="text-slate-400 text-[11px] font-mono font-bold">${idx + 1}</span>`;

        const pct = v.politica_pctje || 0;
        const badgePoliticaClass = pct > 1.5 
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
            : (pct > 0 ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-600 border-slate-200');

        return `
            <tr class="hover:bg-slate-50/80 transition-colors border-b border-slate-100">
                <td class="p-3 text-center">
                    <div class="w-7 h-7 mx-auto rounded-lg flex items-center justify-center font-bold text-xs bg-slate-100">
                        ${medalla}
                    </div>
                </td>
                <td class="p-3">
                    <div class="flex items-center gap-2.5">
                        <div class="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-xs shrink-0 shadow-xs">
                            ${v.nombre.charAt(0).toUpperCase()}
                        </div>
                        <div class="min-w-0">
                            <div class="font-black text-slate-900 text-xs leading-snug truncate" title="${v.nombre}">${v.nombre}</div>
                            <div class="text-[10px] text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
                                <span>ID: ${v.vendedor_id}</span>
                                ${v.oculto ? '<span class="text-rose-500 font-bold">(Inactivo)</span>' : ''}
                            </div>
                        </div>
                    </div>
                </td>
                <td class="p-3">
                    <span class="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold border ${badgePoliticaClass}">
                        ${v.politica_nombre} (${pct}%)
                    </span>
                </td>
                <td class="p-3 text-center">
                    <span class="inline-flex items-center justify-center font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-lg text-xs font-mono">
                        ${v.tickets.toLocaleString('es-MX')}
                    </span>
                </td>
                <td class="p-3 text-right font-black text-slate-800 text-xs font-mono">
                    ${fmtMoney(v.total_neto)}
                </td>
                <td class="p-3 text-right text-slate-500 text-xs font-mono">
                    ${fmtMoney(v.total_impuestos)}
                </td>
                <td class="p-3 text-right font-bold text-slate-700 text-xs font-mono">
                    ${fmtMoney(v.total_bruto)}
                </td>
                <td class="p-3 text-center">
                    <span class="font-mono text-xs font-bold text-slate-600">${pct.toFixed(2)}%</span>
                </td>
                <td class="p-3 text-right">
                    <div class="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 font-black text-xs font-mono shadow-xs">
                        <span>💰</span> ${fmtMoney(v.comision_calculada)}
                    </div>
                </td>
                <td class="p-3 text-center">
                    <button type="button" onclick="abrirModalDetalleVendedor(${v.vendedor_id})" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition inline-flex items-center gap-1.5 cursor-pointer shadow-xs" title="Ver lista de tickets">
                        <span>🧾</span> Tickets
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

async function abrirModalDetalleVendedor(vendedorId) {
    const modal = document.getElementById('modalDetalleVendedor');
    if (!modal) return;

    modal.classList.remove('hidden');

    document.getElementById('modalDetalleVendedorNombre').textContent = 'Cargando...';
    document.getElementById('modalDetalleVendedorPolitica').textContent = '...';
    document.getElementById('modalDetalleVendedorPeriodo').textContent = '...';
    document.getElementById('modalDetalleVendedorTotalNeto').textContent = '$0.00';
    document.getElementById('modalDetalleVendedorTotalComis').textContent = '$0.00';
    document.getElementById('modalDetalleVendedorTotalTickets').textContent = '0';

    const tbody = document.getElementById('modalDetalleVendedorTicketsBody');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="8" class="p-8 text-center text-slate-400 italic">Cargando tickets desde Microsip...</td></tr>';
    }

    const selPeriodo = document.getElementById('selPeriodoVendedores');
    const periodo = selPeriodo ? selPeriodo.value : 'este_mes';
    const inpIni = document.getElementById('fechaIniVendedores');
    const inpFin = document.getElementById('fechaFinVendedores');

    let url = `/api/vendedores/${vendedorId}/detalle?periodo=${encodeURIComponent(periodo)}`;
    if (periodo === 'rango_fechas' && inpIni && inpFin && inpIni.value && inpFin.value) {
        url += `&fecha_inicio=${inpIni.value}&fecha_fin=${inpFin.value}`;
    }

    try {
        const res = await fetch(url);
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Error al obtener tickets.');

        vendedorDetalleSeleccionado = data.vendedor;
        ticketsVendedorCache = data.tickets || [];

        const fmtMoney = (val) => '$' + (Number(val) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        document.getElementById('modalDetalleVendedorNombre').textContent = data.vendedor.nombre;
        document.getElementById('modalDetalleVendedorPolitica').textContent = `${data.vendedor.politica_nombre} (${data.vendedor.politica_pctje}%)`;
        document.getElementById('modalDetalleVendedorPeriodo').textContent = data.periodo_texto;
        document.getElementById('modalDetalleVendedorTotalNeto').textContent = fmtMoney(data.total_neto);
        document.getElementById('modalDetalleVendedorTotalComis').textContent = fmtMoney(data.total_comision);
        document.getElementById('modalDetalleVendedorTotalTickets').textContent = data.total_tickets;

        renderizarModalTicketsVendedor(ticketsVendedorCache);

    } catch (err) {
        console.error("Error al cargar detalle del vendedor:", err);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-rose-500 font-bold text-xs">Error: ${err.message}</td></tr>`;
        }
    }
}

function filtrarTicketsModalVendedor() {
    const inp = document.getElementById('inputBusquedaModalTickets');
    const q = inp ? inp.value.trim().toUpperCase() : '';
    if (!q) {
        renderizarModalTicketsVendedor(ticketsVendedorCache);
        return;
    }
    const filtrados = ticketsVendedorCache.filter(t => {
        return (t.folio && t.folio.toUpperCase().includes(q)) ||
               (t.cliente && t.cliente.toUpperCase().includes(q)) ||
               (t.sucursal && t.sucursal.toUpperCase().includes(q));
    });
    renderizarModalTicketsVendedor(filtrados);
}

function renderizarModalTicketsVendedor(tickets) {
    const tbody = document.getElementById('modalDetalleVendedorTicketsBody');
    if (!tbody) return;

    if (!tickets || tickets.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="p-8 text-center text-slate-400 italic">No se encontraron tickets para los criterios especificados.</td></tr>';
        return;
    }

    const fmtMoney = (val) => '$' + (Number(val) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    tbody.innerHTML = tickets.map(t => `
        <tr class="hover:bg-slate-50 transition border-b border-slate-100">
            <td class="p-3">
                <span class="font-mono font-black text-slate-900 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-lg text-xs">
                    ${t.folio}
                </span>
            </td>
            <td class="p-3 text-slate-600 font-mono text-[11px] whitespace-nowrap">
                ${t.fecha} ${t.hora ? `<span class="text-slate-400">${t.hora}</span>` : ''}
            </td>
            <td class="p-3">
                <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                    ${t.sucursal || t.almacen || 'Sucursal'}
                </span>
            </td>
            <td class="p-3">
                <div class="text-xs font-bold text-slate-800 truncate max-w-xs" title="${t.cliente}">${t.cliente}</div>
            </td>
            <td class="p-3 text-right font-black text-slate-800 text-xs font-mono">
                ${fmtMoney(t.importe_neto)}
            </td>
            <td class="p-3 text-right text-slate-500 text-xs font-mono">
                ${fmtMoney(t.total_impuestos)}
            </td>
            <td class="p-3 text-right font-bold text-slate-700 text-xs font-mono">
                ${fmtMoney(t.total_bruto)}
            </td>
            <td class="p-3 text-right font-black text-emerald-700 text-xs font-mono">
                ${fmtMoney(t.comision)}
            </td>
        </tr>
    `).join('');
}

function cerrarModalDetalleVendedor() {
    const modal = document.getElementById('modalDetalleVendedor');
    if (modal) modal.classList.add('hidden');
}

function exportarComisionesVendedoresCSV() {
    if (!vendedoresDataCache || !vendedoresDataCache.length) {
        mostrarAlerta('error', 'No hay datos de comisiones para exportar.');
        return;
    }

    const headers = ["Posición", "Vendedor ID", "Nombre Vendedor", "Política", "% Comisión", "Tickets", "Venta Neta", "Impuestos", "Venta Total", "Comisión a Pagar"];
    const rows = vendedoresDataCache.map((v, i) => [
        i + 1,
        v.vendedor_id,
        `"${(v.nombre || '').replace(/"/g, '""')}"`,
        `"${(v.politica_nombre || '').replace(/"/g, '""')}"`,
        v.politica_pctje,
        v.tickets,
        v.total_neto.toFixed(2),
        v.total_impuestos.toFixed(2),
        v.total_bruto.toFixed(2),
        v.comision_calculada.toFixed(2)
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Comisiones_Vendedores_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

