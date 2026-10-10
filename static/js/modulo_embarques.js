// ==============================================================================
// MÓDULO EMBARQUES, EMPAQUE ZEBRA (4"x6") Y RECEPCIÓN EN SUCURSALES
// ==============================================================================

let embarqueActivo = null;
let partidasEmbarquePlanificadas = [];
let partidasCajaActual = [];
let numeroCajaActual = 1;
let audioCtx = null;
let etiquetaActualData = null;
let cajasChoferSesion = [];

// ================= FEEDBACK AUDITIVO (ESCÁNER USB / BLUETOOTH) =================
function reproducirSonidoEscaner(tipo = 'ok') {
    const chk = document.getElementById('chkAudioEscanerEmbarque');
    if (chk && !chk.checked) return;

    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        if (tipo === 'ok') {
            // Beep agudo corto y agradable de éxito (escaneo correcto)
            osc.frequency.setValueAtTime(1760, audioCtx.currentTime); // A6
            gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);
            osc.start(audioCtx.currentTime);
            osc.stop(audioCtx.currentTime + 0.12);
        } else if (tipo === 'caja_cerrada') {
            // Doble tono triunfal (caja empacada / completada)
            osc.frequency.setValueAtTime(1046.5, audioCtx.currentTime);
            osc.frequency.setValueAtTime(2093, audioCtx.currentTime + 0.08);
            gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);
            osc.start(audioCtx.currentTime);
            osc.stop(audioCtx.currentTime + 0.25);
        } else {
            // Beep grave de error o advertencia
            osc.frequency.setValueAtTime(320, audioCtx.currentTime);
            gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
            osc.start(audioCtx.currentTime);
            osc.stop(audioCtx.currentTime + 0.3);
        }
    } catch (e) {
        // Silencioso si el navegador bloquea audio
    }
}

// ================= GENERADOR NATIVO CODE 128 EN SVG =================
function generarSvgCode128(texto, altura = 60) {
    if (!texto) return '';
    const code128Table = [
        "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
        "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
        "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
        "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
        "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
        "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
        "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
        "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
        "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
        "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
        "114131","311141","411131","211412","211214","211232","2331112"
    ];

    let clean = String(texto).trim().toUpperCase();
    let codigos = [104]; // START B
    let suma = 104;

    for (let i = 0; i < clean.length; i++) {
        let ascii = clean.charCodeAt(i);
        let val = ascii - 32;
        if (val < 0 || val > 106) val = 0;
        codigos.push(val);
        suma += (val * (i + 1));
    }

    let check = suma % 103;
    codigos.push(check);
    codigos.push(106); // STOP

    let patron = "";
    codigos.forEach(c => { patron += code128Table[c] || "212222"; });

    let modWidth = 2.2;
    let svgRects = [];
    let x = 6;
    let isBar = true;

    for (let i = 0; i < patron.length; i++) {
        let w = parseInt(patron[i]) * modWidth;
        if (isBar) {
            svgRects.push(`<rect x="${x.toFixed(1)}" y="0" width="${w.toFixed(1)}" height="${altura}" fill="#000" />`);
        }
        x += w;
        isBar = !isBar;
    }

    return `
        <svg viewBox="0 0 ${Math.ceil(x + 12)} ${altura + 4}" class="w-full max-h-16 mx-auto" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
            ${svgRects.join('')}
        </svg>
    `;
}

// ================= INICIALIZACIÓN DEL MÓDULO EMBARQUES =================
async function inicializarModuloEmbarques() {
    await cargarDashboardEmbarques();
    await cargarSelectSucursalesEmbarques();
    await cargarListadoEmbarques();
    setupInputsListenersEmbarques();
}

function setupInputsListenersEmbarques() {
    const inputArt = document.getElementById('inputEscanerEmbarqueArticulo');
    if (inputArt && !inputArt.dataset.bound) {
        inputArt.dataset.bound = "true";
        inputArt.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                procesarScanEmbarqueInput();
            }
        });
    }

    const inputChofer = document.getElementById('inputEscanerChoferCaja');
    if (inputChofer && !inputChofer.dataset.bound) {
        inputChofer.dataset.bound = "true";
        inputChofer.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                procesarScanChofer();
            }
        });
    }

    const inputRec = document.getElementById('inputEscanerRecepcionCaja');
    if (inputRec && !inputRec.dataset.bound) {
        inputRec.dataset.bound = "true";
        inputRec.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                procesarScanRecepcionSucursal();
            }
        });
    }

    const tipoSel = document.getElementById('selectNuevoEmbarqueTipo');
    if (tipoSel && !tipoSel.dataset.bound) {
        tipoSel.dataset.bound = "true";
        tipoSel.addEventListener('change', () => {
            const esCliente = (tipoSel.value === 'PEDIDO_CLIENTE');
            const destSuc = document.getElementById('selectNuevoEmbarqueDestinoSucursal');
            const destCli = document.getElementById('inputNuevoEmbarqueCliente');
            if (destSuc) destSuc.classList.toggle('hidden', esCliente);
            if (destCli) destCli.classList.toggle('hidden', !esCliente);
        });
    }

    const inputDocOrigen = document.getElementById('inputNuevoEmbarqueDoctoOrigen');
    if (inputDocOrigen && !inputDocOrigen.dataset.bound) {
        inputDocOrigen.dataset.bound = "true";
        inputDocOrigen.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                cargarItemsDesdeOrigenMicrosip();
            }
        });
        inputDocOrigen.addEventListener('input', () => {
            const val = inputDocOrigen.value.trim().toUpperCase();
            const filas = document.querySelectorAll('#listaDoctosPendientesEmbarque > div');
            filas.forEach(f => {
                if (!val) {
                    f.style.display = '';
                } else {
                    const match = f.textContent.toUpperCase().includes(val);
                    f.style.display = match ? '' : 'none';
                }
            });
        });
    }
}

