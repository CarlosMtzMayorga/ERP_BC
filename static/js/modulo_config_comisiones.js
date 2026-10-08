/**
 * MODULO: CONFIGURACIÓN DE POLÍTICAS Y COMISIONES DE VENDEDORES
 * Permite gestionar las políticas de comisiones (nombre, % y tipo de cálculo)
 * y asignarlas directamente a los vendedores registrados en Microsip.
 */

let cacheConfigPoliticas = [];
let cacheConfigVendedores = [];
let filtroBusqVendedor = '';
let filtroPoliticaId = '';
let filtroSoloActivos = true;

async function cargarConfigComisionesAdmin() {
    const contPol = document.getElementById('tablaPoliticasBody');
    const contVen = document.getElementById('tablaVendedoresComisBody');
    if (contPol) contPol.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-slate-400 italic">Cargando políticas...</td></tr>`;
    if (contVen) contVen.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-slate-400 italic">Cargando vendedores...</td></tr>`;

    try {
        const res = await fetch('/api/vendedores/config-comisiones');
        const data = await res.json();
        if (!data.success) {
            mostrarAlerta('error', data.error || 'No se pudieron cargar las comisiones.');
            return;
        }

        cacheConfigPoliticas = data.politicas || [];
        cacheConfigVendedores = data.vendedores || [];

        // Actualizar KPIs
        const kpis = data.kpis || {};
        const elTotalPol = document.getElementById('kpiTotalPoliticas');
        const elTotalVen = document.getElementById('kpiTotalVendedoresComis');
        const elVenActivos = document.getElementById('kpiVendedoresActivosComis');
        const elPromPct = document.getElementById('kpiPromedioComision');

        if (elTotalPol) elTotalPol.textContent = kpis.total_politicas || 0;
        if (elTotalVen) elTotalVen.textContent = kpis.total_vendedores || 0;
        if (elVenActivos) elVenActivos.textContent = kpis.vendedores_activos || 0;
        if (elPromPct) elPromPct.textContent = `${kpis.comision_promedio || 0}%`;

        // Renderizar selectores de filtro
        actualizarSelectFiltroPoliticas(cacheConfigPoliticas);

        // Renderizar tablas
        renderizarTablaPoliticas(cacheConfigPoliticas);
        renderizarTablaVendedoresComisiones();

    } catch (err) {
        console.error("Error al cargar config de comisiones:", err);
        mostrarAlerta('error', 'Error al comunicar con el servidor.');
    }
}

function actualizarSelectFiltroPoliticas(politicas) {
    const sel = document.getElementById('filtroSelectPoliticaVendedores');
    if (!sel) return;
    const valActual = sel.value;
    sel.innerHTML = `<option value="">Todas las políticas (${politicas.length})</option>` +
        politicas.map(p => `<option value="${p.id}">${p.nombre} (${p.comision}%)</option>`).join('');
    sel.value = valActual;
}

