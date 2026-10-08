// ==========================================================================
// MÓDULO ADMINISTRACIÓN DEL BOT DE WHATSAPP (BC REFACCIONES)
// ==========================================================================

let botSubTabActiva = 'chats'; // 'chats', 'sucursales', 'menus'
let botConversacionesCache = [];
let botChatSeleccionado = null;
let botAutoRefreshTimer = null;
let botSucursalesCache = [];
let botMenusCache = {};

function inicializarModuloBotWhatsapp() {
    cargarEstadoBot();
    cambiarSubTabBot(botSubTabActiva);

    // Iniciar auto-refresco ligero para los chats cada 6 segundos si estamos en la vista
    if (botAutoRefreshTimer) clearInterval(botAutoRefreshTimer);
    botAutoRefreshTimer = setInterval(() => {
        const mod = document.getElementById('moduloBotWhatsappContent');
        if (mod && !mod.classList.contains('hidden') && botSubTabActiva === 'chats') {
            cargarConversacionesBot(false);
            if (botChatSeleccionado) {
                cargarDetalleChatBot(botChatSeleccionado, false);
            }
        }
    }, 6000);
}

// --------------------------------------------------------------------------
// 1. GESTIÓN DE SUB-PESTAÑAS
// --------------------------------------------------------------------------
function cambiarSubTabBot(tab) {
    botSubTabActiva = tab;

    const tabs = ['chats', 'sucursales', 'menus'];
    tabs.forEach(t => {
        const btn = document.getElementById(`botTabBtn_${t}`);
        const panel = document.getElementById(`botPanel_${t}`);
        if (btn && panel) {
            if (t === tab) {
                btn.className = "px-4 py-2 text-xs font-black rounded-xl bg-emerald-600 text-white shadow-md shadow-emerald-600/20 transition cursor-pointer";
                panel.classList.remove('hidden');
            } else {
                btn.className = "px-4 py-2 text-xs font-bold rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer";
                panel.classList.add('hidden');
            }
        }
    });

    if (tab === 'chats') {
        cargarConversacionesBot(true);
    } else if (tab === 'sucursales') {
        cargarConfigSucursalesBot();
    } else if (tab === 'menus') {
        cargarConfigMenusBot();
    }
}

// --------------------------------------------------------------------------
// 2. ESTADO DEL SERVICIO Y KPIs
// --------------------------------------------------------------------------
async function cargarEstadoBot() {
    try {
        const res = await fetch('/api/bot-admin/estado');
        const data = await res.json();
        if (data.success) {
            const badge = document.getElementById('botKpiStatusBadge');
            const dot = document.getElementById('botKpiStatusDot');
            const txt = document.getElementById('botKpiStatusText');

            if (data.bot_online) {
                if (badge) badge.className = "inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-extrabold";
                if (dot) dot.className = "w-2 h-2 rounded-full bg-emerald-500 animate-pulse";
                if (txt) txt.textContent = "Bot Online (Conectado)";
            } else {
                if (badge) badge.className = "inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-xs font-extrabold";
                if (dot) dot.className = "w-2 h-2 rounded-full bg-amber-500";
                if (txt) txt.textContent = "Bot Standby (Iniciando)";
            }

            const stats = data.estadisticas || {};
            const kpiConv = document.getElementById('botKpiTotalConv');
            const kpiHoy = document.getElementById('botKpiMensajesHoy');
            const kpiTotalMsg = document.getElementById('botKpiTotalMsg');
            const kpiPedidos = document.getElementById('botKpiPedidos');

            if (kpiConv) kpiConv.textContent = stats.total_conversaciones ?? 0;
            if (kpiHoy) kpiHoy.textContent = stats.mensajes_hoy ?? 0;
            if (kpiTotalMsg) kpiTotalMsg.textContent = stats.total_mensajes ?? 0;
            if (kpiPedidos) kpiPedidos.textContent = stats.pedidos_generados ?? 0;
        }
    } catch (e) {
        console.error("Error al obtener estado del bot:", e);
    }
}