// ================= DASHBOARD Y KPIS GRANDES =================
async function cargarDashboardEmbarques() {
    try {
        const res = await fetch('/api/embarques/dashboard');
        const data = await res.json();
        if (data.success && data.kpis) {
            const k = data.kpis;
            const elTotal = document.getElementById('kpiEmbarquesTotal');
            const elPrep = document.getElementById('kpiEmbarquesPreparando');
            const elTrans = document.getElementById('kpiEmbarquesTransito');
            const elRec = document.getElementById('kpiEmbarquesRecibido');

            if (elTotal) elTotal.textContent = k.total_embarques || 0;
            if (elPrep) elPrep.textContent = k.preparando || 0;
            if (elTrans) elTrans.textContent = k.en_transito || 0;
            if (elRec) elRec.textContent = k.recibidos || 0;
        }
    } catch (e) {
        console.error("Error al cargar KPIs de embarques:", e);
    }
}

// ================= SELECT DE SUCURSALES =================
async function cargarSelectSucursalesEmbarques() {
    try {
        const res = await fetch('/api/catalogos/sucursales-vendedores');
        const data = await res.json();
        const selDest = document.getElementById('selectNuevoEmbarqueDestinoSucursal');
        const selRec = document.getElementById('selectSucursalRecepcionActual');

        if (data.success && Array.isArray(data.sucursales)) {
            let opts = '<option value="">-- Selecciona Destino --</option>';
            let optsRec = '';
            
            data.sucursales.forEach(s => {
                opts += `<option value="${s.id}" data-nombre="${s.nombre}">${s.nombre}</option>`;
                optsRec += `<option value="${s.id}">${s.nombre}</option>`;
            });

            if (selDest) selDest.innerHTML = opts;
            if (selRec) {
                selRec.innerHTML = optsRec || '<option value="">(Sin sucursales)</option>';
                // Intentar seleccionar la sucursal del usuario actual si existe
                if (currentUser && currentUser.sucursal_id) {
                    selRec.value = currentUser.sucursal_id;
                }
            }
        }
    } catch (e) {
        console.error("Error al cargar sucursales:", e);
    }
}

// ================= NAVEGACIÓN SUB-PESTAÑAS DE EMBARQUES =================
function cambiarSubTabEmbarquesInterno(tab) {
    const vLista = document.getElementById('vistaEmbarquesListado');
    const vNuevo = document.getElementById('vistaEmbarquesNuevo');
    const vChofer = document.getElementById('vistaEmbarquesChofer');

    const bLista = document.getElementById('tabSubEmbarquesListado');
    const bNuevo = document.getElementById('tabSubEmbarquesNuevo');
    const bChofer = document.getElementById('tabSubEmbarquesChofer');

    const tabInactivo = "px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 cursor-pointer";
    const tabActivo = "px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 bg-slate-900 text-white shadow-sm cursor-pointer";

    if (bLista) bLista.className = tabInactivo;
    if (bNuevo) bNuevo.className = tabInactivo;
    if (bChofer) bChofer.className = tabInactivo;

    if (vLista) vLista.classList.add('hidden');
    if (vNuevo) vNuevo.classList.add('hidden');
    if (vChofer) vChofer.classList.add('hidden');

    if (tab === 'nuevo') {
        if (vNuevo) vNuevo.classList.remove('hidden');
        if (bNuevo) bNuevo.className = tabActivo;
        cargarTraspasosPendientesEmbarque();
        setTimeout(() => document.getElementById('inputNuevoEmbarqueDoctoOrigen')?.focus(), 200);
    } else if (tab === 'chofer') {
        if (vChofer) vChofer.classList.remove('hidden');
        if (bChofer) bChofer.className = tabActivo;
        setTimeout(() => document.getElementById('inputEscanerChoferCaja')?.focus(), 200);
    } else {
        if (vLista) vLista.classList.remove('hidden');
        if (bLista) bLista.className = tabActivo;
        cargarDashboardEmbarques();
        cargarListadoEmbarques();
    }
}

