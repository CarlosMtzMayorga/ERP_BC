/**
 * Módulo Punto de Venta ERP BC Refaccionarias
 * Venta de mostrador, cotizaciones, consulta multi-almacén, catálogo vehicular y envío a caja Microsip.
 */

const PV_STATE = {
    clienteActual: null,
    vendedorActual: null,
    sucursalActualId: null,
    sucursalActualNombre: '',
    vendedorActualId: null,
    vendedorActualNombre: '',
    catalogoSucursales: [],
    catalogoVendedores: [],
    articulosEncontrados: [],
    carrito: [],
    observaciones: '',
    articuloModalActual: null,
    timerBusquedaCliente: null,
    timerBusquedaArticulo: null
};

// ================= INICIALIZACIÓN =================

function inicializarModuloPuntoVenta(forzar = false) {
    if (forzar) {
        pvDeseleccionarCliente();
        PV_STATE.carrito = [];
        PV_STATE.articulosEncontrados = [];
        pvActualizarCarritoUi();
        const inputArt = document.getElementById('pvInputBusquedaArticulo');
        if (inputArt) inputArt.value = '';
    }
    pvIniciarReloj();
    pvInicializarEventosCliente();
    pvCargarFiltrosVehicularesIniciales();
    pvCargarSucursalYVendedor();
    pvCargarArticulosIniciales();
}

function pvIniciarReloj() {
    function actualizarReloj() {
        const ahora = new Date();
        const fEl = document.getElementById('pvRelojFecha');
        const hEl = document.getElementById('pvRelojHora');
        if (fEl) {
            const anio = ahora.getFullYear();
            const mes = String(ahora.getMonth() + 1).padStart(2, '0');
            const dia = String(ahora.getDate()).padStart(2, '0');
            fEl.textContent = `${anio}-${mes}-${dia}`;
        }
        if (hEl) {
            hEl.textContent = ahora.toTimeString().split(' ')[0];
        }
    }
    actualizarReloj();
    setInterval(actualizarReloj, 1000);
}

async function pvCargarSucursalYVendedor() {
    if (!PV_STATE.catalogoSucursales || PV_STATE.catalogoSucursales.length === 0) {
        try {
            const res = await fetch('/api/catalogos/sucursales-vendedores');
            const data = await res.json();
            if (data.success) {
                PV_STATE.catalogoSucursales = data.sucursales || [];
                PV_STATE.catalogoVendedores = data.vendedores || [];
            }
        } catch (e) {
            console.error("Error al cargar sucursales y vendedores:", e);
        }
    }

    const u = (typeof currentUser !== 'undefined') ? currentUser : null;
    const esAdmin = u && (u.rol === 'ADMIN' || (Array.isArray(u.permisos) && u.permisos.includes('*')));

    if (u && u.sucursal_id) {
        PV_STATE.sucursalActualId = u.sucursal_id;
        PV_STATE.sucursalActualNombre = u.sucursal_nombre || 'Sucursal Asignada';
    } else if (PV_STATE.catalogoSucursales && PV_STATE.catalogoSucursales.length > 0) {
        const sucDef = PV_STATE.catalogoSucursales.find(s => s.nombre.toUpperCase().includes('CEDIS')) || PV_STATE.catalogoSucursales[0];
        PV_STATE.sucursalActualId = sucDef.id;
        PV_STATE.sucursalActualNombre = sucDef.nombre;
    }

    if (u && u.vendedor_id) {
        PV_STATE.vendedorActualId = u.vendedor_id;
        PV_STATE.vendedorActualNombre = u.vendedor_nombre || u.nombre;
    } else {
        PV_STATE.vendedorActualNombre = u ? (u.nombre || u.usuario) : 'Vendedor Mostrador';
    }

    pvActualizarUiSucursalYVendedor(esAdmin);
}

function pvActualizarUiSucursalYVendedor(esAdmin) {
    const wrapSel = document.getElementById('pvWrapSelectorSucursal');
    const txtFija = document.getElementById('pvTxtSucursalFija');
    const elNom = document.getElementById('pvTxtVendedorNombre');
    const selSuc = document.getElementById('pvSelectSucursalOperacion');

    if (elNom) elNom.textContent = PV_STATE.vendedorActualNombre || 'Vendedor Mostrador';

    if (esAdmin && wrapSel && selSuc && PV_STATE.catalogoSucursales && PV_STATE.catalogoSucursales.length > 0) {
        wrapSel.classList.remove('hidden');
        if (txtFija) txtFija.classList.add('hidden');
        selSuc.innerHTML = PV_STATE.catalogoSucursales.map(s => 
            `<option value="${s.id}" ${s.id === PV_STATE.sucursalActualId ? 'selected' : ''}>${s.nombre}</option>`
        ).join('');
    } else {
        if (wrapSel) wrapSel.classList.add('hidden');
        if (txtFija) {
            txtFija.classList.remove('hidden');
            txtFija.textContent = PV_STATE.sucursalActualNombre || 'Sucursal Principal';
        }
    }
}

function pvCambiarSucursalOperacion(sucId) {
    if (!sucId) return;
    const suc = (PV_STATE.catalogoSucursales || []).find(s => String(s.id) === String(sucId));
    if (suc) {
        PV_STATE.sucursalActualId = suc.id;
        PV_STATE.sucursalActualNombre = suc.nombre;
        
        // Auto-seleccionar vendedor que coincida con la sucursal seleccionada
        const palabras = suc.nombre.replace("SUCURSAL", "").replace("NO UTILIZAR", "").trim().split(/\s+/).filter(w => w.length > 3);
        let matchV = null;
        if (PV_STATE.catalogoVendedores) {
            for (let p of palabras) {
                matchV = PV_STATE.catalogoVendedores.find(v => v.nombre.toUpperCase().includes(p.toUpperCase()));
                if (matchV) break;
            }
        }
        if (matchV) {
            PV_STATE.vendedorActualId = matchV.id;
            PV_STATE.vendedorActualNombre = matchV.nombre;
            const elNom = document.getElementById('pvTxtVendedorNombre');
            if (elNom) elNom.textContent = matchV.nombre;
        }

        // Si hay una búsqueda activa, refrescar para consultar stock local de la nueva sucursal
        const inputArt = document.getElementById('pvInputBusquedaArticulo');
        if (inputArt && inputArt.value.trim()) {
            pvEjecutarBusquedaArticulos();
        }
    }
}

// ================= GESTIÓN DE CLIENTES Y CRÉDITO =================

function pvInicializarEventosCliente() {
    const input = document.getElementById('pvInputCliente');
    const dropdown = document.getElementById('pvDropdownClientes');
    if (!input || !dropdown) return;

    input.addEventListener('input', function() {
        const q = this.value.trim();
        clearTimeout(PV_STATE.timerBusquedaCliente);
        if (q.length < 2) {
            dropdown.classList.add('hidden');
            return;
        }
        PV_STATE.timerBusquedaCliente = setTimeout(() => {
            pvBuscarClientesApi(q);
        }, 200);
    });

    document.addEventListener('click', function(e) {
        if (!input.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.add('hidden');
        }
    });
}