// --------------------------------------------------------------------------
// 3. CONVERSACIONES EN VIVO (CHAT DE WHATSAPP)
// --------------------------------------------------------------------------
async function cargarConversacionesBot(mostrarCargando = true) {
    const contenedor = document.getElementById('botListaConversaciones');
    if (!contenedor) return;

    if (mostrarCargando && botConversacionesCache.length === 0) {
        contenedor.innerHTML = `
            <div class="p-8 text-center text-slate-400 text-xs italic">
                <div class="inline-block animate-spin w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full mb-2"></div>
                <div>Cargando conversaciones...</div>
            </div>`;
    }

    try {
        const res = await fetch('/api/bot-admin/conversaciones');
        const data = await res.json();
        if (data.success) {
            botConversacionesCache = data.conversaciones || [];
            renderizarListaConversaciones();
        }
    } catch (e) {
        console.error("Error cargando conversaciones:", e);
    }
}

function renderizarListaConversaciones() {
    const contenedor = document.getElementById('botListaConversaciones');
    const busqueda = (document.getElementById('botBuscarChatInput')?.value || '').toLowerCase().trim();
    if (!contenedor) return;

    const filtradas = botConversacionesCache.filter(c => {
        const tel = (c.usuario_id || '').toLowerCase();
        const nom = (c.nombre_cliente || '').toLowerCase();
        const msg = (c.ultimo_mensaje || '').toLowerCase();
        return tel.includes(busqueda) || nom.includes(busqueda) || msg.includes(busqueda);
    });

    if (filtradas.length === 0) {
        contenedor.innerHTML = `
            <div class="p-6 text-center text-slate-400 text-xs italic">
                No hay conversaciones registradas aún.
            </div>`;
        return;
    }

    contenedor.innerHTML = filtradas.map(c => {
        const esActivo = botChatSeleccionado === c.usuario_id;
        const nombreDisplay = c.nombre_cliente ? c.nombre_cliente : (c.usuario_id || 'Cliente');
        const telDisplay = c.usuario_id || 'Desconocido';
        const horaDisplay = c.ultima_interaccion ? c.ultima_interaccion.split(' ')[1]?.substring(0, 5) : '';
        const ultimoMsg = c.ultimo_mensaje || 'Sin mensajes';

        let badgeEstado = '';
        if (c.estado === 'ORDEN_GENERADA') {
            badgeEstado = `<span class="text-[9px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">Apartado ${c.folio_orden || ''}</span>`;
        } else if (c.estado === 'COTIZADO') {
            badgeEstado = `<span class="text-[9px] font-black px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">Cotizado</span>`;
        } else if (c.estado === 'ATENDIDO_ASESOR') {
            badgeEstado = `<span class="text-[9px] font-black px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">Asesor Humano</span>`;
        } else {
            badgeEstado = `<span class="text-[9px] font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">Consulta</span>`;
        }

        return `
            <div onclick="seleccionarChatBot('${c.usuario_id}')" 
                 class="p-3.5 border-b border-slate-100 cursor-pointer transition ${esActivo ? 'bg-emerald-50/80 border-l-4 border-l-emerald-600' : 'hover:bg-slate-50'}">
                <div class="flex items-start justify-between gap-2">
                    <div class="flex items-center gap-2.5 min-w-0">
                        <div class="w-9 h-9 rounded-full bg-slate-800 text-white flex items-center justify-center font-black text-xs flex-shrink-0">
                            ${nombreDisplay.charAt(0).toUpperCase()}
                        </div>
                        <div class="min-w-0">
                            <div class="font-bold text-xs text-slate-900 truncate">${nombreDisplay}</div>
                            <div class="text-[10px] text-slate-400 font-mono">${telDisplay}</div>
                        </div>
                    </div>
                    <span class="text-[10px] text-slate-400 font-medium flex-shrink-0">${horaDisplay}</span>
                </div>
                <div class="mt-2 text-xs text-slate-500 truncate leading-tight">
                    ${ultimoMsg}
                </div>
                <div class="mt-2 flex items-center justify-between gap-1">
                    <div>${badgeEstado}</div>
                    <span class="text-[10px] text-slate-400 font-semibold">${c.total_mensajes || 1} msgs</span>
                </div>
            </div>
        `;
    }).join('');
}

async function seleccionarChatBot(usuario_id) {
    botChatSeleccionado = usuario_id;
    renderizarListaConversaciones();
    await cargarDetalleChatBot(usuario_id, true);
}