function renderizarTablaPoliticas(politicas) {
    const tbody = document.getElementById('tablaPoliticasBody');
    if (!tbody) return;

    if (!politicas || politicas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-slate-400 italic">No hay políticas de comisiones configuradas.</td></tr>`;
        return;
    }

    tbody.innerHTML = politicas.map(p => {
        const esOculta = p.oculto;
        const badgeColor = p.comision > 0 
            ? 'bg-emerald-100 text-emerald-800 border-emerald-300 font-black' 
            : 'bg-slate-100 text-slate-600 border-slate-200 font-bold';

        return `
            <tr class="hover:bg-slate-50/80 transition border-b border-slate-100">
                <td class="p-3 text-xs font-mono text-slate-400 font-bold">#${p.id}</td>
                <td class="p-3">
                    <div class="font-black text-xs text-slate-900">${p.nombre}</div>
                    <div class="text-[10px] text-slate-400 font-medium">${p.es_predet ? '⭐ Política predeterminada' : 'ID Catálogo Microsip'}</div>
                </td>
                <td class="p-3 text-center">
                    <span class="inline-flex items-center px-2.5 py-1 rounded-lg text-xs border ${badgeColor}">
                        ${Number(p.comision).toFixed(2)}%
                    </span>
                </td>
                <td class="p-3 text-xs text-slate-600">
                    <div class="font-semibold text-slate-800">${p.tipo_calculo_desc}</div>
                    <div class="text-[10px] text-slate-400 font-mono">Tipo: ${p.tipo_calculo}</div>
                </td>
                <td class="p-3 text-center">
                    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                        👥 ${p.total_vendedores} vendedores
                    </span>
                </td>
                <td class="p-3 text-center">
                    <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                        esOculta ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                    }">
                        ${esOculta ? 'Inactiva / Oculta' : 'Activa'}
                    </span>
                </td>
                <td class="p-3 text-right">
                    <button type="button" onclick="abrirModalEditarPolitica(${p.id})" class="px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:text-white bg-slate-100 hover:bg-slate-900 rounded-xl transition border border-slate-200 flex items-center gap-1.5 ml-auto cursor-pointer shadow-2xs" title="Editar porcentaje o nombre">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                        <span>Editar</span>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function filtrarTablaVendedores() {
    const inputBusq = document.getElementById('inputBusquedaVendedorComis');
    const selectPol = document.getElementById('filtroSelectPoliticaVendedores');
    const chkActivos = document.getElementById('chkSoloVendedoresActivos');

    filtroBusqVendedor = (inputBusq ? inputBusq.value : '').trim().toUpperCase();
    filtroPoliticaId = selectPol ? selectPol.value : '';
    filtroSoloActivos = chkActivos ? chkActivos.checked : true;

    renderizarTablaVendedoresComisiones();
}

function renderizarTablaVendedoresComisiones() {
    const tbody = document.getElementById('tablaVendedoresComisBody');
    if (!tbody) return;

    let filtrados = cacheConfigVendedores.filter(v => {
        if (filtroSoloActivos && v.oculto) return false;
        if (filtroPoliticaId && String(v.politica_id) !== String(filtroPoliticaId)) return false;
        if (filtroBusqVendedor) {
            const nom = (v.nombre || '').toUpperCase();
            const pol = (v.politica_nombre || '').toUpperCase();
            if (!nom.includes(filtroBusqVendedor) && !pol.includes(filtroBusqVendedor)) return false;
        }
        return true;
    });

    const contadorEl = document.getElementById('lblContadorVendedoresFiltrados');
    if (contadorEl) {
        contadorEl.textContent = `Mostrando ${filtrados.length} de ${cacheConfigVendedores.length} vendedores`;
    }

    if (filtrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-slate-400 italic">No se encontraron vendedores con los filtros seleccionados.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtrados.map(v => {
        // Opciones para el select de políticas
        const opcionesPoliticas = cacheConfigPoliticas.map(p => {
            const selected = (v.politica_id === p.id) ? 'selected' : '';
            return `<option value="${p.id}" ${selected}>${p.nombre} (${p.comision}%)</option>`;
        }).join('');

        const pct = Number(v.comision_pct || 0).toFixed(2);
        const badgePctColor = v.comision_pct > 0 
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
            : 'bg-slate-100 text-slate-500 border-slate-200';

        return `
            <tr class="hover:bg-slate-50/80 transition border-b border-slate-100">
                <td class="p-3 text-xs font-mono text-slate-400 font-bold">#${v.vendedor_id}</td>
                <td class="p-3">
                    <div class="font-black text-xs text-slate-900">${v.nombre}</div>
                    <div class="text-[10px] text-slate-400">${v.oculto ? '⚠️ Oculto en Microsip' : 'Vendedor Activo'}</div>
                </td>
                <td class="p-3">
                    <div class="flex items-center gap-2">
                        <select onchange="onCambioPoliticaVendedorSelect(${v.vendedor_id}, this.value)" class="text-xs font-bold border border-slate-300 rounded-xl px-2.5 py-1.5 bg-white text-slate-800 focus:ring-2 focus:ring-purple-600 focus:outline-none cursor-pointer">
                            <option value="">-- Sin Política --</option>
                            ${opcionesPoliticas}
                        </select>
                        <span id="badgeFeedbackVen_${v.vendedor_id}" class="text-[11px] font-black text-emerald-600 hidden">✓ Guardado</span>
                    </div>
                </td>
                <td class="p-3 text-center">
                    <span id="badgePctVen_${v.vendedor_id}" class="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-black border ${badgePctColor}">
                        ${pct}%
                    </span>
                </td>
                <td class="p-3 text-center">
                    <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                        v.oculto ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    }">
                        ${v.oculto ? 'Oculto' : 'Activo'}
                    </span>
                </td>
                <td class="p-3 text-right">
                    <button type="button" onclick="irAReporteVendedorDesdeConfig(${v.vendedor_id})" class="px-2.5 py-1 text-xs font-bold text-indigo-700 hover:text-white bg-indigo-50 hover:bg-indigo-600 border border-indigo-200 rounded-lg transition cursor-pointer" title="Ver desglose de ventas y tickets">
                        📊 Ver Ventas
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

async function onCambioPoliticaVendedorSelect(vendedorId, nuevaPoliticaId) {
    if (!nuevaPoliticaId) {
        mostrarAlerta('warning', 'Debe seleccionar una política válida.');
        return;
    }

    const badgeFeedback = document.getElementById(`badgeFeedbackVen_${vendedorId}`);
    const badgePct = document.getElementById(`badgePctVen_${vendedorId}`);

    try {
        const res = await fetch(`/api/vendedores/${vendedorId}/asignar-politica`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ politica_id: parseInt(nuevaPoliticaId) })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            mostrarAlerta('success', data.mensaje);

            // Actualizar en memoria local
            const venObj = cacheConfigVendedores.find(v => v.vendedor_id === vendedorId);
            const polObj = cacheConfigPoliticas.find(p => p.id === parseInt(nuevaPoliticaId));
            if (venObj && polObj) {
                venObj.politica_id = polObj.id;
                venObj.politica_nombre = polObj.nombre;
                venObj.comision_pct = polObj.comision;
                if (badgePct) {
                    badgePct.textContent = `${Number(polObj.comision).toFixed(2)}%`;
                }
            }

            if (badgeFeedback) {
                badgeFeedback.classList.remove('hidden');
                setTimeout(() => badgeFeedback.classList.add('hidden'), 2500);
            }
        } else {
            mostrarAlerta('error', data.error || 'No se pudo asignar la política.');
        }
    } catch (err) {
        mostrarAlerta('error', 'Error al comunicar con el servidor.');
    }
}