async function pvBuscarClientesApi(q) {
    const dropdown = document.getElementById('pvDropdownClientes');
    if (!dropdown) return;
    try {
        const res = await fetch(`/api/pv/clientes/buscar?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (data.success && data.clientes && data.clientes.length > 0) {
            dropdown.innerHTML = data.clientes.map(c => `
                <div class="p-2.5 hover:bg-slate-50 cursor-pointer transition flex items-center justify-between"
                     onclick='pvSeleccionarCliente(${JSON.stringify(c).replace(/'/g, "&apos;")})'>
                    <div>
                        <div class="font-bold text-slate-900">${c.nombre}</div>
                        <div class="text-[10px] text-slate-500">${c.tipo_cliente} &bull; ${c.forma_cobro}</div>
                    </div>
                    <div class="text-right text-[10px]">
                        <span class="font-semibold text-slate-400">Límite:</span>
                        <span class="font-bold text-slate-700">${formatearMoneda(c.limite_credito)}</span>
                    </div>
                </div>
            `).join('');
            dropdown.classList.remove('hidden');
        } else {
            dropdown.innerHTML = `<div class="p-3 text-center text-slate-400 italic">No se encontraron clientes</div>`;
            dropdown.classList.remove('hidden');
        }
    } catch (e) {
        dropdown.classList.add('hidden');
    }
}

function pvBuscarClienteManual() {
    const input = document.getElementById('pvInputCliente');
    if (input && input.value.trim()) {
        pvBuscarClientesApi(input.value.trim());
    } else if (input) {
        input.focus();
    }
}

async function pvSeleccionarCliente(clienteSimple) {
    const dropdown = document.getElementById('pvDropdownClientes');
    if (dropdown) dropdown.classList.add('hidden');

    try {
        const res = await fetch(`/api/pv/clientes/detalle/${clienteSimple.id}`);
        const data = await res.json();
        if (data.success && data.cliente) {
            PV_STATE.clienteActual = data.cliente;
            pvActualizarUiCliente(data.cliente);
        }
    } catch (e) {
        console.error("Error al obtener detalle del cliente:", e);
    }
}

function pvActualizarUiCliente(cli) {
    const boxBusq = document.getElementById('pvBoxBusquedaCliente');
    const boxSel = document.getElementById('pvBoxClienteSeleccionado');
    const txtNom = document.getElementById('pvClienteNombre');
    const bTabla = document.getElementById('pvBadgeTablaAsignada');
    const bCobro = document.getElementById('pvBadgeFormaCobro');

    if (boxBusq) boxBusq.classList.add('hidden');
    if (boxSel) boxSel.classList.remove('hidden');
    if (txtNom) txtNom.textContent = cli.nombre;
    if (bTabla) bTabla.textContent = `Tabla Asignada: ${cli.tabla_asignada}`;
    if (bCobro) bCobro.textContent = `FORMA DE COBRO: ${cli.forma_cobro}`;

    // Tarjetas de Crédito
    const cardLim = document.getElementById('pvCardLimiteCredito');
    const cardVenc = document.getElementById('pvCardSaldoVencido');
    const cardSal = document.getElementById('pvCardSaldoCliente');
    const cardDisp = document.getElementById('pvCardSaldoDisponible');

    pvActualizarBadgeSaldo(cardLim, cli.limite_credito, 'limite');
    pvActualizarBadgeSaldo(cardVenc, cli.saldo_vencido, 'vencido');
    pvActualizarBadgeSaldo(cardSal, cli.saldo_cliente, 'saldo');
    pvActualizarBadgeSaldo(cardDisp, cli.saldo_disponible, 'disponible');
}

function pvActualizarBadgeSaldo(el, valor, tipo) {
    if (!el) return;
    const num = parseFloat(valor || 0);
    const txt = formatearMoneda(num);
    el.textContent = txt;
    el.title = `${txt}`;

    // Tipografía adaptativa para garantizar que NUNCA se corte la cifra
    let fontClass = 'text-xs xl:text-sm';
    if (txt.length >= 13) {
        fontClass = 'text-[9.5px] xl:text-[10.5px]';
    } else if (txt.length >= 11) {
        fontClass = 'text-[10.5px] xl:text-xs';
    } else if (txt.length >= 9) {
        fontClass = 'text-[11.5px] xl:text-xs';
    }

    let colorClass = 'text-slate-800';
    if (tipo === 'vencido') {
        colorClass = num > 0 ? 'text-rose-600 font-extrabold' : 'text-slate-800';
    } else if (tipo === 'disponible') {
        colorClass = num > 0 ? 'text-emerald-700 font-extrabold' : (num < 0 ? 'text-rose-600 font-extrabold' : 'text-slate-700');
    }

    el.className = `${fontClass} font-black mt-0.5 whitespace-nowrap tabular-nums tracking-tight leading-none ${colorClass}`;
}

function pvDeseleccionarCliente() {
    PV_STATE.clienteActual = null;
    const boxBusq = document.getElementById('pvBoxBusquedaCliente');
    const boxSel = document.getElementById('pvBoxClienteSeleccionado');
    const input = document.getElementById('pvInputCliente');

    if (boxBusq) boxBusq.classList.remove('hidden');
    if (boxSel) boxSel.classList.add('hidden');
    if (input) {
        input.value = '';
    }

    // Resetear tarjetas a '$0.00'
    pvActualizarBadgeSaldo(document.getElementById('pvCardLimiteCredito'), 0, 'limite');
    pvActualizarBadgeSaldo(document.getElementById('pvCardSaldoVencido'), 0, 'vencido');
    pvActualizarBadgeSaldo(document.getElementById('pvCardSaldoCliente'), 0, 'saldo');
    pvActualizarBadgeSaldo(document.getElementById('pvCardSaldoDisponible'), 0, 'disponible');
}

// ================= CATÁLOGO VEHICULAR Y FILTROS =================

async function pvCargarFiltrosVehicularesIniciales() {
    // 1. Años (2026 a 1985)
    const selAnio = document.getElementById('pvFiltroAnio');
    if (selAnio) {
        let opts = '<option value="">Selecciona un año</option>';
        for (let y = 2026; y >= 1990; y--) {
            opts += `<option value="${y}">${y}</option>`;
        }
        selAnio.innerHTML = opts;
    }

    // 2. Marcas desde GLOBALVEHICULOS
    const selMarca = document.getElementById('pvFiltroMarca');
    if (selMarca) {
        try {
            const res = await fetch('/api/pv/vehiculos/marcas');
            const data = await res.json();
            if (data.success && data.marcas) {
                selMarca.innerHTML = '<option value="">Selecciona una marca</option>' +
                    data.marcas.map(m => `<option value="${m.nombre}" data-id="${m.id}">${m.nombre}</option>`).join('');
            }
        } catch (e) {
            console.error("Error al cargar marcas:", e);
        }
    }
}

async function pvAlCambiarMarca() {
    const selMarca = document.getElementById('pvFiltroMarca');
    const selModelo = document.getElementById('pvFiltroModelo');
    const selSub = document.getElementById('pvFiltroSubmodelo');
    const selMotor = document.getElementById('pvFiltroMotor');

    if (!selMarca || !selModelo) return;
    const marca = selMarca.value;

    selModelo.innerHTML = '<option value="">Cargando modelos...</option>';
    if (selSub) selSub.innerHTML = '<option value="">Selecciona un submodelo</option>';
    if (selMotor) selMotor.innerHTML = '<option value="">Todos</option>';

    if (!marca) {
        selModelo.innerHTML = '<option value="">Selecciona un modelo</option>';
        pvActualizarBarraFiltrosInfo();
        return;
    }

    try {
        const opt = selMarca.options[selMarca.selectedIndex];
        const idMarca = opt ? opt.getAttribute('data-id') : '';
        const res = await fetch(`/api/pv/vehiculos/modelos?id_marca=${idMarca}&marca=${encodeURIComponent(marca)}`);
        const data = await res.json();
        if (data.success && data.modelos) {
            selModelo.innerHTML = '<option value="">Selecciona un modelo</option>' +
                data.modelos.map(m => `<option value="${m.nombre}" data-id="${m.id}">${m.nombre}</option>`).join('');
        }
    } catch (e) {
        selModelo.innerHTML = '<option value="">Error al cargar</option>';
    }

    pvActualizarBarraFiltrosInfo();
}

async function pvAlCambiarModelo() {
    const selModelo = document.getElementById('pvFiltroModelo');
    const selSub = document.getElementById('pvFiltroSubmodelo');
    const selMotor = document.getElementById('pvFiltroMotor');
    if (!selModelo || !selSub) return;

    const opt = selModelo.options[selModelo.selectedIndex];
    const idModelo = opt ? opt.getAttribute('data-id') : '';
    const modelo = selModelo.value;

    if (!idModelo) {
        selSub.innerHTML = '<option value="">Selecciona un submodelo</option>';
        pvActualizarBarraFiltrosInfo();
        return;
    }

    try {
        const [resSub, resAnios] = await Promise.all([
            fetch(`/api/pv/vehiculos/submodelos?modelo_id=${idModelo}&modelo=${encodeURIComponent(modelo)}`),
            fetch(`/api/pv/vehiculos/anios-motores?modelo_id=${idModelo}`)
        ]);

        const dataSub = await resSub.json();
        const dataAnios = await resAnios.json();

        if (dataSub.success && dataSub.submodelos) {
            selSub.innerHTML = '<option value="">Selecciona un submodelo</option>' +
                dataSub.submodelos.map(s => `<option value="${s.nombre}" data-id="${s.id}">${s.nombre}</option>`).join('');
        }

        if (dataAnios.success && dataAnios.motores && selMotor) {
            selMotor.innerHTML = '<option value="">Todos</option>' +
                dataAnios.motores.map(m => `<option value="${m}">${m}</option>`).join('');
        }

        // Cargar familias de productos dinámicas existentes para este vehículo
        const selMarca = document.getElementById('pvFiltroMarca');
        const marca = selMarca ? selMarca.value : '';
        const anio = document.getElementById('pvFiltroAnio')?.value || '';
        
        try {
            const resProd = await fetch(`/api/pv/vehiculos/productos?marca=${encodeURIComponent(marca)}&modelo=${encodeURIComponent(modelo)}&anio=${encodeURIComponent(anio)}`);
            const dataProd = await resProd.json();
            const selProd = document.getElementById('pvFiltroProducto');
            if (selProd && dataProd.success && dataProd.productos && dataProd.productos.length > 0) {
                const prodActual = selProd.value;
                let opts = '<option value="">Todas las familias</option>';
                dataProd.productos.forEach(p => {
                    const iconP = p.toUpperCase().includes('AMORTIGUADOR') ? '🔩 ' :
                                  p.toUpperCase().includes('ACUMULADOR') ? '🔋 ' :
                                  p.toUpperCase().includes('FILTRO') ? '🛢️ ' :
                                  p.toUpperCase().includes('BALERO') || p.toUpperCase().includes('MAZA') ? '💿 ' :
                                  p.toUpperCase().includes('SOPORTE') ? '🧱 ' :
                                  p.toUpperCase().includes('ROTULA') || p.toUpperCase().includes('HORQUILLA') ? '🚗 ' :
                                  p.toUpperCase().includes('TERMINAL') ? '🧭 ' : '⚙️ ';
                    opts += `<option value="${p}">${iconP}${p}</option>`;
                });
                selProd.innerHTML = opts;
                if (prodActual) selProd.value = prodActual;
            }
        } catch (eProd) {
            console.error("Aviso al cargar productos vehiculares:", eProd);
        }
    } catch (e) {
        console.error("Error al cargar submodelos:", e);
    }

    pvActualizarBarraFiltrosInfo();
}

function pvAlCambiarSubmodelo() {
    pvActualizarBarraFiltrosInfo();
}

function pvAlCambiarFiltroVehicular() {
    pvActualizarBarraFiltrosInfo();
}

function pvActualizarBarraFiltrosInfo() {
    const elInfo = document.getElementById('pvInfoFiltrosActivos');
    if (!elInfo) return;

    const anio = document.getElementById('pvFiltroAnio')?.value || '';
    const marca = document.getElementById('pvFiltroMarca')?.value || '';
    const modelo = document.getElementById('pvFiltroModelo')?.value || '';
    const sub = document.getElementById('pvFiltroSubmodelo')?.value || '';
    const motor = document.getElementById('pvFiltroMotor')?.value || '';
    const prod = document.getElementById('pvFiltroProducto')?.value || '';

    const filtros = [];
    if (anio) filtros.push(`Año: ${anio}`);
    if (marca) filtros.push(`Marca: ${marca}`);
    if (modelo) filtros.push(`Modelo: ${modelo}`);
    if (sub) filtros.push(`Submodelo: ${sub}`);
    if (motor) filtros.push(`Motor: ${motor}`);
    if (prod) filtros.push(`Familia: ${prod}`);

    if (filtros.length > 0) {
        elInfo.innerHTML = `Filtros: <span class="font-bold text-slate-800">${filtros.join(' | ')}</span> &bull; <span class="text-indigo-600 font-bold">Haz clic en 'Buscar' o presiona Enter para consultar.</span>`;
    } else {
        elInfo.textContent = 'Selecciona un vehículo o escribe un código para iniciar la consulta.';
    }
}

// ================= CATÁLOGO DE ARTÍCULOS =================

async function pvCargarArticulosIniciales() {
    // Al abrir el punto de venta NO se muestran artículos si no se ha buscado nada
    PV_STATE.articulosEncontrados = [];
    pvRenderizarGridArticulos([]);
    const cEl = document.getElementById('pvConteoArticulosEncontrados');
    if (cEl) cEl.textContent = '0';
}

function pvLimpiarFiltrosVehiculares() {
    ['pvFiltroAnio', 'pvFiltroMarca', 'pvFiltroModelo', 'pvFiltroSubmodelo', 'pvFiltroMotor', 'pvFiltroProducto'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const selMod = document.getElementById('pvFiltroModelo');
    if (selMod) selMod.innerHTML = '<option value="">Todos los modelos</option>';
    const selSub = document.getElementById('pvFiltroSubmodelo');
    if (selSub) selSub.innerHTML = '<option value="">Cualquier versión</option>';
    const selMot = document.getElementById('pvFiltroMotor');
    if (selMot) selMot.innerHTML = '<option value="">Cualquier motor</option>';
    const selProd = document.getElementById('pvFiltroProducto');
    if (selProd) {
        selProd.innerHTML = `
            <option value="">Todas las familias</option>
            <option value="AMORTIGUADOR">🔩 Amortiguadores</option>
            <option value="ACUMULADOR">🔋 Acumuladores</option>
            <option value="FILTRO">🛢️ Filtros</option>
            <option value="BUJIA">⚡ Bujías</option>
            <option value="BALATA">🛑 Frenos / Balatas</option>
            <option value="SUSPENSION">🚗 Suspensión</option>
            <option value="DIRECCION">🧭 Dirección</option>
            <option value="SOPORTE">🧱 Soportes</option>
            <option value="ACEITE">🧪 Aceites</option>
            <option value="BANDA">🔄 Bandas</option>
            <option value="MAZA">💿 Mazas y Baleros</option>
        `;
    }

    const input = document.getElementById('pvInputBusquedaArticulo');
    if (input) input.value = '';
    const btnClear = document.getElementById('pvBtnLimpiarBusqArt');
    if (btnClear) btnClear.classList.add('hidden');
    pvActualizarBarraFiltrosInfo();
    pvCargarArticulosIniciales();
}

async function pvEjecutarBusquedaArticulos(terminoForzado) {
    const input = document.getElementById('pvInputBusquedaArticulo');
    const q = (terminoForzado !== undefined) ? terminoForzado : (input ? input.value.trim() : '');
    const anio = document.getElementById('pvFiltroAnio')?.value || '';
    const marca = document.getElementById('pvFiltroMarca')?.value || '';
    const modelo = document.getElementById('pvFiltroModelo')?.value || '';
    const submodelo = document.getElementById('pvFiltroSubmodelo')?.value || '';
    const motor = document.getElementById('pvFiltroMotor')?.value || '';
    const producto = document.getElementById('pvFiltroProducto')?.value || '';

    const btnClear = document.getElementById('pvBtnLimpiarBusqArt');
    if (btnClear) btnClear.classList.toggle('hidden', !q);

    // Si no hay término ni filtros seleccionados, NO mostrar nada y dejar el placeholder limpio
    if (!q && !anio && !marca && !modelo && !submodelo && !motor && !producto) {
        PV_STATE.articulosEncontrados = [];
        pvRenderizarGridArticulos([]);
        const cEl = document.getElementById('pvConteoArticulosEncontrados');
        if (cEl) cEl.textContent = '0';
        return;
    }

    const grid = document.getElementById('pvGridArticulos');
    if (grid) {
        grid.innerHTML = `
            <div class="col-span-full bg-white p-12 text-center rounded-3xl border border-slate-200">
                <div class="animate-spin text-3xl mb-2">⚙️</div>
                <div class="text-sm font-bold text-slate-700">Buscando refacciones en catálogo...</div>
                <div class="text-xs text-slate-400 mt-1">Consultando existencias del Grupo y equivalencias</div>
            </div>
        `;
    }

    try {
        const query = new URLSearchParams();
        if (q) query.append('q', q);
        if (anio) query.append('anio', anio);
        if (marca) query.append('marca', marca);
        if (modelo) query.append('modelo', modelo);
        if (submodelo) query.append('submodelo', submodelo);
        if (motor) query.append('motor', motor);
        if (producto) query.append('producto', producto);
        if (PV_STATE.sucursalActualId) query.append('almacen_id', PV_STATE.sucursalActualId);

        const res = await fetch(`/api/pv/articulos/buscar?${query.toString()}`);
        const data = await res.json();

        if (data.success && data.articulos) {
            PV_STATE.articulosEncontrados = data.articulos;
            pvRenderizarGridArticulos(data.articulos);

            const cEl = document.getElementById('pvConteoArticulosEncontrados');
            if (cEl) cEl.textContent = data.articulos.length;
        } else {
            pvRenderizarGridArticulos([]);
            const cEl = document.getElementById('pvConteoArticulosEncontrados');
            if (cEl) cEl.textContent = '0';
        }
    } catch (e) {
        console.error("Error al buscar artículos:", e);
        if (grid) {
            grid.innerHTML = `<div class="col-span-full p-8 text-center text-red-500 font-bold text-xs bg-white rounded-2xl border border-red-200">Error al consultar el catálogo de artículos.</div>`;
        }
    }
}

function pvLimpiarBusquedaArticulos() {
    const input = document.getElementById('pvInputBusquedaArticulo');
    if (input) {
        input.value = '';
        input.focus();
    }
    const btnClear = document.getElementById('pvBtnLimpiarBusqArt');
    if (btnClear) btnClear.classList.add('hidden');
    pvEjecutarBusquedaArticulos('');
}

function pvRenderizarGridArticulos(articulos) {
    const grid = document.getElementById('pvGridArticulos');
    if (!grid) return;

    const input = document.getElementById('pvInputBusquedaArticulo');
    const anio = document.getElementById('pvFiltroAnio')?.value || '';
    const marca = document.getElementById('pvFiltroMarca')?.value || '';
    const modelo = document.getElementById('pvFiltroModelo')?.value || '';
    const prod = document.getElementById('pvFiltroProducto')?.value || '';
    const qVal = input ? input.value.trim().toUpperCase() : '';

    const hayBusqueda = qVal || anio || marca || modelo || prod;

    if (!articulos || articulos.length === 0) {
        if (!hayBusqueda) {
            grid.innerHTML = `
                <div class="col-span-full bg-slate-50/70 border-2 border-dashed border-slate-200 p-12 text-center rounded-3xl">
                    <div class="w-16 h-16 mx-auto mb-3 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-3xl shadow-xs">
                        🔍
                    </div>
                    <h3 class="text-base font-black text-slate-800">Catálogo de Mostrador Listo</h3>
                    <p class="text-xs text-slate-500 max-w-md mx-auto mt-1 leading-relaxed">
                        Escribe un código, descripción o equivalente arriba, o selecciona los filtros de vehículo y presiona 'Buscar'.
                    </p>
                </div>
            `;
        } else {
            const esBujia = prod === 'BUJIA' || qVal.includes('BUJIA');
            const esFiltro = prod === 'FILTRO' || qVal.includes('FILTRO');
            const esAcum = prod === 'ACUMULADOR' || qVal.includes('ACUMULADOR') || qVal.includes('BATERIA');

            let iconMsg = '📦';
            let titleMsg = 'Sin coincidencias encontradas';
            let descMsg = 'No se encontraron artículos con los criterios seleccionados. Verifica la clave o intenta una búsqueda más amplia.';

            if (esBujia) {
                iconMsg = '⚡';
                titleMsg = 'No se encontraron bujías para este criterio';
                descMsg = 'No hay bujías específicas catalogadas para este modelo en la aplicación vehicular. Prueba buscando directamente por código de bujía (ej. NGK, Champion, Bosch) o borra el filtro de vehículo para ver bujías universales.';
            } else if (esFiltro) {
                iconMsg = '🛢️';
                titleMsg = 'No se encontraron filtros para este criterio';
                descMsg = 'Verifica que el año y modelo correspondan a las aplicaciones disponibles en catálogo.';
            } else if (esAcum) {
                iconMsg = '🔋';
                titleMsg = 'No se encontraron acumuladores para este criterio';
                descMsg = 'Verifica el tamaño de grupo o código de batería (ej. G-47, G-24, G-34) en la barra de búsqueda.';
            }

            grid.innerHTML = `
                <div class="col-span-full bg-slate-50/70 border-2 border-dashed border-slate-200 p-12 text-center rounded-3xl">
                    <div class="w-16 h-16 mx-auto mb-3 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center text-3xl shadow-xs">
                        ${iconMsg}
                    </div>
                    <h3 class="text-base font-black text-slate-800">${titleMsg}</h3>
                    <p class="text-xs text-slate-500 max-w-md mx-auto mt-1 leading-relaxed">
                        ${descMsg}
                    </p>
                </div>
            `;
        }
        return;
    }

    grid.innerHTML = articulos.map(art => {
        const nomUp = art.nombre.toUpperCase();
        const esBateria = art.clave.startsWith('G-') || art.clave.startsWith('CH-') || nomUp.includes('ACUMULADOR');
        const esAmort = nomUp.includes('AMORTIGUADOR');
        const esFiltro = art.clave.startsWith('GP-') || art.clave.startsWith('GA-') || nomUp.includes('FILTRO');
        const esBujia = nomUp.includes('BUJIA') || nomUp.includes('BUJÍA');
        const esFreno = nomUp.includes('BALATA') || nomUp.includes('FRENO');
        const iconSvg = esBateria ? '🔋' : esAmort ? '🔩' : esFiltro ? '🛢️' : esBujia ? '⚡' : esFreno ? '🛑' : '⚙️';

        const tieneFoto = !!(art.tiene_foto && art.foto_url);
        const fotoHtml = tieneFoto
            ? `<img src="${art.foto_url}" alt="${art.clave}" loading="lazy" class="w-full h-full object-contain p-1 rounded-xl transition duration-200 group-hover:scale-105" onerror="this.onerror=null; this.parentElement.innerHTML='<span class=\'text-2xl\'>${iconSvg}</span>';">`
            : `<span class="text-2xl">${iconSvg}</span>`;

        return `
            <div class="bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-md hover:border-indigo-400 transition-all duration-200 p-2.5 flex flex-col justify-between group">
                <div>
                    <!-- Fila Superior: Foto (izquierda) + Clave, Marca, Detalle y Nombre (derecha) -->
                    <div class="flex items-start gap-2.5">
                        <!-- Miniatura de Foto / Icono (Compacta y nítida) -->
                        <div class="w-16 h-16 sm:w-20 sm:h-20 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-center shrink-0 overflow-hidden relative cursor-pointer" onclick="pvAbrirModalDetalle('${art.clave}')" title="Ver foto y existencias ampliadas">
                            ${fotoHtml}
                        </div>

                        <!-- Info: Clave, Marca, Equivalencia y Nombre -->
                        <div class="min-w-0 flex-1">
                            <div class="flex items-center justify-between gap-1">
                                <div class="flex items-center gap-1 min-w-0">
                                    <span class="text-xs sm:text-sm font-black text-slate-900 group-hover:text-indigo-600 transition tracking-tight truncate">${art.clave}</span>
                                    <span class="text-[8px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200 shrink-0">${art.marca || 'GEN'}</span>
                                </div>
                                <button type="button" onclick="pvAbrirModalDetalle('${art.clave}')" title="Ver existencias multi-almacén y equivalencias"
                                        class="h-7 w-7 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-500 flex items-center justify-center text-[10px] transition cursor-pointer active:scale-95 shrink-0">
                                    🔍
                                </button>
                            </div>

                            <!-- Nombre / Descripción bien visible y legible -->
                            <h4 class="text-[11px] sm:text-xs font-semibold text-slate-700 line-clamp-2 leading-tight mt-1" title="${art.nombre}">
                                ${art.nombre}
                            </h4>

                            ${art.equivalencia ? `
                                <div class="text-[9px] text-slate-400 font-mono truncate mt-0.5" title="Equivalencia: ${art.equivalencia}">
                                    Eq: ${art.equivalencia}
                                </div>
                            ` : ''}
                        </div>
                    </div>

                    <!-- Fila de Existencias (Compacta en 3 pastillas) -->
                    <div class="grid grid-cols-3 gap-1 text-[9px] mt-2">
                        <div class="px-1.5 py-1 rounded-lg border text-center ${art.stock_local > 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-700'}">
                            <div class="font-bold uppercase text-[7px] truncate ${art.stock_local > 0 ? 'text-emerald-700' : 'text-rose-600'}">Tu Almacén</div>
                            <div class="font-black text-[11px] leading-tight">${art.stock_local}</div>
                        </div>
                        <div class="px-1.5 py-1 rounded-lg border text-center ${(art.stock_cedis || 0) > 0 ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-slate-50 border-slate-100 text-slate-400'}">
                            <div class="font-bold uppercase text-[7px] truncate ${(art.stock_cedis || 0) > 0 ? 'text-amber-700' : 'text-slate-400'}">CEDIS</div>
                            <div class="font-black text-[11px] leading-tight">${art.stock_cedis || 0}</div>
                        </div>
                        <div class="px-1.5 py-1 rounded-lg border border-slate-100 bg-slate-50 text-center">
                            <div class="text-slate-400 font-bold uppercase text-[7px] truncate">Global</div>
                            <div class="font-black text-slate-800 text-[11px] leading-tight">${art.stock_global}</div>
                        </div>
                    </div>
                </div>

                <!-- Footer Card: Precio y Botón de Acción -->
                <div class="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between gap-1.5">
                    <div>
                        <div class="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Precio Unitario</div>
                        <div class="text-sm sm:text-base font-black text-slate-900 leading-tight">${formatearMoneda(art.precio)}</div>
                    </div>
                    ${art.stock_local > 0 ? `
                        <button type="button" onclick='pvAgregarAlCarrito(${JSON.stringify(art).replace(/'/g, "&apos;")})'
                                class="h-8 px-3 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition shadow-sm cursor-pointer flex items-center gap-1 shrink-0">
                            <span>➕</span>
                            <span>Agregar</span>
                        </button>
                    ` : (art.stock_cedis && art.stock_cedis > 0) ? `
                        <button type="button" onclick='pvAbrirModalSolicitarTraspasoCedis(${JSON.stringify(art).replace(/'/g, "&apos;")})'
                                class="h-8 px-2.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-black text-[10px] uppercase tracking-wider rounded-xl transition shadow-sm cursor-pointer flex items-center gap-1 shrink-0"
                                title="Sin existencias locales. Solicitar traspaso a CEDIS">
                            <span>🚚</span>
                            <span>Pedir a CEDIS</span>
                        </button>
                    ` : `
                        <button type="button" disabled
                                class="h-8 px-2.5 bg-slate-100 text-slate-400 font-bold text-[10px] uppercase tracking-wider rounded-xl border border-slate-200 cursor-not-allowed flex items-center gap-1 shrink-0"
                                title="Agotado en tu sucursal y en CEDIS">
                            <span>✕</span>
                            <span>Sin Stock</span>
                        </button>
                    `}
                </div>
            </div>
        `;
    }).join('');
}

// ================= MODAL DETALLE DE ARTÍCULO (Screenshot 3) =================

async function pvAbrirModalDetalle(clave) {
    const modal = document.getElementById('pvModalDetalleArticulo');
    if (!modal) return;
    modal.classList.remove('hidden');

    document.getElementById('pvModalClaveTitulo').textContent = clave;
    document.getElementById('pvModalNombreArticulo').textContent = 'Cargando información...';
    document.getElementById('pvModalPrecioArticulo').textContent = '$0.00';
    document.getElementById('pvModalListaAlmacenes').innerHTML = '<div class="p-4 text-center text-slate-400 italic">Consultando almacenes...</div>';
    document.getElementById('pvModalListaEquivalencias').innerHTML = '<div class="p-4 text-center text-slate-400 italic">Consultando equivalencias...</div>';

    try {
        const queryParams = new URLSearchParams();
        if (PV_STATE.sucursalActualId) queryParams.append('almacen_id', PV_STATE.sucursalActualId);
        const res = await fetch(`/api/pv/articulos/detalle/${encodeURIComponent(clave)}?${queryParams.toString()}`);
        const data = await res.json();
        if (data.success && data.articulo) {
            const art = data.articulo;
            PV_STATE.articuloModalActual = art;

            document.getElementById('pvModalClaveTitulo').textContent = art.clave;
            document.getElementById('pvModalLineaTitulo').textContent = art.linea || 'REFACCIONES';
            document.getElementById('pvModalNombreArticulo').textContent = art.nombre;
            document.getElementById('pvModalStockAlmacen').textContent = `${art.stock_tu_almacen || 0} pzas`;
            document.getElementById('pvModalTotalExistencias').textContent = art.total_piezas || 0;
            document.getElementById('pvModalPrecioArticulo').textContent = formatearMoneda(art.precio);

            // Foto ampliada
            const fotoImg = document.getElementById('pvModalFotoImg');
            const fotoIcon = document.getElementById('pvModalFotoIcon');
            if (art.tiene_foto && art.foto_url) {
                if (fotoImg) {
                    fotoImg.src = art.foto_url;
                    fotoImg.classList.remove('hidden');
                }
                if (fotoIcon) fotoIcon.classList.add('hidden');
            } else {
                if (fotoImg) {
                    fotoImg.classList.add('hidden');
                    fotoImg.src = '';
                }
                if (fotoIcon) fotoIcon.classList.remove('hidden');
            }

            // Botón Agregar al pedido o Solicitar Traspaso a CEDIS
            const btnAgr = document.getElementById('pvBtnModalAgregarPedido');
            if (btnAgr) {
                const stockLocal = parseFloat(art.stock_tu_almacen) || 0;
                let stockCedis = parseFloat(art.stock_cedis) || 0;
                if (!stockCedis && art.existencias_almacenes) {
                    const cedisAlm = art.existencias_almacenes.find(a => a.almacen_id === 620110 || a.nombre.toUpperCase().includes('CEDIS'));
                    if (cedisAlm) stockCedis = parseFloat(cedisAlm.piezas) || 0;
                }

                if (stockLocal > 0) {
                    btnAgr.disabled = false;
                    btnAgr.className = "w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase rounded-xl transition shadow-md shadow-indigo-600/20 active:scale-95 cursor-pointer flex items-center justify-center gap-1.5";
                    btnAgr.innerHTML = '<span>➕</span> <span>Agregar a la Venta</span>';
                    btnAgr.onclick = () => {
                        pvAgregarAlCarrito({
                            articulo_id: art.articulo_id,
                            clave: art.clave,
                            nombre: art.nombre,
                            precio: art.precio,
                            stock_global: art.total_piezas,
                            stock_local: stockLocal,
                            stock_cedis: stockCedis,
                            bonificacion: (art.clave.startsWith('G-') || art.nombre.toUpperCase().includes('ACUMULADOR')) ? { clave: 'B03', monto: 525.0, nombre: 'BONIFICACION ACUMULADOR USADO GRUPO 3' } : null
                        });
                        pvCerrarModalDetalle();
                    };
                } else if (stockCedis > 0) {
                    btnAgr.disabled = false;
                    btnAgr.className = "w-full py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs uppercase rounded-xl transition shadow-md shadow-amber-500/20 active:scale-95 cursor-pointer flex items-center justify-center gap-1.5";
                    btnAgr.innerHTML = `<span>🚚</span> <span>Solicitar Traspaso a CEDIS (${stockCedis} pzas disp.)</span>`;
                    btnAgr.onclick = () => {
                        pvCerrarModalDetalle();
                        pvAbrirModalSolicitarTraspasoCedis({
                            articulo_id: art.articulo_id,
                            clave: art.clave,
                            nombre: art.nombre,
                            stock_local: 0,
                            stock_cedis: stockCedis
                        });
                    };
                } else {
                    btnAgr.disabled = true;
                    btnAgr.className = "w-full py-3 bg-slate-200 text-slate-400 font-bold text-xs uppercase rounded-xl transition cursor-not-allowed flex items-center justify-center gap-1.5";
                    btnAgr.innerHTML = '<span>✕</span> <span>Sin Existencias (Agotado en Sucursal y CEDIS)</span>';
                    btnAgr.onclick = null;
                }
            }

            // Desglose de existencias por almacén
            const contAlm = document.getElementById('pvModalListaAlmacenes');
            if (contAlm) {
                if (art.existencias_almacenes && art.existencias_almacenes.length > 0) {
                    contAlm.innerHTML = art.existencias_almacenes.map(al => `
                        <div class="py-1.5 flex items-center justify-between text-xs">
                            <div>
                                <div class="font-bold text-slate-800">${al.nombre}</div>
                                ${al.comprometidas ? `<div class="text-[9px] text-amber-600 font-semibold">Comprom.: ${al.comprometidas}</div>` : ''}
                            </div>
                            <div class="text-sm font-black text-slate-900">${al.piezas}</div>
                        </div>
                    `).join('');
                } else {
                    contAlm.innerHTML = '<div class="p-3 text-center text-slate-400 italic">Sin existencias registradas</div>';
                }
            }

            // Equivalencias
            const contEq = document.getElementById('pvModalListaEquivalencias');
            const conEqCount = document.getElementById('pvModalConteoEquivalencias');
            if (conEqCount) conEqCount.textContent = `(${art.equivalencias ? art.equivalencias.length : 0})`;
            if (contEq) {
                if (art.equivalencias && art.equivalencias.length > 0) {
                    contEq.innerHTML = art.equivalencias.map(eq => `
                        <div class="p-2 bg-emerald-50/50 hover:bg-emerald-50 rounded-xl border border-emerald-100 flex items-center justify-between text-xs transition cursor-pointer"
                             onclick="pvAbrirModalDetalle('${eq.clave}')">
                            <div class="min-w-0 pr-2">
                                <div class="font-black text-slate-900">${eq.clave}</div>
                                <div class="text-[10px] text-slate-500 truncate" title="${eq.nombre}">${eq.nombre}</div>
                            </div>
                            <div class="text-right shrink-0">
                                <div class="font-black text-slate-900">${formatearMoneda(eq.precio)}</div>
                                <div class="text-[10px] font-bold text-emerald-700">${eq.stock} pzas</div>
                            </div>
                        </div>
                    `).join('');
                } else {
                    contEq.innerHTML = '<div class="p-3 text-center text-slate-400 italic">No hay equivalencias registradas</div>';
                }
            }
        }
    } catch (e) {
        console.error("Error al cargar detalle modal:", e);
    }
}

function pvCerrarModalDetalle() {
    const modal = document.getElementById('pvModalDetalleArticulo');
    if (modal) modal.classList.add('hidden');
}

// ================= CARRITO Y PUNTO DE VENTA EN CURSO (Screenshot 4) =================

function pvAgregarAlCarrito(art) {
    const stockLocal = parseFloat(art.stock_local) || 0;
    const stockCedis = parseFloat(art.stock_cedis) || 0;

    // Validación estricta: NO permitir agregar si no tiene existencia local
    if (stockLocal <= 0) {
        if (stockCedis > 0) {
            // Ofrecer solicitar traspaso a CEDIS
            if (confirm(`⚠️ El artículo "${art.clave}" no tiene existencia física en tu sucursal, pero hay ${stockCedis} pzas disponibles en CEDIS.\n\n¿Deseas enviar una Solicitud de Traspaso a Compras para su validación y autorización?`)) {
                pvAbrirModalSolicitarTraspasoCedis(art);
            }
        } else {
            alert(`⚠️ El artículo "${art.clave}" no cuenta con existencia en tu sucursal ni en CEDIS.`);
        }
        return;
    }

    const idx = PV_STATE.carrito.findIndex(item => item.articulo_id === art.articulo_id);
    if (idx >= 0) {
        if (PV_STATE.carrito[idx].cantidad + 1 > stockLocal) {
            alert(`⚠️ No puedes agregar más piezas de "${art.clave}". Existencia local disponible: ${stockLocal} pzas.`);
            return;
        }
        PV_STATE.carrito[idx].cantidad += 1;
    } else {
        const nuevoItem = {
            articulo_id: art.articulo_id,
            clave: art.clave,
            nombre: art.nombre,
            precio: parseFloat(art.precio) || 0,
            cantidad: 1,
            descuento_pct: 0,
            stock_local: stockLocal,
            stock_cedis: stockCedis,
            bonificacion: art.bonificacion || null
        };
        PV_STATE.carrito.push(nuevoItem);

        // Si tiene bonificación de acumulador (casco), agregar partida de bonificación asociada
        if (art.bonificacion && art.bonificacion.monto) {
            const bonifItem = {
                articulo_id: `BONIF_${art.bonificacion.clave}`,
                clave: art.bonificacion.clave,
                nombre: art.bonificacion.nombre,
                es_bonificacion: true,
                asociado_a_clave: art.clave,
                precio: parseFloat(art.bonificacion.monto) || 0,
                cantidad: 1,
                descuento_pct: 100.0,
                bonificacion: null
            };
            PV_STATE.carrito.push(bonifItem);
        }
    }

    pvActualizarCarritoUi();
}

function pvModificarCantidadCarrito(index, cambio) {
    if (!PV_STATE.carrito[index]) return;
    const item = PV_STATE.carrito[index];

    if (cambio > 0 && item.stock_local !== undefined && (item.cantidad + cambio) > item.stock_local) {
        alert(`⚠️ No puedes agregar más piezas de "${item.clave}". Stock físico disponible en tu sucursal: ${item.stock_local} pzas.`);
        return;
    }

    item.cantidad += cambio;
    if (item.cantidad <= 0) {
        pvEliminarItemCarrito(index);
        return;
    }
    pvActualizarCarritoUi();
}

function pvModificarDescuentoCarrito(index, val) {
    if (!PV_STATE.carrito[index]) return;
    const num = Math.min(100, Math.max(0, parseFloat(val) || 0));
    PV_STATE.carrito[index].descuento_pct = num;
    pvActualizarCarritoUi();
}

function pvEliminarItemCarrito(index) {
    const item = PV_STATE.carrito[index];
    if (item && !item.es_bonificacion) {
        // Si tiene bonificación asociada, eliminarla también
        PV_STATE.carrito = PV_STATE.carrito.filter(it => it.asociado_a_clave !== item.clave);
    }
    PV_STATE.carrito.splice(index, 1);
    pvActualizarCarritoUi();
}

function pvLimpiarCarrito() {
    if (PV_STATE.carrito.length === 0) return;
    if (confirm("¿Deseas vaciar el carrito de venta actual?")) {
        PV_STATE.carrito = [];
        pvActualizarCarritoUi();
    }
}

function pvActualizarCarritoUi() {
    const tbody = document.getElementById('pvTbodyCarrito');
    const badgeCount = document.getElementById('pvBadgeTotalItemsCarrito');
    if (!tbody) return;

    if (PV_STATE.carrito.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="py-12 text-center text-slate-400 text-xs">
                    El carrito de venta está vacío.<br>Agrega refacciones desde el catálogo.
                </td>
            </tr>
        `;
        if (badgeCount) badgeCount.textContent = '0 pzs';
        pvActualizarTotalesUi(0, 0, 0, 0, 0);
        return;
    }

    let subtotalNeto = 0.0;
    let ahorroAplicado = 0.0;
    let bonificacionRelacionada = 0.0;
    let piezasTotales = 0;

    tbody.innerHTML = PV_STATE.carrito.map((item, idx) => {
        piezasTotales += item.cantidad;

        const precioUnit = item.precio;
        const subSinDesc = precioUnit * item.cantidad;
        const montoDesc = (subSinDesc * (item.descuento_pct / 100.0));
        const totalLinea = subSinDesc - montoDesc;

        if (item.es_bonificacion) {
            bonificacionRelacionada += item.precio * item.cantidad;
        } else {
            subtotalNeto += totalLinea / 1.16; // sin IVA
            ahorroAplicado += montoDesc;
        }

        const esBonif = !!item.es_bonificacion;

        return `
            <tr class="hover:bg-slate-50/80 transition border-b border-slate-100 last:border-0 text-xs ${esBonif ? 'bg-emerald-50/60' : ''}">
                <td class="py-3 px-3">
                    <div class="font-black text-slate-900">${item.clave}</div>
                    <div class="text-[10px] text-slate-500 truncate max-w-[150px]" title="${item.nombre}">${item.nombre}</div>
                    ${item.bonificacion ? `<div class="text-[9px] text-emerald-700 font-bold mt-0.5">✓ Casco bonificado (-$${item.bonificacion.monto})</div>` : ''}
                </td>
                <td class="py-2.5 px-2 text-center whitespace-nowrap">
                    <div class="inline-flex items-center gap-1.5 bg-slate-100/90 rounded-xl p-1 border border-slate-200/80">
                        <button type="button" onclick="pvModificarCantidadCarrito(${idx}, -1)" class="w-8 h-8 rounded-lg bg-white hover:bg-slate-200 active:scale-95 text-slate-900 font-black text-sm flex items-center justify-center select-none shadow-2xs cursor-pointer">-</button>
                        <span class="min-w-[24px] text-center font-black text-xs text-slate-900">${item.cantidad}</span>
                        <button type="button" onclick="pvModificarCantidadCarrito(${idx}, 1)" class="w-8 h-8 rounded-lg bg-slate-900 hover:bg-slate-800 active:scale-95 text-white font-black text-sm flex items-center justify-center select-none shadow-2xs cursor-pointer">+</button>
                    </div>
                </td>
                <td class="py-2.5 px-2 text-right font-bold text-slate-800 whitespace-nowrap">
                    ${formatearMoneda(item.precio)}
                </td>
                <td class="py-2.5 px-2 text-center">
                    <input type="number" min="0" max="100" value="${item.descuento_pct}"
                           onchange="pvModificarDescuentoCarrito(${idx}, this.value)"
                           class="w-14 text-center text-xs font-bold bg-white border border-slate-200 rounded-xl py-1.5 px-1 focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                </td>
                <td class="py-2.5 px-3 text-right font-black ${esBonif ? 'text-emerald-700' : 'text-slate-900'} whitespace-nowrap text-xs">
                    ${formatearMoneda(totalLinea)}
                </td>
                <td class="py-2.5 px-1.5 text-center">
                    <button type="button" onclick="pvEliminarItemCarrito(${idx})" title="Quitar artículo" class="w-8 h-8 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 flex items-center justify-center text-xs font-bold transition active:scale-95 cursor-pointer">
                        ✕
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    if (badgeCount) badgeCount.textContent = `${piezasTotales} pzs`;

    const subtotal = subtotalNeto;
    const iva = subtotalNeto * 0.16;
    const totalPagar = (subtotal + iva) - bonificacionRelacionada;

    pvActualizarTotalesUi(ahorroAplicado, bonificacionRelacionada, subtotal, iva, totalPagar);
}

function pvActualizarTotalesUi(ahorro, bonif, subtotal, iva, total) {
    const elAh = document.getElementById('pvTxtAhorro');
    const elBon = document.getElementById('pvTxtBonificacion');
    const elSub = document.getElementById('pvTxtSubtotal');
    const elIva = document.getElementById('pvTxtIva');
    const elTot = document.getElementById('pvTxtTotalPagar');

    if (elAh) elAh.textContent = formatearMoneda(ahorro);
    if (elBon) elBon.textContent = formatearMoneda(bonif);
    if (elSub) elSub.textContent = formatearMoneda(subtotal);
    if (elIva) elIva.textContent = formatearMoneda(iva);
    if (elTot) elTot.textContent = formatearMoneda(total);
}

// ================= ENVÍO A CAJA MICROSIP =================

async function pvEnviarACaja() {
    if (PV_STATE.carrito.length === 0) {
        alert("El carrito está vacío. Agrega refacciones antes de enviar a caja.");
        return;
    }

    const payload = {
        cliente_id: PV_STATE.clienteActual ? PV_STATE.clienteActual.id : null,
        almacen_id: PV_STATE.sucursalActualId || (typeof currentUser !== 'undefined' ? currentUser.sucursal_id : null),
        vendedor_id: PV_STATE.vendedorActualId || (typeof currentUser !== 'undefined' ? currentUser.vendedor_id : null),
        observaciones: PV_STATE.observaciones,
        partidas: PV_STATE.carrito.filter(it => !it.es_bonificacion).map(it => ({
            articulo_id: it.articulo_id,
            clave: it.clave,
            cantidad: it.cantidad,
            precio_unitario: it.precio,
            descuento_pct: it.descuento_pct,
            bonificacion: it.bonificacion || null
        }))
    };

    try {
        const res = await fetch('/api/pv/enviar-a-caja', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (data.success) {
            // Mostrar modal de éxito
            const mExito = document.getElementById('pvModalExitoCaja');
            const elFolio = document.getElementById('pvModalExitoFolio');
            const elTotal = document.getElementById('pvModalExitoTotal');

            if (elFolio) elFolio.textContent = data.folio;
            if (elTotal) elTotal.textContent = formatearMoneda(data.total_a_pagar);
            if (mExito) mExito.classList.remove('hidden');

            // Vaciar carrito
            PV_STATE.carrito = [];
            PV_STATE.observaciones = '';
            pvActualizarCarritoUi();
        } else {
            alert(`Error al enviar a caja: ${data.error || 'No se pudo generar la orden'}`);
        }
    } catch (e) {
        alert(`Error de red al conectar con el servidor: ${e.message}`);
    }
}

function pvCerrarModalExito() {
    const mExito = document.getElementById('pvModalExitoCaja');
    if (mExito) mExito.classList.add('hidden');
}

// ================= OBSERVACIONES Y COTIZACIÓN =================

function pvAbrirModalObservaciones() {
    const modal = document.getElementById('pvModalObservaciones');
    const txt = document.getElementById('pvTextareaObservaciones');
    if (txt) txt.value = PV_STATE.observaciones;
    if (modal) modal.classList.remove('hidden');
}

function pvCerrarModalObservaciones() {
    const modal = document.getElementById('pvModalObservaciones');
    const txt = document.getElementById('pvTextareaObservaciones');
    if (txt) PV_STATE.observaciones = txt.value.trim();
    if (modal) modal.classList.add('hidden');
}

function pvGenerarCotizacion() {
    if (PV_STATE.carrito.length === 0) {
        alert("Agrega artículos para generar una cotización.");
        return;
    }
    window.print();
}

// ================= SOLICITUDES DE TRASPASO A CEDIS (VALIDADAS POR COMPRAS) =================

function pvAbrirModalSolicitarTraspasoCedis(art) {
    if (!art) return;
    const modal = document.getElementById('pvModalSolicitarTraspasoCedis');
    if (!modal) return;

    const elArtId = document.getElementById('pvSolArticuloId');
    const elClaveInp = document.getElementById('pvSolClaveInput');
    const elNomInp = document.getElementById('pvSolNombreInput');
    const elClave = document.getElementById('pvModalSolClave');
    const elNom = document.getElementById('pvModalSolNombre');
    const elStkLocal = document.getElementById('pvModalSolStockLocal');
    const elStkCedis = document.getElementById('pvModalSolStockCedis');
    const elSucDest = document.getElementById('pvSolSucursalDestino');
    const elCant = document.getElementById('pvSolCantidad');
    const elCli = document.getElementById('pvSolCliente');
    const elNotas = document.getElementById('pvSolNotas');

    if (elArtId) elArtId.value = art.articulo_id || '';
    if (elClaveInp) elClaveInp.value = art.clave || '';
    if (elNomInp) elNomInp.value = art.nombre || '';
    if (elClave) elClave.textContent = art.clave || '-';
    if (elNom) elNom.textContent = art.nombre || '-';
    if (elStkLocal) elStkLocal.textContent = `${art.stock_local || 0} pzas (Agotado)`;
    if (elStkCedis) elStkCedis.textContent = `${art.stock_cedis || 0} pzas disponibles`;
    if (elSucDest) elSucDest.value = PV_STATE.sucursalActualNombre || 'Sucursal Actual';
    if (elCant) {
        elCant.value = 1;
        elCant.max = Math.max(1, art.stock_cedis || 9999);
    }
    if (elCli) {
        elCli.value = PV_STATE.clienteActual ? (PV_STATE.clienteActual.nombre || '') : '';
    }
    if (elNotas) elNotas.value = '';

    modal.classList.remove('hidden');
}

function pvCerrarModalSolicitarTraspasoCedis() {
    const modal = document.getElementById('pvModalSolicitarTraspasoCedis');
    if (modal) modal.classList.add('hidden');
}

async function pvEnviarSolicitudTraspaso(event) {
    if (event) event.preventDefault();

    const artId = document.getElementById('pvSolArticuloId')?.value;
    const clave = document.getElementById('pvSolClaveInput')?.value;
    const nombre = document.getElementById('pvSolNombreInput')?.value;
    const cantVal = parseFloat(document.getElementById('pvSolCantidad')?.value || 1);
    const cliente = document.getElementById('pvSolCliente')?.value?.trim() || '';
    const notas = document.getElementById('pvSolNotas')?.value?.trim() || '';

    if (!artId || !clave || cantVal <= 0) {
        alert("Por favor indica una cantidad válida para la solicitud.");
        return;
    }

    const btnSubmit = document.getElementById('pvBtnEnviarSolicitudCedis');
    const txtOriginal = btnSubmit ? btnSubmit.innerHTML : '';
    if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<span>⏳</span> <span>Enviando a Compras...</span>';
    }

    try {
        const payload = {
            articulo_id: parseInt(artId),
            clave: clave,
            nombre: nombre,
            cantidad: cantVal,
            sucursal_destino_id: PV_STATE.sucursalActualId,
            sucursal_destino_nombre: PV_STATE.sucursalActualNombre,
            cliente_nombre: cliente,
            notas: notas
        };

        const res = await fetch('/api/pv/solicitar-traspaso-cedis', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (data.success) {
            pvCerrarModalSolicitarTraspasoCedis();
            alert(`✅ Solicitud de Traspaso ${data.folio} registrada exitosamente.\n\nHa quedado en estatus PENDIENTE de validación por el departamento de Compras. Una vez autorizada por Compras, CEDIS programará el surtido a tu sucursal.`);
        } else {
            alert(`Error al enviar la solicitud: ${data.error || 'Ocurrió un error inesperado'}`);
        }
    } catch (e) {
        console.error("Error al enviar solicitud:", e);
        alert(`Error de conexión con el servidor: ${e.message}`);
    } finally {
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = txtOriginal;
        }
    }
}

async function pvAbrirModalMisSolicitudes() {
    const modal = document.getElementById('pvModalMisSolicitudesCedis');
    if (!modal) return;
    modal.classList.remove('hidden');

    const contenedor = document.getElementById('pvContenedorMisSolicitudes');
    if (contenedor) {
        contenedor.innerHTML = `
            <div class="p-8 text-center text-slate-400 italic">
                <div class="animate-spin text-2xl mb-2">⏳</div>
                Cargando historial de solicitudes enviadas a CEDIS...
            </div>
        `;
    }

    try {
        const sucParam = PV_STATE.sucursalActualId ? `?sucursal_id=${PV_STATE.sucursalActualId}` : '';
        const res = await fetch(`/api/pv/mis-solicitudes-traspasos${sucParam}`);
        const data = await res.json();

        if (!data.success || !data.solicitudes || data.solicitudes.length === 0) {
            if (contenedor) {
                contenedor.innerHTML = `
                    <div class="p-8 text-center text-slate-400 italic bg-slate-50 rounded-2xl border border-slate-200">
                        No hay solicitudes de traspaso registradas para esta sucursal.
                    </div>
                `;
            }
            return;
        }

        if (contenedor) {
            contenedor.innerHTML = `
                <div class="space-y-2.5">
                    ${data.solicitudes.map(s => {
                        let badgeStatus = '';
                        if (s.estatus === 'PENDIENTE_COMPRAS') {
                            badgeStatus = `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-100 text-amber-800 border border-amber-200">⏳ Pendiente Compras</span>`;
                        } else if (s.estatus === 'APROBADA') {
                            badgeStatus = `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">✓ Aprobada por Compras</span>`;
                        } else if (s.estatus === 'RECHAZADA') {
                            badgeStatus = `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-100 text-rose-800 border border-rose-200">✕ Rechazada</span>`;
                        } else {
                            badgeStatus = `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-slate-100 text-slate-700">${s.estatus}</span>`;
                        }

                        return `
                            <div class="p-4 bg-slate-50 hover:bg-white rounded-2xl border border-slate-200 hover:border-indigo-300 transition shadow-2xs space-y-2">
                                <div class="flex items-center justify-between gap-2 flex-wrap">
                                    <div class="flex items-center gap-2">
                                        <span class="font-mono font-black text-xs text-indigo-700">${s.folio}</span>
                                        <span class="text-[11px] text-slate-500 font-medium">${s.fecha}</span>
                                    </div>
                                    <div>${badgeStatus}</div>
                                </div>
                                <div class="flex items-start justify-between gap-4">
                                    <div>
                                        <div class="text-xs font-black text-slate-900">${s.clave} &bull; <span class="text-slate-700 font-normal">${s.nombre}</span></div>
                                        <div class="text-[11px] text-slate-500 mt-0.5">
                                            Cantidad Solicitada: <strong class="text-slate-900">${s.cantidad} pzas</strong> &bull; Solicitado por: <strong>${s.solicitado_por || s.vendedor || 'Vendedor'}</strong>
                                            ${s.cliente ? ` &bull; Cliente: <strong class="text-indigo-600">${s.cliente}</strong>` : ''}
                                        </div>
                                        ${s.notas ? `<div class="text-[10px] text-slate-500 italic mt-1 bg-white p-2 rounded-lg border border-slate-100">Notas: ${s.notas}</div>` : ''}
                                    </div>
                                </div>
                                ${s.estatus === 'APROBADA' && s.autorizado_por ? `
                                    <div class="text-[10px] text-emerald-800 font-bold bg-emerald-50/80 p-2 rounded-xl border border-emerald-200 flex items-center justify-between">
                                        <span>✓ Autorizado por Compras (${s.autorizado_por}) el ${s.fecha_autorizacion || ''}</span>
                                        ${s.folio_traspaso ? `<span class="font-mono text-emerald-900">Traspaso Microsip: ${s.folio_traspaso}</span>` : '<span class="text-emerald-700 text-[9px]">En cola de surtido CEDIS</span>'}
                                    </div>
                                ` : ''}
                                ${s.estatus === 'RECHAZADA' && s.motivo_rechazo ? `
                                    <div class="text-[10px] text-rose-800 font-bold bg-rose-50/80 p-2 rounded-xl border border-rose-200">
                                        ✕ Rechazado por Compras (${s.autorizado_por || 'Compras'}) &bull; Motivo: ${s.motivo_rechazo}
                                    </div>
                                ` : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        }
    } catch (e) {
        console.error("Error al cargar mis solicitudes:", e);
        if (contenedor) {
            contenedor.innerHTML = `<div class="p-4 text-center text-rose-500 text-xs font-bold">Error al cargar las solicitudes: ${e.message}</div>`;
        }
    }
}

function pvCerrarModalMisSolicitudes() {
    const modal = document.getElementById('pvModalMisSolicitudesCedis');
    if (modal) modal.classList.add('hidden');
}

// Exportaciones globales
window.inicializarModuloPuntoVenta = inicializarModuloPuntoVenta;
window.pvAbrirModalSolicitarTraspasoCedis = pvAbrirModalSolicitarTraspasoCedis;
window.pvCerrarModalSolicitarTraspasoCedis = pvCerrarModalSolicitarTraspasoCedis;
window.pvEnviarSolicitudTraspaso = pvEnviarSolicitudTraspaso;
window.pvAbrirModalMisSolicitudes = pvAbrirModalMisSolicitudes;
window.pvCerrarModalMisSolicitudes = pvCerrarModalMisSolicitudes;