// ================= LISTADO DE EMBARQUES Y TRACKING =================
async function cargarListadoEmbarques() {
    const tbody = document.getElementById('tablaEmbarquesListadoBody');
    if (!tbody) return;

    const termino = (document.getElementById('filtroEmbarquesTermino')?.value || '').trim();
    const estatus = document.getElementById('filtroEmbarquesEstatus')?.value || '';

    tbody.innerHTML = `<tr><td colspan="9" class="p-8 text-center text-slate-400 italic">Cargando embarques...</td></tr>`;

    try {
        const params = new URLSearchParams();
        if (termino) params.append('q', termino);
        if (estatus) params.append('estatus', estatus);

        const res = await fetch(`/api/embarques/listar?${params.toString()}`);
        const data = await res.json();
        if (!data.success || !data.embarques || data.embarques.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" class="p-8 text-center text-slate-400 font-medium">📦 No se encontraron embarques registrados.</td></tr>`;
            return;
        }

        tbody.innerHTML = '';
        data.embarques.forEach(emb => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50 border-b border-slate-100 transition-colors";

            let badgeStatus = '';
            if (emb.estatus === 'PREPARANDO') {
                badgeStatus = `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-200">🟡 En Empaque</span>`;
            } else if (emb.estatus === 'EN_TRANSITO') {
                badgeStatus = `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-200">🚚 En Tránsito</span>`;
            } else if (emb.estatus === 'RECIBIDO') {
                badgeStatus = `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">🟢 Recibido</span>`;
            } else {
                badgeStatus = `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-700">${emb.estatus}</span>`;
            }

            tr.innerHTML = `
                <td class="py-3 px-3.5 font-mono font-black text-slate-900 text-sm">
                    <span class="text-blue-600">#</span>${emb.folio}
                </td>
                <td class="py-3 px-3.5 text-xs font-bold text-slate-800">
                    <div>${emb.tipo_origen === 'PEDIDO_CLIENTE' ? '👤 Pedido Cliente' : '🏬 Resurtido Tienda'}</div>
                    <div class="text-[10px] text-slate-400 font-mono">${emb.documento_referencia || 'Sin docto ref'}</div>
                </td>
                <td class="py-3 px-3.5 text-xs font-bold text-slate-900">
                    <div>${emb.destino_texto}</div>
                    <div class="text-[10px] text-slate-400 font-normal">Origen: ${emb.almacen_origen_nombre || 'CEDIS'}</div>
                </td>
                <td class="py-3 px-3.5 text-center font-mono font-bold text-slate-700">
                    <span class="bg-slate-100 px-2 py-0.5 rounded text-xs">${emb.total_cajas} caja(s)</span>
                </td>
                <td class="py-3 px-3.5 text-center font-mono font-black text-slate-900">
                    ${emb.total_piezas} pzas
                </td>
                <td class="py-3 px-3.5 text-center">${badgeStatus}</td>
                <td class="py-3 px-3.5 text-xs text-slate-600">
                    <div class="font-bold">${emb.chofer_nombre || 'Sin chofer'}</div>
                    <div class="text-[10px] text-slate-400">${emb.salida_ruta_en ? ('Salida: ' + emb.salida_ruta_en) : ''}</div>
                </td>
                <td class="py-3 px-3.5 text-xs text-slate-500">
                    <div>${emb.creado_en || '--'}</div>
                    <div class="text-[10px] text-slate-400 font-mono">${emb.creado_por || 'ADMIN'}</div>
                </td>
                <td class="py-3 px-3.5 text-right">
                    <button type="button" onclick="verDetalleEmbarqueModal(${emb.id})" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs transition cursor-pointer">
                        Ver Cajas 👁️
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="9" class="p-6 text-center text-red-500 font-bold">Error al consultar listado de embarques.</td></tr>`;
    }
}

// ================= TRASPASOS PENDIENTES DE EMBARCAR (MICROSIP) =================
let traspasosPendientesCache = [];

async function cargarTraspasosPendientesEmbarque() {
    const contenedor = document.getElementById('listaDoctosPendientesEmbarque');
    const badgeTotal = document.getElementById('badgeTotalPendientesEmbarque');
    if (!contenedor) return;

    contenedor.innerHTML = `<div class="col-span-full p-6 text-center text-xs text-slate-400 italic">Consultando traspasos en Microsip...</div>`;

    try {
        const res = await fetch('/api/embarques/buscar-origen');
        const data = await res.json();
        if (!data.success || !data.resultados || data.resultados.length === 0) {
            contenedor.innerHTML = `<div class="col-span-full p-6 text-center text-xs text-emerald-600 font-bold">✨ No hay traspasos pendientes de embarcar en Microsip.</div>`;
            if (badgeTotal) badgeTotal.textContent = '0 pendientes';
            return;
        }

        traspasosPendientesCache = data.resultados;
        const noEmbarcados = traspasosPendientesCache.filter(t => !t.ya_embarcado);
        if (badgeTotal) {
            badgeTotal.textContent = `${noEmbarcados.length} pendientes`;
            badgeTotal.className = noEmbarcados.length > 0 
                ? "px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300" 
                : "px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300";
        }

        const inputFiltro = document.getElementById('inputFiltroTraspasosCards');
        const filtroVal = inputFiltro ? inputFiltro.value : '';
        if (filtroVal) {
            filtrarTraspasosCards(filtroVal);
        } else {
            renderizarTraspasosCards(traspasosPendientesCache);
        }
    } catch (e) {
        console.error("Error al cargar traspasos pendientes:", e);
        contenedor.innerHTML = `<div class="col-span-full p-6 text-center text-xs text-red-500 font-bold">Error al consultar traspasos en Microsip.</div>`;
    }
}

function renderizarTraspasosCards(docs) {
    const contenedor = document.getElementById('listaDoctosPendientesEmbarque');
    if (!contenedor) return;
    contenedor.innerHTML = '';

    if (!docs || docs.length === 0) {
        contenedor.innerHTML = `
            <div class="col-span-full p-8 text-center bg-white rounded-2xl border border-dashed border-slate-200">
                <div class="text-2xl mb-1">🔍</div>
                <div class="text-xs font-bold text-slate-700">No hay traspasos que coincidan con la búsqueda.</div>
            </div>
        `;
        return;
    }

    docs.forEach(doc => {
        const estaEmbarcado = doc.ya_embarcado;
        const card = document.createElement('div');
        card.className = `bg-white rounded-2xl border transition-all duration-200 p-3.5 flex flex-col justify-between shadow-2xs hover:shadow-md ${
            estaEmbarcado ? 'border-slate-200 opacity-60 bg-slate-50/70' : 'border-slate-200/90 hover:border-indigo-400 group'
        }`;

        const badgeEmbarcado = estaEmbarcado
            ? `<span class="px-2 py-0.5 rounded-full text-[9px] font-black bg-slate-100 text-slate-500 border border-slate-200">YA EN EMBARQUE</span>`
            : `<span class="px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-100 text-amber-800 border border-amber-300">PENDIENTE</span>`;

        card.innerHTML = `
            <div>
                <!-- Header de Tarjeta: Folio y Estado -->
                <div class="flex items-center justify-between gap-1.5 pb-2 border-b border-slate-100">
                    <div class="flex items-center gap-1.5 min-w-0">
                        <span class="w-6 h-6 rounded-lg ${estaEmbarcado ? 'bg-slate-100 text-slate-400' : 'bg-indigo-50 text-indigo-600'} flex items-center justify-center text-xs font-mono shrink-0">📋</span>
                        <span class="font-mono font-black text-xs sm:text-sm text-slate-900 truncate">#${doc.folio}</span>
                    </div>
                    ${badgeEmbarcado}
                </div>

                <!-- Destino / Sucursal -->
                <div class="mt-2.5">
                    <div class="text-[9px] font-black uppercase tracking-wider text-slate-400 leading-none">Destino</div>
                    <div class="text-xs sm:text-sm font-black text-slate-800 uppercase tracking-tight truncate mt-1 flex items-center gap-1" title="${doc.almacen_destino_nombre || 'Sucursal Destino'}">
                        <span>🏬</span>
                        <span class="truncate">${doc.almacen_destino_nombre || 'Sucursal Destino'}</span>
                    </div>
                </div>

                <!-- Resumen de Carga (Artículos y Piezas) -->
                <div class="flex items-center gap-1.5 mt-2.5 flex-wrap">
                    <span class="bg-indigo-50 text-indigo-700 border border-indigo-200/90 font-black text-[10.5px] px-2 py-0.5 rounded-lg flex items-center gap-1 shadow-2xs">
                        📦 ${doc.total_articulos || 0} arts
                    </span>
                    <span class="bg-emerald-50 text-emerald-800 border border-emerald-200/90 font-black text-[10.5px] px-2 py-0.5 rounded-lg flex items-center gap-1 shadow-2xs">
                        🔢 ${doc.total_piezas || 0} pzas
                    </span>
                </div>

                <!-- Metadatos: Fecha y Solicitante -->
                <div class="text-[10px] text-slate-500 font-medium mt-2.5 pt-2 border-t border-slate-50 space-y-0.5">
                    <div class="flex items-center justify-between text-slate-400 text-[9.5px]">
                        <span>📅 ${doc.fecha || '--'}</span>
                        ${doc.descripcion ? `<span class="truncate max-w-[130px] text-slate-600 font-bold" title="${doc.descripcion}">👤 ${doc.descripcion}</span>` : ''}
                    </div>
                </div>
            </div>

            <!-- Footer: Botón de Acción -->
            <div class="mt-3">
                ${estaEmbarcado ? `
                    <button type="button" onclick="seleccionarTraspasoPendiente('${doc.folio}')"
                            class="w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5">
                        <span>👁️ Ver en Empaque</span>
                    </button>
                ` : `
                    <button type="button" onclick="seleccionarTraspasoPendiente('${doc.folio}')"
                            class="w-full py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-sm transition cursor-pointer flex items-center justify-center gap-1.5 group-hover:bg-indigo-700">
                        <span>⚡ Cargar Traspaso</span>
                    </button>
                `}
            </div>
        `;

        contenedor.appendChild(card);
    });
}

function filtrarTraspasosCards(termino) {
    const q = (termino || '').trim().toUpperCase();
    if (!q) {
        renderizarTraspasosCards(traspasosPendientesCache);
        return;
    }
    const filtrados = traspasosPendientesCache.filter(doc => {
        const fol = (doc.folio || '').toUpperCase();
        const suc = (doc.almacen_destino_nombre || '').toUpperCase();
        const desc = (doc.descripcion || '').toUpperCase();
        return fol.includes(q) || suc.includes(q) || desc.includes(q);
    });
    renderizarTraspasosCards(filtrados);
}

async function seleccionarTraspasoPendiente(folio) {
    const inputDoc = document.getElementById('inputNuevoEmbarqueDoctoOrigen');
    if (inputDoc) {
        inputDoc.value = folio;
    }
    await cargarItemsDesdeOrigenMicrosip();
}

// ================= BÚSQUEDA DE DOCUMENTO DE ORIGEN (MICROSIP) =================
async function cargarItemsDesdeOrigenMicrosip() {
    const inputDoc = document.getElementById('inputNuevoEmbarqueDoctoOrigen');
    const docRef = (inputDoc?.value || '').trim();
    if (!docRef) {
        mostrarAlerta('error', 'Por favor ingresa un folio o documento de referencia.');
        return;
    }

    try {
        const res = await fetch(`/api/embarques/buscar-origen?q=${encodeURIComponent(docRef)}`);
        const data = await res.json();
        if (!data.success || !data.resultados || data.resultados.length === 0) {
            mostrarAlerta('info', `No se encontró el documento ${docRef} en Microsip. Puedes continuar manualmente.`);
            return;
        }

        const primerRes = data.resultados[0];
        // Asignar destino si coincide
        const selSuc = document.getElementById('selectNuevoEmbarqueDestinoSucursal');
        if (selSuc && primerRes.almacen_destino_id) {
            selSuc.value = primerRes.almacen_destino_id;
        }

        // Cargar partidas sugeridas
        partidasEmbarquePlanificadas = (primerRes.partidas || []).map(p => ({
            articulo_id: p.articulo_id,
            clave: p.clave,
            nombre: p.nombre,
            unidades_requeridas: p.unidades,
            unidades_empacadas: 0
        }));

        reproducirSonidoEscaner('ok');
        mostrarAlerta('success', `Documento ${primerRes.folio} encontrado con ${partidasEmbarquePlanificadas.length} artículos.`);
    } catch (e) {
        mostrarAlerta('error', 'Error al buscar documento en Microsip.');
    }
}

// ================= INICIAR SESIÓN DE EMPAQUE =================
async function iniciarSesionEmpaque() {
    const tipo = document.getElementById('selectNuevoEmbarqueTipo')?.value || 'RESURTIDO_TRASPASO';
    const selSuc = document.getElementById('selectNuevoEmbarqueDestinoSucursal');
    const inputCli = document.getElementById('inputNuevoEmbarqueCliente');
    const docRef = (document.getElementById('inputNuevoEmbarqueDoctoOrigen')?.value || '').trim();

    let destId = null;
    let destNombre = '';

    if (tipo === 'PEDIDO_CLIENTE') {
        destNombre = (inputCli?.value || '').trim();
        if (!destNombre) {
            mostrarAlerta('error', 'Por favor ingresa el nombre del cliente destino.');
            inputCli?.focus();
            return;
        }
    } else {
        destId = selSuc ? selSuc.value : null;
        destNombre = (selSuc && selSuc.selectedIndex > 0) ? selSuc.options[selSuc.selectedIndex].dataset.nombre || selSuc.options[selSuc.selectedIndex].text : '';
        if (!destNombre) {
            mostrarAlerta('error', 'Por favor selecciona la sucursal de destino.');
            selSuc?.focus();
            return;
        }
    }

    try {
        const res = await fetch('/api/embarques/crear', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tipo_origen: tipo,
                almacen_destino_id: destId,
                almacen_destino_nombre: destNombre,
                documento_referencia: docRef
            })
        });
        const data = await res.json();
        if (!data.success) {
            mostrarAlerta('error', data.error || 'No se pudo crear el embarque.');
            return;
        }

        embarqueActivo = {
            id: data.embarque_id,
            folio: data.folio,
            destino: destNombre,
            tipo: tipo
        };
        numeroCajaActual = 1;
        partidasCajaActual = [];

        // Actualizar UI de empaque
        document.getElementById('badgeFolioAsignado').textContent = `Folio Base: ${data.folio}`;
        document.getElementById('txtFolioCajaActual').textContent = `${data.folio}-${numeroCajaActual}`;
        document.getElementById('badgeCajaNumero').textContent = `Caja 1`;
        document.getElementById('txtTotalPiezasCajaActual').textContent = `0 pzas`;

        document.getElementById('panelEmpaqueCajas').classList.remove('hidden');
        renderizarTablaCajaActual();
        limpiarContenedorCajasEmpacadas();

        reproducirSonidoEscaner('ok');
        mostrarAlerta('success', `Embarque Folio #${data.folio} iniciado. Listo para empacar Caja 1.`);

        setTimeout(() => {
            const inp = document.getElementById('inputEscanerEmbarqueArticulo');
            if (inp) inp.focus();
        }, 200);
    } catch (e) {
        mostrarAlerta('error', 'Error de comunicación al iniciar embarque.');
    }
}