async function cargarDetalleChatBot(usuario_id, scrollBottom = true) {
    const header = document.getElementById('botChatActivoHeader');
    const area = document.getElementById('botChatMensajesArea');
    const inputArea = document.getElementById('botChatInputArea');

    if (!header || !area) return;

    try {
        const res = await fetch(`/api/bot-admin/conversaciones/${usuario_id}`);
        const data = await res.json();
        if (!data.success) return;

        const conv = data.conversacion || {};
        const mensajes = data.mensajes || [];

        // Encabezado
        const nombreDisplay = conv.nombre_cliente ? conv.nombre_cliente : (conv.usuario_id || 'Cliente');
        const telDisplay = conv.usuario_id || '';
        const sucursal = conv.sucursal ? `📍 ${conv.sucursal}` : '';
        const folio = conv.folio_orden ? `Folio: <strong>${conv.folio_orden}</strong>` : '';

        header.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center font-black text-sm">
                    ${nombreDisplay.charAt(0).toUpperCase()}
                </div>
                <div>
                    <div class="flex items-center gap-2">
                        <h3 class="font-black text-sm text-slate-900">${nombreDisplay}</h3>
                        <span class="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">${conv.estado || 'ACTIVO'}</span>
                    </div>
                    <div class="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                        <span class="font-mono">${telDisplay}</span>
                        ${sucursal ? `<span>•</span> <span>${sucursal}</span>` : ''}
                        ${folio ? `<span>•</span> <span>${folio}</span>` : ''}
                    </div>
                </div>
            </div>
            <div class="flex items-center gap-2">
                <a href="https://wa.me/${telDisplay.replace(/[^0-9]/g, '')}" target="_blank" 
                   class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm transition">
                   <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
                   <span>Abrir en WhatsApp</span>
                </a>
            </div>
        `;

        if (inputArea) inputArea.classList.remove('hidden');

        // Renderizar Burbujas de chat
        area.innerHTML = mensajes.map(m => {
            const remitente = m.remitente || 'cliente';
            const hora = m.fecha_hora ? m.fecha_hora.split(' ')[1]?.substring(0, 5) : '';
            const textoFormateado = (m.texto || '')
                .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
                .replace(/_(.*?)_/g, '<em>$1</em>')
                .replace(/`(.*?)`/g, '<code class="bg-slate-200/70 text-slate-800 px-1 py-0.5 rounded text-[11px] font-mono">$1</code>')
                .replace(/\n/g, '<br>');

            if (remitente === 'cliente') {
                return `
                    <div class="flex items-start gap-2.5 max-w-[85%] sm:max-w-[75%]">
                        <div class="bg-white text-slate-800 p-3 rounded-2xl rounded-tl-none shadow-xs border border-slate-200 text-xs leading-relaxed space-y-1">
                            <div>${textoFormateado}</div>
                            <div class="text-[9px] text-slate-400 text-right font-medium">${hora}</div>
                        </div>
                    </div>
                `;
            } else if (remitente === 'asesor') {
                return `
                    <div class="flex items-start justify-end max-w-[85%] sm:max-w-[75%] ml-auto">
                        <div class="bg-indigo-600 text-white p-3 rounded-2xl rounded-tr-none shadow-md text-xs leading-relaxed space-y-1">
                            <div>${textoFormateado}</div>
                            <div class="text-[9px] text-indigo-200 text-right font-medium">${hora} • Asesor Humano</div>
                        </div>
                    </div>
                `;
            } else {
                // Mensaje enviado por el BOT
                return `
                    <div class="flex items-start justify-end max-w-[85%] sm:max-w-[75%] ml-auto">
                        <div class="bg-emerald-50 text-slate-900 border border-emerald-200 p-3.5 rounded-2xl rounded-tr-none shadow-xs text-xs leading-relaxed space-y-1">
                            <div class="flex items-center gap-1.5 text-[10px] font-bold text-emerald-800 pb-1 border-b border-emerald-100">
                                <span>🤖 Bot BC Refacciones</span>
                            </div>
                            <div>${textoFormateado}</div>
                            <div class="text-[9px] text-emerald-700 text-right font-medium">${hora}</div>
                        </div>
                    </div>
                `;
            }
        }).join('');

        if (scrollBottom) {
            area.scrollTop = area.scrollHeight;
        }
    } catch (e) {
        console.error("Error al cargar detalle del chat:", e);
    }
}

async function enviarIntervencionAsesor() {
    if (!botChatSeleccionado) {
        alert("Por favor selecciona un chat primero.");
        return;
    }

    const input = document.getElementById('botInputMensajeIntervencion');
    const mensaje = input ? input.value.trim() : '';
    if (!mensaje) return;

    try {
        const btn = document.getElementById('botBtnEnviarIntervencion');
        if (btn) btn.disabled = true;

        const res = await fetch(`/api/bot-admin/conversaciones/${botChatSeleccionado}/intervenir`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mensaje: mensaje,
                asesor: (typeof currentUser !== 'undefined' && currentUser?.nombre) ? currentUser.nombre : 'Asesor de Mostrador'
            })
        });

        const data = await res.json();
        if (data.success) {
            if (input) input.value = '';
            await cargarDetalleChatBot(botChatSeleccionado, true);
            await cargarConversacionesBot(false);
        } else {
            alert("No se pudo enviar el mensaje: " + (data.error || 'Error desconocido'));
        }
    } catch (e) {
        alert("Error de conexión al enviar mensaje: " + e.message);
    } finally {
        const btn = document.getElementById('botBtnEnviarIntervencion');
        if (btn) btn.disabled = false;
    }
}

// --------------------------------------------------------------------------
// 4. CONFIGURACIÓN DE SUCURSALES Y WHATSAPPS
// --------------------------------------------------------------------------
async function cargarConfigSucursalesBot() {
    const contenedor = document.getElementById('botSucursalesCardsGrid');
    if (!contenedor) return;

    contenedor.innerHTML = `
        <div class="col-span-full p-8 text-center text-slate-400 text-xs italic">
            <div class="inline-block animate-spin w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full mb-2"></div>
            <div>Cargando directorio de sucursales...</div>
        </div>`;

    try {
        const res = await fetch('/api/bot-admin/config/sucursales');
        const data = await res.json();
        if (data.success) {
            botSucursalesCache = data.sucursales || [];
            renderizarCardsSucursales();
        }
    } catch (e) {
        contenedor.innerHTML = `<div class="col-span-full p-6 text-center text-red-500 text-xs">Error cargando sucursales: ${e.message}</div>`;
    }
}

function renderizarCardsSucursales() {
    const contenedor = document.getElementById('botSucursalesCardsGrid');
    if (!contenedor) return;

    contenedor.innerHTML = botSucursalesCache.map((s, idx) => {
        const esAeropuerto = s.clave === 'AEROPUERTO';
        return `
            <div class="bg-white rounded-2xl border ${esAeropuerto ? 'border-emerald-300 ring-2 ring-emerald-500/20 shadow-md' : 'border-slate-200 shadow-sm'} p-4 space-y-3">
                <div class="flex items-start justify-between gap-2 pb-2 border-b border-slate-100">
                    <div>
                        <div class="flex items-center gap-2">
                            <h4 class="font-black text-sm text-slate-900">${s.nombre}</h4>
                            <span class="text-[9px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-bold">${s.clave}</span>
                        </div>
                        ${esAeropuerto ? '<span class="text-[10px] text-emerald-700 font-bold">⭐ Tu número personal configurado</span>' : ''}
                    </div>
                    <label class="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" onchange="actualizarSucursalCampo(${idx}, 'activo', this.checked)" ${s.activo ? 'checked' : ''} class="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500">
                        <span class="text-[10px] font-bold text-slate-500">Activo</span>
                    </label>
                </div>

                <div class="space-y-2 text-xs">
                    <div>
                        <label class="block text-[10px] font-extrabold uppercase text-slate-500 mb-0.5">💬 WhatsApp Directo</label>
                        <input type="text" value="${s.whatsapp || ''}" 
                               onchange="actualizarSucursalCampo(${idx}, 'whatsapp', this.value)"
                               placeholder="Ej. 8711044898"
                               class="w-full text-xs font-mono font-bold px-3 py-1.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-slate-50/50">
                    </div>

                    <div>
                        <label class="block text-[10px] font-extrabold uppercase text-slate-500 mb-0.5">📞 Teléfono Mostrador</label>
                        <input type="text" value="${s.telefono || ''}" 
                               onchange="actualizarSucursalCampo(${idx}, 'telefono', this.value)"
                               placeholder="Ej. 8717325500"
                               class="w-full text-xs font-mono px-3 py-1.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                    </div>

                    <div>
                        <label class="block text-[10px] font-extrabold uppercase text-slate-500 mb-0.5">👤 Nombre Asesor de Mostrador</label>
                        <input type="text" value="${s.contacto || ''}" 
                               onchange="actualizarSucursalCampo(${idx}, 'contacto', this.value)"
                               placeholder="Ej. Asesor Mostrador"
                               class="w-full text-xs px-3 py-1.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                    </div>

                    <div>
                        <label class="block text-[10px] font-extrabold uppercase text-slate-500 mb-0.5">📍 Dirección</label>
                        <input type="text" value="${s.direccion || ''}" 
                               onchange="actualizarSucursalCampo(${idx}, 'direccion', this.value)"
                               class="w-full text-xs px-3 py-1.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function actualizarSucursalCampo(index, campo, valor) {
    if (botSucursalesCache[index]) {
        botSucursalesCache[index][campo] = valor;
    }
}

async function guardarConfigSucursalesBot() {
    const btn = document.getElementById('botBtnGuardarSucursales');
    if (btn) {
        btn.disabled = true;
        btn.textContent = "Guardando...";
    }

    try {
        const res = await fetch('/api/bot-admin/config/sucursales', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(botSucursalesCache)
        });
        const data = await res.json();
        if (data.success) {
            alert("✅ ¡Directorio de sucursales y números de WhatsApp actualizados correctamente!");
            cargarConfigSucursalesBot();
        } else {
            alert("Error al guardar: " + (data.error || 'Desconocido'));
        }
    } catch (e) {
        alert("Error de red: " + e.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = "Guardar Cambios en Sucursales";
        }
    }
}