// ================= MODAL NUEVA / EDITAR POLÍTICA =================
function abrirModalNuevaPolitica() {
    const modal = document.getElementById('modalPoliticaComision');
    const form = document.getElementById('formPoliticaComision');
    const titulo = document.getElementById('modalPoliticaComisionTitulo');
    const errBox = document.getElementById('modalPoliticaComisionError');
    const bannerInfo = document.getElementById('bannerInfoPoliticaAfectados');

    if (form) form.reset();
    if (errBox) errBox.classList.add('hidden');
    if (titulo) titulo.textContent = 'Registrar Nueva Política de Comisión';
    if (bannerInfo) bannerInfo.classList.add('hidden');

    document.getElementById('inputPoliticaIdEdit').value = '';
    document.getElementById('inputPoliticaNombre').value = '';
    document.getElementById('inputPoliticaComision').value = '2.00';
    document.getElementById('selectPoliticaTipoCalculo').value = 'A';
    document.getElementById('chkPoliticaOculta').checked = false;

    if (modal) modal.classList.remove('hidden');
}

function abrirModalEditarPolitica(politicaId) {
    const pol = cacheConfigPoliticas.find(p => p.id === politicaId);
    if (!pol) return;

    const modal = document.getElementById('modalPoliticaComision');
    const form = document.getElementById('formPoliticaComision');
    const titulo = document.getElementById('modalPoliticaComisionTitulo');
    const errBox = document.getElementById('modalPoliticaComisionError');
    const bannerInfo = document.getElementById('bannerInfoPoliticaAfectados');
    const lblAfectados = document.getElementById('lblVendedoresAfectadosPolitica');

    if (form) form.reset();
    if (errBox) errBox.classList.add('hidden');
    if (titulo) titulo.textContent = `Editar Política #${pol.id}: ${pol.nombre}`;

    document.getElementById('inputPoliticaIdEdit').value = pol.id;
    document.getElementById('inputPoliticaNombre').value = pol.nombre;
    document.getElementById('inputPoliticaComision').value = Number(pol.comision).toFixed(2);
    document.getElementById('selectPoliticaTipoCalculo').value = pol.tipo_calculo || 'A';
    document.getElementById('chkPoliticaOculta').checked = !!pol.oculto;

    if (bannerInfo) {
        if (pol.total_vendedores > 0) {
            bannerInfo.classList.remove('hidden');
            if (lblAfectados) lblAfectados.textContent = `${pol.total_vendedores} vendedores tienen asignada esta política. Al modificar el % cambiará su comisión de inmediato.`;
        } else {
            bannerInfo.classList.add('hidden');
        }
    }

    if (modal) modal.classList.remove('hidden');
}