// ================= ESCANEO DE ARTÍCULOS PARA CAJA ACTUAL =================
function procesarScanEmbarqueInput() {
    if (!embarqueActivo) {
        mostrarAlerta('error', 'Debes presionar "Iniciar Empaque" antes de escanear artículos.');
        return;
    }

    const input = document.getElementById('inputEscanerEmbarqueArticulo');
    const codigo = (input?.value || '').trim().toUpperCase();
    if (!codigo) return;
    input.value = '';

    // Buscar en planificadas o agregar libre
    let itemClave = codigo;
    let itemNombre = 'Artículo Escaneado';
    let artId = null;

    const pReq = partidasEmbarquePlanificadas.find(p => p.clave === codigo || (p.codigo_barras && p.codigo_barras === codigo));
    if (pReq) {
        itemClave = pReq.clave;
        itemNombre = pReq.nombre;
        artId = pReq.articulo_id;
        pReq.unidades_empacadas = (pReq.unidades_empacadas || 0) + 1;
    }

    // Agregar a partidas de la caja actual
    let exist = partidasCajaActual.find(p => p.clave === itemClave);
    if (exist) {
        exist.unidades += 1;
    } else {
        partidasCajaActual.push({
            articulo_id: artId,
            clave: itemClave,
            nombre: itemNombre,
            codigo_barras: codigo,
            unidades: 1
        });
    }

    reproducirSonidoEscaner('ok');
    renderizarTablaCajaActual();

    // Actualizar banner de último escaneado
    const aviso = document.getElementById('avisoUltimoArticuloEscaneado');
    const txtAviso = document.getElementById('txtUltimoEscaneado');
    if (aviso && txtAviso) {
        txtAviso.textContent = `Último artículo: ${itemClave} - ${itemNombre}`;
        aviso.classList.remove('hidden');
    }

    input.focus();
}