// --------------------------------------------------------------------------
// 5. CONFIGURACIÓN DE MENÚS Y TEXTOS
// --------------------------------------------------------------------------
async function cargarConfigMenusBot() {
    try {
        const res = await fetch('/api/bot-admin/config/menus');
        const data = await res.json();
        if (data.success) {
            botMenusCache = data.config || {};
            
            const b = document.getElementById('botCfgBienvenida');
            const asMsg = document.getElementById('botCfgMensajeAsesor');
            const iaAct = document.getElementById('botCfgIaActiva');

            if (b) b.value = botMenusCache.mensaje_bienvenida || '';
            if (asMsg) asMsg.value = botMenusCache.mensaje_asesor || '';
            if (iaAct) iaAct.checked = botMenusCache.ia_activa !== false;

            const ops = Array.isArray(botMenusCache.menu_opciones) ? botMenusCache.menu_opciones : [];
            for (let i = 1; i <= 5; i++) {
                const opObj = ops.find(o => String(o.opcion) === String(i)) || {};
                const titEl = document.getElementById(`botCfgOpTitulo_${i}`);
                const descEl = document.getElementById(`botCfgOpDesc_${i}`);
                if (titEl) titEl.value = opObj.titulo || '';
                if (descEl) descEl.value = opObj.descripcion || '';
            }
        }
    } catch (e) {
        console.error("Error cargando menús:", e);
    }
}