function cerrarModalPolitica() {
    const modal = document.getElementById('modalPoliticaComision');
    if (modal) modal.classList.add('hidden');
}

async function guardarPoliticaComisionSubmit(e) {
    e.preventDefault();
    const idEdit = document.getElementById('inputPoliticaIdEdit').value;
    const nombre = document.getElementById('inputPoliticaNombre').value.trim();
    const comision = parseFloat(document.getElementById('inputPoliticaComision').value);
    const tipoCalculo = document.getElementById('selectPoliticaTipoCalculo').value;
    const oculta = document.getElementById('chkPoliticaOculta').checked;
    const errBox = document.getElementById('modalPoliticaComisionError');
    const btnSubmit = document.getElementById('btnGuardarPoliticaSubmit');

    if (!nombre) {
        if (errBox) {
            errBox.textContent = 'El nombre de la política es obligatorio.';
            errBox.classList.remove('hidden');
        }
        return;
    }

    if (isNaN(comision) || comision < 0) {
        if (errBox) {
            errBox.textContent = 'El porcentaje de comisión debe ser mayor o igual a 0.';
            errBox.classList.remove('hidden');
        }
        return;
    }

    const payload = {
        nombre: nombre,
        comision: comision,
        tipo_calculo: tipoCalculo,
        oculto: oculta
    };

    const url = idEdit ? `/api/vendedores/politicas/${idEdit}` : '/api/vendedores/politicas';
    const method = idEdit ? 'PUT' : 'POST';

    const originalBtnText = btnSubmit ? btnSubmit.innerHTML : '';
    if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<span>Guardando...</span>';
    }

    try {
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok && data.success) {
            cerrarModalPolitica();
            mostrarAlerta('success', data.mensaje || 'Política guardada correctamente.');
            await cargarConfigComisionesAdmin();
        } else {
            if (errBox) {
                errBox.textContent = data.error || 'No se pudo guardar la política.';
                errBox.classList.remove('hidden');
            }
        }
    } catch (err) {
        if (errBox) {
            errBox.textContent = 'Error al comunicar con el servidor.';
            errBox.classList.remove('hidden');
        }
    } finally {
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = originalBtnText;
        }
    }
}

function irAReporteVendedorDesdeConfig(vendedorId) {
    if (typeof activarTab === 'function') {
        activarTab('vendedores_comisiones');
        setTimeout(() => {
            if (typeof abrirModalDetalleVendedor === 'function') {
                abrirModalDetalleVendedor(vendedorId);
            }
        }, 150);
    }
}