function renderizarTablaCajaActual() {
    const tbody = document.getElementById('tablaItemsCajaActualBody');
    if (!tbody) return;

    if (partidasCajaActual.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-slate-400 italic">No hay artículos escaneados en esta caja. Pasa el escáner sobre el primer artículo.</td></tr>`;
        document.getElementById('txtTotalPiezasCajaActual').textContent = '0 pzas';
        document.getElementById('txtContadorFilasCajaActual').textContent = '0 artículos distintos';
        return;
    }

    tbody.innerHTML = '';
    let totalPzas = 0;

    partidasCajaActual.forEach((p, idx) => {
        totalPzas += p.unidades;
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 border-b border-slate-100 transition-colors";
        tr.innerHTML = `
            <td class="py-2.5 px-3.5 font-mono font-black text-slate-900 text-xs">${p.clave}</td>
            <td class="py-2.5 px-3.5 text-xs text-slate-700 font-bold">${p.nombre}</td>
            <td class="py-2.5 px-3.5 text-center font-mono text-[11px] text-slate-500">${p.codigo_barras || p.clave}</td>
            <td class="py-2.5 px-3.5 text-center font-mono font-black text-xs text-blue-700 bg-blue-50/50">${p.unidades}</td>
            <td class="py-2.5 px-3.5 text-right">
                <button type="button" onclick="quitarItemCajaActual(${idx})" class="text-rose-500 hover:text-rose-700 font-bold text-xs p-1">
                    ✕
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('txtTotalPiezasCajaActual').textContent = `${totalPzas} pzas`;
    document.getElementById('txtContadorFilasCajaActual').textContent = `${partidasCajaActual.length} artículos distintos (${totalPzas} piezas)`;
}

function quitarItemCajaActual(idx) {
    if (partidasCajaActual[idx]) {
        partidasCajaActual.splice(idx, 1);
        renderizarTablaCajaActual();
    }
}

function limpiarContenedorCajasEmpacadas() {
    const cont = document.getElementById('contenedorCajasEmpacadas');
    if (cont) {
        cont.innerHTML = `
            <div class="col-span-full p-4 text-center text-slate-400 text-xs italic bg-slate-50 rounded-2xl border border-slate-200">
                Aún no has cerrado ninguna caja. Cuando termines de meter artículos a la primera caja, presiona "Cerrar Caja e Imprimir Etiqueta".
            </div>
        `;
    }
    const txtTotal = document.getElementById('txtTotalCajasEmpacadas');
    if (txtTotal) txtTotal.textContent = '0 Cajas';
}

// ================= CERRAR CAJA ACTUAL E IMPRIMIR ETIQUETA ZEBRA =================
async function cerrarCajaActualEImprimir() {
    if (!embarqueActivo) return;
    if (partidasCajaActual.length === 0) {
        mostrarAlerta('error', 'La caja actual está vacía. Escanea al menos un artículo antes de cerrarla.');
        reproducirSonidoEscaner('error');
        return;
    }

    try {
        const res = await fetch('/api/embarques/cerrar-caja', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                embarque_id: embarqueActivo.id,
                partidas: partidasCajaActual
            })
        });
        const data = await res.json();
        if (!data.success) {
            mostrarAlerta('error', data.error || 'No se pudo cerrar la caja.');
            reproducirSonidoEscaner('error');
            return;
        }

        reproducirSonidoEscaner('caja_cerrada');
        mostrarAlerta('success', `¡Caja ${data.folio_caja} cerrada exitosamente! Abriendo vista previa de etiqueta Zebra.`);

        // Agregar tarjeta de caja cerrada
        agregarTarjetaCajaCerrada(data.folio_caja, data.piezas_caja, data.total_cajas);

        // Abrir modal de etiqueta Zebra
        abrirModalEtiquetaZebra(data.etiqueta);

        // Preparar siguiente caja
        numeroCajaActual = data.total_cajas + 1;
        partidasCajaActual = [];
        document.getElementById('txtFolioCajaActual').textContent = `${embarqueActivo.folio}-${numeroCajaActual}`;
        document.getElementById('badgeCajaNumero').textContent = `Caja ${numeroCajaActual}`;
        renderizarTablaCajaActual();

        // Limpiar aviso
        const aviso = document.getElementById('avisoUltimoArticuloEscaneado');
        if (aviso) aviso.classList.add('hidden');
    } catch (e) {
        mostrarAlerta('error', 'Error al cerrar caja en el servidor.');
    }
}

function agregarTarjetaCajaCerrada(folioCaja, piezas, totalCajas) {
    const cont = document.getElementById('contenedorCajasEmpacadas');
    if (!cont) return;

    // Quitar mensaje vacío si existe
    if (cont.querySelector('.col-span-full')) {
        cont.innerHTML = '';
    }

    const card = document.createElement('div');
    card.className = "bg-slate-50 p-3 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between";
    card.innerHTML = `
        <div class="flex items-center gap-2.5">
            <span class="text-xl">📦</span>
            <div>
                <div class="font-mono font-black text-slate-900 text-xs">${folioCaja}</div>
                <div class="text-[10px] text-slate-500 font-bold">${piezas} piezas en caja</div>
            </div>
        </div>
        <button type="button" onclick="cargarEtiquetaZebraPorFolio('${folioCaja}')" class="px-2 py-1 bg-white hover:bg-slate-100 text-blue-700 font-bold text-[11px] rounded-lg border border-slate-200 transition cursor-pointer">
            🏷️ Zebra
        </button>
    `;
    cont.appendChild(card);

    const txtTotal = document.getElementById('txtTotalCajasEmpacadas');
    if (txtTotal) txtTotal.textContent = `${totalCajas} Caja(s)`;
}

// ================= FINALIZAR EMBARQUE COMPLETO =================
function finalizarEmbarqueCompleto() {
    if (partidasCajaActual.length > 0) {
        if (confirm(`Tienes ${partidasCajaActual.length} artículo(s) en la caja actual sin cerrar. ¿Deseas cerrarla e imprimir su etiqueta Zebra antes de finalizar?`)) {
            cerrarCajaActualEImprimir().then(() => {
                terminarSesion();
            });
            return;
        }
    }
    terminarSesion();
}

function terminarSesion() {
    mostrarAlerta('success', `Embarque Folio #${embarqueActivo?.folio} finalizado y listo para despacho con chofer.`);
    embarqueActivo = null;
    partidasEmbarquePlanificadas = [];
    partidasCajaActual = [];
    numeroCajaActual = 1;

    document.getElementById('panelEmpaqueCajas').classList.add('hidden');
    document.getElementById('badgeFolioAsignado').textContent = 'Folio Base: --';

    cambiarSubTabEmbarquesInterno('listado');
}

function cancelarSesionEmpaqueActual() {
    if (confirm('¿Deseas salir del empaque actual? Las cajas ya cerradas permanecerán guardadas.')) {
        embarqueActivo = null;
        partidasEmbarquePlanificadas = [];
        partidasCajaActual = [];
        document.getElementById('panelEmpaqueCajas').classList.add('hidden');
        document.getElementById('badgeFolioAsignado').textContent = 'Folio Base: --';
        cambiarSubTabEmbarquesInterno('listado');
    }
}

// ================= MODAL ETIQUETA ZEBRA (4" x 6") =================
function abrirModalEtiquetaZebra(etiqueta) {
    if (!etiqueta) return;
    etiquetaActualData = etiqueta;

    const modal = document.getElementById('modalEtiquetaZebra');
    if (!modal) return;

    // Asignar Logo de la empresa activa
    const imgLogo = document.getElementById('etiquetaLogoImg');
    if (imgLogo) {
        const logoTag = etiqueta.logo_tag || 'logo bc';
        imgLogo.src = `/api/logo/${encodeURIComponent(logoTag)}`;
    }

    document.getElementById('etiquetaFechaCaja').textContent = etiqueta.fecha_hora || new Date().toISOString().slice(0, 10);
    document.getElementById('etiquetaFolioCaja').textContent = etiqueta.folio_caja;
    document.getElementById('etiquetaIndiceCaja').textContent = `CAJA ${etiqueta.numero_caja} DE ${etiqueta.total_cajas}`;
    document.getElementById('etiquetaDestinoNombre').textContent = etiqueta.destino || 'DESTINO';
    document.getElementById('etiquetaTotalPiezas').textContent = `${etiqueta.piezas} PZAS`;
    document.getElementById('etiquetaDoctoRef').textContent = etiqueta.documento_referencia || '--';
    document.getElementById('etiquetaUsuarioEmbarque').textContent = etiqueta.operador || 'ALMACEN';

    // Barcode SVG
    const svgCont = document.getElementById('etiquetaBarcodeSvg');
    if (svgCont) {
        svgCont.innerHTML = generarSvgCode128(etiqueta.folio_caja, 60);
    }
    const txtBar = document.getElementById('etiquetaBarcodeTexto');
    if (txtBar) txtBar.textContent = etiqueta.folio_caja;

    // Guardar ZPL
    const inputZpl = document.getElementById('inputZplCodigoActual');
    if (inputZpl) inputZpl.value = etiqueta.zpl || '';

    modal.classList.remove('hidden');
}

function cerrarModalEtiquetaZebra() {
    document.getElementById('modalEtiquetaZebra')?.classList.add('hidden');
}

async function cargarEtiquetaZebraPorFolio(folioCaja) {
    try {
        const res = await fetch(`/api/embarques/caja/${encodeURIComponent(folioCaja)}/etiqueta`);
        const data = await res.json();
        if (data.success && data.etiqueta) {
            abrirModalEtiquetaZebra(data.etiqueta);
        } else {
            mostrarAlerta('error', data.error || 'No se pudo obtener la etiqueta.');
        }
    } catch (e) {
        mostrarAlerta('error', 'Error al cargar etiqueta Zebra.');
    }
}

function copiarCodigoZplClipboard() {
    const input = document.getElementById('inputZplCodigoActual');
    const zpl = input ? input.value : (etiquetaActualData?.zpl || '');
    if (!zpl) {
        mostrarAlerta('error', 'Código ZPL no disponible.');
        return;
    }
    navigator.clipboard.writeText(zpl).then(() => {
        mostrarAlerta('success', 'Código ZPL copiado al portapapeles. Listo para enviar directo a la impresora Zebra.');
    });
}

function imprimirEtiquetaZebraNativa() {
    const cont = document.getElementById('areaImpresionEtiqueta');
    if (!cont) return;

    const ventana = window.open('', '_blank', 'width=450,height=650');
    ventana.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Etiqueta ${etiquetaActualData?.folio_caja || 'Zebra'}</title>
            <style>
                @page {
                    size: 4in 6in;
                    margin: 0;
                }
                body {
                    margin: 0;
                    padding: 6mm;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
                    background: #fff;
                    color: #000;
                    width: 3.8in;
                    box-sizing: border-box;
                }
                svg { max-width: 100%; height: 60px; }
            </style>
        </head>
        <body onload="window.print(); window.close();">
            ${cont.outerHTML}
        </body>
        </html>
    `);
    ventana.document.close();
}

// ================= CHOFER / MENSAJERO: ESCANEAR CAJAS PARA SALIDA =================
async function procesarScanChofer() {
    const inputCaja = document.getElementById('inputEscanerChoferCaja');
    const inputChofer = document.getElementById('inputChoferNombre');
    const codigo = (inputCaja?.value || '').trim().toUpperCase();
    const chofer = (inputChofer?.value || '').trim() || 'Chofer Ruta';

    if (!codigo) return;
    inputCaja.value = '';

    try {
        const res = await fetch('/api/embarques/escanear-mensajero', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ codigo, chofer })
        });
        const data = await res.json();
        if (!data.success) {
            reproducirSonidoEscaner('error');
            mostrarAlerta('error', data.error || 'Caja no encontrada.');
            return;
        }

        reproducirSonidoEscaner('ok');
        mostrarAlerta('success', `📦 Caja ${data.folio_caja} cargada al camión hacia ${data.destino}. Estatus: EN TRÁNSITO.`);

        // Agregar fila al log en vivo
        const tbody = document.getElementById('tablaChoferCajasBody');
        if (tbody) {
            if (tbody.querySelector('.italic')) {
                tbody.innerHTML = '';
            }

            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50 border-b border-slate-100";
            tr.innerHTML = `
                <td class="py-2.5 px-3.5 font-mono font-black text-slate-900 text-xs">${data.folio_caja}</td>
                <td class="py-2.5 px-3.5 font-mono text-xs text-slate-600">#${data.folio_embarque || '--'}</td>
                <td class="py-2.5 px-3.5 font-bold text-xs text-slate-800">${data.destino}</td>
                <td class="py-2.5 px-3.5 text-center font-mono font-black text-xs text-blue-700">${data.piezas || '--'} pzs</td>
                <td class="py-2.5 px-3.5 text-xs text-slate-700">${data.chofer}</td>
                <td class="py-2.5 px-3.5 text-xs text-slate-400 font-mono">${new Date().toLocaleTimeString()}</td>
                <td class="py-2.5 px-3.5 text-center">
                    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800">
                        🚚 En Tránsito
                    </span>
                </td>
            `;
            tbody.prepend(tr);

            cajasChoferSesion.push(data.folio_caja);
            const txtTurno = document.getElementById('txtTotalCajasChoferTurno');
            if (txtTurno) txtTurno.textContent = `${cajasChoferSesion.length} cajas en tránsito`;
        }

        inputCaja.focus();
    } catch (e) {
        mostrarAlerta('error', 'Error al escanear salida de caja.');
    }
}

// ================= RECEPCIÓN DE CAJAS EN SUCURSALES =================
async function cargarCajasPendientesSucursal() {
    const selSuc = document.getElementById('selectSucursalRecepcionActual');
    const sucId = selSuc ? selSuc.value : '';
    const tbody = document.getElementById('tablaCajasPendientesSucursalBody');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-slate-400 italic">Consultando cajas en tránsito...</td></tr>`;

    try {
        const url = sucId ? `/api/embarques/sucursal/pendientes?sucursal_id=${encodeURIComponent(sucId)}` : '/api/embarques/sucursal/pendientes';
        const res = await fetch(url);
        const data = await res.json();

        if (!data.success || !data.cajas_pendientes || data.cajas_pendientes.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-slate-400 font-medium">📦 No hay cajas en camino hacia esta sucursal actualmente.</td></tr>`;
            const txtPend = document.getElementById('txtTotalCajasPendientesSucursal');
            if (txtPend) txtPend.textContent = '0 cajas';
            return;
        }

        tbody.innerHTML = '';
        data.cajas_pendientes.forEach(c => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50 border-b border-slate-100 transition-colors";
            tr.innerHTML = `
                <td class="py-2.5 px-3.5 font-mono font-black text-slate-900 text-xs">
                    <span class="text-indigo-600">📦</span> ${c.folio_caja}
                </td>
                <td class="py-2.5 px-3.5 font-mono text-xs text-slate-600">#${c.folio_embarque} (Caja ${c.numero_caja}/${c.total_cajas_embarque})</td>
                <td class="py-2.5 px-3.5 text-xs text-slate-500 font-mono">${c.documento_referencia || '--'}</td>
                <td class="py-2.5 px-3.5 text-center font-mono font-black text-xs text-slate-900">${c.piezas_en_caja} pzs</td>
                <td class="py-2.5 px-3.5 text-xs text-slate-700 font-bold">${c.chofer_nombre || 'Pendiente'}</td>
                <td class="py-2.5 px-3.5 text-xs text-slate-400">${c.salida_ruta_en || c.empacado_en || ''}</td>
                <td class="py-2.5 px-3.5 text-right">
                    <button type="button" onclick="recibirCajaPorCodigo('${c.folio_caja}')" class="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition shadow-xs">
                        Recibir 📥
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        const txtPend = document.getElementById('txtTotalCajasPendientesSucursal');
        if (txtPend) txtPend.textContent = `${data.cajas_pendientes.length} cajas en camino`;
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-red-500 font-bold">Error al consultar cajas de la sucursal.</td></tr>`;
    }
}

async function procesarScanRecepcionSucursal() {
    const input = document.getElementById('inputEscanerRecepcionCaja');
    const codigo = (input?.value || '').trim().toUpperCase();
    if (!codigo) return;
    input.value = '';

    await recibirCajaPorCodigo(codigo);
    input.focus();
}

async function recibirCajaPorCodigo(folioCaja) {
    try {
        const res = await fetch('/api/embarques/sucursal/recibir', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ codigo: folioCaja })
        });
        const data = await res.json();
        if (!data.success) {
            reproducirSonidoEscaner('error');
            mostrarAlerta('error', data.error || 'No se pudo recibir la caja.');
            return;
        }

        reproducirSonidoEscaner('ok');
        mostrarAlerta('success', `Caja ${data.folio_caja} recibida con éxito en la tienda.`);

        // Mostrar modal de confirmación con artículos
        mostrarModalContenidoRecibido(data.folio_caja, data.detalles || []);

        // Recargar listado de pendientes
        cargarCajasPendientesSucursal();
    } catch (e) {
        mostrarAlerta('error', 'Error al recibir caja en sucursal.');
    }
}