async function guardarConfigMenusBot() {
    const btn = document.getElementById('botBtnGuardarMenus');
    if (btn) {
        btn.disabled = true;
        btn.textContent = "Guardando...";
    }

    const ops = [];
    for (let i = 1; i <= 5; i++) {
        const tit = document.getElementById(`botCfgOpTitulo_${i}`)?.value || '';
        const desc = document.getElementById(`botCfgOpDesc_${i}`)?.value || '';
        ops.push({
            opcion: String(i),
            titulo: tit,
            descripcion: desc,
            activo: true
        });
    }

    const payload = {
        mensaje_bienvenida: document.getElementById('botCfgBienvenida')?.value || '',
        mensaje_asesor: document.getElementById('botCfgMensajeAsesor')?.value || '',
        ia_activa: document.getElementById('botCfgIaActiva') ? document.getElementById('botCfgIaActiva').checked : true,
        modelo_ia: botMenusCache.modelo_ia || 'gemini-3.5-flash-lite',
        menu_opciones: ops
    };

    try {
        const res = await fetch('/api/bot-admin/config/menus', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            alert("✅ ¡Textos de bienvenida y menús del Bot guardados exitosamente!");
        } else {
            alert("Error al guardar menús: " + (data.error || 'Desconocido'));
        }
    } catch (e) {
        alert("Error de conexión: " + e.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = "Guardar Menús y Textos";
        }
    }
}