function mostrarModalContenidoRecibido(folioCaja, detalles) {
    const modal = document.getElementById('modalContenidoCajaRecibida');
    if (!modal) return;

    document.getElementById('modalRecibidaFolioCaja').textContent = folioCaja;
    const cont = document.getElementById('modalRecibidaListaArticulos');
    if (cont) {
        if (!detalles || detalles.length === 0) {
            cont.innerHTML = `<div class="p-3 text-slate-400 italic text-center">Artículos ingresados al inventario de la tienda.</div>`;
        } else {
            cont.innerHTML = '';
            detalles.forEach(d => {
                const row = document.createElement('div');
                row.className = "flex items-center justify-between p-2 rounded-xl bg-white border border-slate-200/80";
                row.innerHTML = `
                    <div class="truncate mr-2">
                        <span class="font-mono font-bold text-slate-900">${d.clave}</span>
                        <span class="text-slate-600 ml-1.5">${d.nombre}</span>
                    </div>
                    <span class="font-mono font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-xs flex-shrink-0">
                        ${d.unidades} pzas
                    </span>
                `;
                cont.appendChild(row);
            });
        }
    }

    modal.classList.remove('hidden');
}

function cerrarModalContenidoRecibida() {
    document.getElementById('modalContenidoCajaRecibida')?.classList.add('hidden');
}
function cerrarModalContenidoCajaRecibida() {
    document.getElementById('modalContenidoCajaRecibida')?.classList.add('hidden');
}

// ================= MODAL DETALLE Y TIMELINE DE EMBARQUE =================
async function verDetalleEmbarqueModal(embId) {
    try {
        const res = await fetch(`/api/embarques/detalle/${embId}`);
        const data = await res.json();
        if (!data.success) {
            mostrarAlerta('error', 'No se pudo cargar el detalle del embarque.');
            return;
        }

        const emb = data.embarque;
        document.getElementById('modalDetalleEmbarqueFolioBadge').textContent = `FOLIO: #${emb.folio}`;
        document.getElementById('modalDetalleEmbarqueSubtitulo').textContent = `Destino: ${emb.destino_texto} • Estatus: ${emb.estatus} • Creado por: ${emb.creado_por || 'ADMIN'}`;

        // Cajas
        const tbodyCajas = document.getElementById('modalDetalleEmbarqueCajasBody');
        if (tbodyCajas) {
            tbodyCajas.innerHTML = '';
            (data.cajas || []).forEach(c => {
                const tr = document.createElement('tr');
                tr.className = "border-b border-slate-100 hover:bg-slate-50";
                tr.innerHTML = `
                    <td class="p-2.5 font-mono font-black text-slate-900">📦 ${c.folio_caja}</td>
                    <td class="p-2.5 text-center font-mono font-bold text-slate-800">${c.piezas_en_caja} pzs</td>
                    <td class="p-2.5 text-center font-bold text-xs">
                        <span class="px-2 py-0.5 rounded-full text-[10px] ${c.estatus === 'RECIBIDA' ? 'bg-emerald-100 text-emerald-800' : (c.estatus === 'EN_TRANSITO' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800')}">
                            ${c.estatus}
                        </span>
                    </td>
                    <td class="p-2.5 text-xs text-slate-600">${c.chofer_nombre || '--'}</td>
                    <td class="p-2.5 text-right">
                        <button type="button" onclick="cargarEtiquetaZebraPorFolio('${c.folio_caja}')" class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-blue-700 font-bold rounded-lg text-xs cursor-pointer">
                            🏷️ Etiqueta
                        </button>
                    </td>
                `;
                tbodyCajas.appendChild(tr);
            });
        }

        // Tracking Timeline
        const contTrack = document.getElementById('modalDetalleEmbarqueTrackingTimeline');
        if (contTrack) {
            contTrack.innerHTML = '';
            if (!data.tracking || data.tracking.length === 0) {
                contTrack.innerHTML = `<div class="text-xs text-slate-400 italic">Sin eventos de tracking registrados.</div>`;
            } else {
                data.tracking.forEach(t => {
                    const item = document.createElement('div');
                    item.className = "flex items-start gap-2.5 text-xs pb-2 border-b border-slate-100 last:border-0";
                    item.innerHTML = `
                        <span class="text-blue-500 font-bold mt-0.5">●</span>
                        <div>
                            <div class="font-bold text-slate-800">${t.descripcion}</div>
                            <div class="text-[10px] text-slate-400 font-mono">${t.fecha_hora} • Usuario: ${t.usuario}</div>
                        </div>
                    `;
                    contTrack.appendChild(item);
                });
            }
        }

        document.getElementById('modalDetalleEmbarque').classList.remove('hidden');
    } catch (e) {
        mostrarAlerta('error', 'Error al consultar detalle del embarque.');
    }
}

function cerrarModalDetalleEmbarque() {
    document.getElementById('modalDetalleEmbarque')?.classList.add('hidden');
}

// ================= SUBCAMBIO EN SUCURSALES =================
function cambiarSubTabSucursales(subTab = 'recepcion') {
    const recContent = document.getElementById('subSucRecepcionContent');
    const btnRec = document.getElementById('tabSubSucRecepcion');

    if (recContent) recContent.classList.remove('hidden');
    if (btnRec) {
        btnRec.className = "px-3.5 py-1.5 rounded-lg text-xs font-black transition flex items-center gap-1.5 bg-blue-600 text-white shadow-sm cursor-pointer";
    }

    cargarSelectSucursalesEmbarques().then(() => {
        cargarCajasPendientesSucursal();
    });
    setTimeout(() => document.getElementById('inputEscanerRecepcionCaja')?.focus(), 200);
}

