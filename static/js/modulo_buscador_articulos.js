        // ================= MÓDULO 4: BUSCADOR DE ARTÍCULOS, EXISTENCIAS Y EQUIVALENCIAS =================
        let articuloConsultadoActual = null;
        let timerBusquedaArticulo = null;
        let sugerenciasArticulosFiltradas = [];
        let indiceSugerenciaArtActiva = -1;

        const inputBusquedaArticulo = document.getElementById('inputBusquedaArticulo');
        const btnConsultarArticulo = document.getElementById('btnConsultarArticulo');
        const btnClearBusquedaArticulo = document.getElementById('btnClearBusquedaArticulo');
        const dropdownSugerenciasArticulo = document.getElementById('dropdownSugerenciasArticulo');
        const chkPrecioConIva = document.getElementById('chkPrecioConIva');

        function initBuscadorArticulos() {
            if (!inputBusquedaArticulo) return;

            inputBusquedaArticulo.addEventListener('input', function() {
                const query = this.value.trim().toUpperCase();
                btnClearBusquedaArticulo.classList.toggle('hidden', !query);
                clearTimeout(timerBusquedaArticulo);
                indiceSugerenciaArtActiva = -1;

                if (query.length < 2) {
                    cerrarDropdownSugerenciasArticulo();
                    return;
                }

                timerBusquedaArticulo = setTimeout(async () => {
                    try {
                        const res = await fetch(`/api/articulos/sugerencias-busqueda?q=${encodeURIComponent(query)}`);
                        sugerenciasArticulosFiltradas = await res.json();
                        renderizarSugerenciasArticulos(query);
                    } catch (e) {
                        cerrarDropdownSugerenciasArticulo();
                    }
                }, 180);
            });

            inputBusquedaArticulo.addEventListener('keydown', function(e) {
                if (dropdownSugerenciasArticulo && !dropdownSugerenciasArticulo.classList.contains('hidden')) {
                    const items = dropdownSugerenciasArticulo.querySelectorAll('.sugerencia-art-item');
                    if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        if (items.length > 0) {
                            indiceSugerenciaArtActiva = (indiceSugerenciaArtActiva + 1) % items.length;
                            actualizarFocoSugerenciaArticulo(items);
                        }
                        return;
                    } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        if (items.length > 0) {
                            indiceSugerenciaArtActiva = (indiceSugerenciaArtActiva - 1 + items.length) % items.length;
                            actualizarFocoSugerenciaArticulo(items);
                        }
                        return;
                    } else if (e.key === 'Enter') {
                        e.preventDefault();
                        if (indiceSugerenciaArtActiva >= 0 && indiceSugerenciaArtActiva < sugerenciasArticulosFiltradas.length) {
                            const sel = sugerenciasArticulosFiltradas[indiceSugerenciaArtActiva];
                            seleccionarSugerenciaArticulo(sel.clave);
                            return;
                        }
                    } else if (e.key === 'Escape') {
                        cerrarDropdownSugerenciasArticulo();
                        return;
                    }
                }

                if (e.key === 'Enter') {
                    e.preventDefault();
                    cerrarDropdownSugerenciasArticulo();
                    const val = inputBusquedaArticulo.value.trim();
                    if (val) consultarArticuloPorClave(val);
                }
            });

            btnConsultarArticulo.addEventListener('click', () => {
                cerrarDropdownSugerenciasArticulo();
                const val = inputBusquedaArticulo.value.trim();
                if (val) consultarArticuloPorClave(val);
                else inputBusquedaArticulo.focus();
            });

            btnClearBusquedaArticulo.addEventListener('click', () => {
                inputBusquedaArticulo.value = '';
                btnClearBusquedaArticulo.classList.add('hidden');
                cerrarDropdownSugerenciasArticulo();
                inputBusquedaArticulo.focus();
            });

            document.addEventListener('click', (e) => {
                if (inputBusquedaArticulo && !inputBusquedaArticulo.contains(e.target) && dropdownSugerenciasArticulo && !dropdownSugerenciasArticulo.contains(e.target)) {
                    cerrarDropdownSugerenciasArticulo();
                }
            });

            chkPrecioConIva.addEventListener('change', () => {
                renderizarTablaEquivalencias();
            });
        }

        function renderizarSugerenciasArticulos(query) {
            if (!dropdownSugerenciasArticulo) return;
            dropdownSugerenciasArticulo.innerHTML = '';

            if (sugerenciasArticulosFiltradas.length === 0) {
                dropdownSugerenciasArticulo.innerHTML = `
                    <div class="p-3 text-center text-xs text-slate-400 italic">
                        No se encontraron artículos con "${query}"
                    </div>
                `;
                dropdownSugerenciasArticulo.classList.remove('hidden');
                return;
            }

            sugerenciasArticulosFiltradas.forEach((art, idx) => {
                const item = document.createElement('div');
                item.className = "sugerencia-art-item p-2.5 hover:bg-blue-50/70 cursor-pointer flex items-center justify-between text-xs transition";
                item.dataset.index = idx;

                const claveHighlight = resaltarCoincidencia(art.clave, query);
                const nombreHighlight = resaltarCoincidencia(art.nombre, query);
                const eqBadge = art.equivalencia ? `<span class="text-[9px] font-mono font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">Eq: ${art.equivalencia}</span>` : '';

                item.innerHTML = `
                    <div class="truncate mr-2">
                        <div class="flex items-center gap-2">
                            <span class="font-mono font-extrabold text-blue-700">${claveHighlight}</span>
                            ${eqBadge}
                        </div>
                        <div class="text-[11px] text-slate-600 truncate mt-0.5">${nombreHighlight}</div>
                    </div>
                `;

                item.addEventListener('click', () => {
                    seleccionarSugerenciaArticulo(art.clave);
                });

                dropdownSugerenciasArticulo.appendChild(item);
            });

            dropdownSugerenciasArticulo.classList.remove('hidden');
        }

        function actualizarFocoSugerenciaArticulo(items) {
            items.forEach((it, idx) => {
                if (idx === indiceSugerenciaArtActiva) {
                    it.classList.add('bg-blue-100/80');
                    it.scrollIntoView({ block: 'nearest' });
                } else {
                    it.classList.remove('bg-blue-100/80');
                }
            });
        }

        function seleccionarSugerenciaArticulo(clave) {
            inputBusquedaArticulo.value = clave;
            btnClearBusquedaArticulo.classList.remove('hidden');
            cerrarDropdownSugerenciasArticulo();
            consultarArticuloPorClave(clave);
        }

        function cerrarDropdownSugerenciasArticulo() {
            if (dropdownSugerenciasArticulo) {
                dropdownSugerenciasArticulo.classList.add('hidden');
                dropdownSugerenciasArticulo.innerHTML = '';
            }
            indiceSugerenciaArtActiva = -1;
        }

        async function consultarArticuloPorClave(clave) {
            if (!clave || !clave.trim()) return;
            const txt = clave.trim().toUpperCase();
            inputBusquedaArticulo.value = txt;
            btnClearBusquedaArticulo.classList.remove('hidden');
            cerrarDropdownSugerenciasArticulo();

            actualizarProgreso(25, 'Consultando artículo...', txt, 'bg-blue-600');
            await renderYield();

            try {
                const res = await fetch(`/api/articulos/consultar-completo?clave=${encodeURIComponent(txt)}`);
                const data = await res.json();
                if (!res.ok || !data.success) {
                    ocultarProgreso();
                    mostrarAlerta('error', data.error || `No se encontró el artículo '${txt}'.`);
                    return;
                }
                articuloConsultadoActual = data;
                renderizarVistaArticuloCompleto(data);
                actualizarProgreso(100, '¡Consulta completada!', '', 'bg-blue-600');
                setTimeout(ocultarProgreso, 400);
            } catch (e) {
                ocultarProgreso();
                mostrarAlerta('error', 'Error al consultar artículo en el servidor.');
            }
        }

        function renderizarVistaArticuloCompleto(data) {
            const art = data.articulo || {};

            // Cuadros Superiores
            document.getElementById('txtDetalleClaveArticulo').textContent = art.clave || '--';
            
            const elClas = document.getElementById('txtDetalleClasificacion');
            elClas.textContent = art.clasificacion || '--';
            elClas.className = "font-black text-lg " + obtenerColorTextoClasificacion(art.clasificacion);

            document.getElementById('txtDetalleEquivalencia').textContent = art.equivalencia || '--';

            // Título y badges de descripción
            document.getElementById('txtDetalleNombreArticulo').textContent = art.nombre || 'Sin descripción';
            document.getElementById('tagDetalleLinea').textContent = art.linea ? `Línea: ${art.linea}` : '';
            document.getElementById('tagDetalleUnidad').textContent = art.unidad ? `Unidad: ${art.unidad}` : '';

            // Detectar empresa activa y actualizar encabezados
            const empInfo = data.empresa_activa || {};
            const empId = empInfo.id || '';
            const empNombre = empInfo.nombre || 'EMPRESA';
            let siglasEmpresa = 'BC';
            if (empId === 'basesRTT') siglasEmpresa = 'RT';
            else if (empId === 'basesrenoher') siglasEmpresa = 'RENOHER';
            else if (empId === 'datosRTDGO') siglasEmpresa = 'RT DGO';

            const elSiglasPri = document.getElementById('lblEmpresaPrincipalSiglas');
            if (elSiglasPri) elSiglasPri.textContent = siglasEmpresa;
            const elSubPri = document.getElementById('lblEmpresaPrincipalSub');
            if (elSubPri) elSubPri.textContent = `Sucursales y Almacenes (${empNombre})`;

            const elSiglasSec = document.getElementById('lblEmpresaSecundariaSiglas');
            const elSubSec = document.getElementById('lblEmpresaSecundariaSub');
            if (siglasEmpresa === 'RENOHER') {
                if (elSiglasSec) elSiglasSec.textContent = 'BC';
                if (elSubSec) elSubSec.textContent = 'Battery Center';
            } else {
                if (elSiglasSec) elSiglasSec.textContent = 'RENOHER';
                if (elSubSec) elSubSec.textContent = 'Sucursal Gómez';
            }

            document.getElementById('tagDetalleTotalExistencia').textContent = `Total ${siglasEmpresa}: ${art.total_existencia_bc || 0} pzas`;

            // Tabla Almacenes Empresa Activa
            const tbodyBc = document.getElementById('tablaAlmacenesBcBody');
            tbodyBc.innerHTML = '';
            const almacenesBc = data.almacenes_bc || [];
            const badgeBc = document.getElementById('badgeExistenciaBcSub');
            if (badgeBc) badgeBc.textContent = `${almacenesBc.length} almacén(es)`;

            if (almacenesBc.length === 0) {
                tbodyBc.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-400 italic">No hay registros de almacenes.</td></tr>';
            } else {
                almacenesBc.forEach(alm => {
                    const tr = document.createElement('tr');
                    tr.className = "border-b border-slate-100 hover:bg-slate-50 transition text-xs";
                    const badgeClas = obtenerBadgeClasificacionHtml(alm.clas);
                    const stockClass = alm.existencia > 0 ? "font-black text-slate-900" : "font-semibold text-slate-400";
                    tr.innerHTML = `
                        <td class="p-2.5 font-bold text-slate-700">${alm.nombre}</td>
                        <td class="p-2.5 text-center font-mono ${stockClass}">${alm.existencia}</td>
                        <td class="p-2.5 text-center">${badgeClas}</td>
                        <td class="p-2.5 font-mono font-bold text-slate-800 text-[11px]">${alm.localizacion || ''}</td>
                    `;
                    tbodyBc.appendChild(tr);
                });
            }

            // Tabla Equivalencias
            renderizarTablaEquivalencias();

            // Tabla RENO-HER
            const tbodyRh = document.getElementById('tablaAlmacenesRenoherBody');
            tbodyRh.innerHTML = '';
            const almacenesRh = data.almacenes_renoher || [];
            const badgeRh = document.getElementById('badgeExistenciaRenoherSub');
            if (badgeRh) badgeRh.textContent = `${almacenesRh.length} almacén(es)`;

            if (almacenesRh.length === 0) {
                tbodyRh.innerHTML = '<tr><td colspan="3" class="p-3 text-center text-slate-400 italic">Sin existencias registradas en RENOHER.</td></tr>';
            } else {
                almacenesRh.forEach(rh => {
                    const tr = document.createElement('tr');
                    tr.className = "border-b border-slate-100 hover:bg-slate-50 transition text-xs";
                    const badgeClas = obtenerBadgeClasificacionHtml(rh.clas);
                    const stockClass = rh.existencia > 0 ? "font-black text-slate-900" : "font-semibold text-slate-400";
                    tr.innerHTML = `
                        <td class="p-2.5 font-bold text-slate-700">${rh.nombre}</td>
                        <td class="p-2.5 text-center font-mono ${stockClass}">${rh.existencia}</td>
                        <td class="p-2.5 text-center">${badgeClas}</td>
                    `;
                    tbodyRh.appendChild(tr);
                });
            }

            document.getElementById('contenedorDetalleArticulo').classList.remove('hidden');
            document.getElementById('contenedorDetalleArticuloVacio').classList.add('hidden');
        }

        function renderizarTablaEquivalencias() {
            if (!articuloConsultadoActual) return;
            const tbodyEq = document.getElementById('tablaEquivalenciasBody');
            tbodyEq.innerHTML = '';
            const equivs = articuloConsultadoActual.equivalencias || [];
            const conIva = document.getElementById('chkPrecioConIva').checked;
            const factorIva = conIva ? 1.16 : 1.0;

            const badgeEq = document.getElementById('badgeConteoEquivalencias');
            if (badgeEq) {
                badgeEq.textContent = `${equivs.length} artículo${equivs.length === 1 ? '' : 's'}`;
            }

            if (equivs.length === 0) {
                tbodyEq.innerHTML = '<tr><td colspan="7" class="p-6 text-center text-slate-400 italic">No tiene artículos equivalentes registrados.</td></tr>';
                return;
            }

            const formatoDinero = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

            equivs.forEach(eq => {
                const tr = document.createElement('tr');
                const esSel = eq.es_actual;
                tr.className = `border-b border-slate-100 transition text-xs ${esSel ? 'bg-blue-50/70 font-semibold' : 'hover:bg-slate-50'}`;
                
                const pLista = formatoDinero.format((eq.precio_lista || 0) * factorIva);
                const pTalleres = formatoDinero.format((eq.precio_talleres || 0) * factorIva);
                const pMayoreo = formatoDinero.format((eq.precio_mayoreo || 0) * factorIva);
                const stockClass = eq.existencia > 0 ? "font-black text-slate-900 bg-emerald-50 text-emerald-800 rounded px-2 py-0.5 border border-emerald-200" : "font-semibold text-slate-400";
                
                const checkedPrior = eq.prioridad ? "checked" : "";
                const priorCellClass = eq.prioridad ? "bg-rose-50" : "";

                tr.innerHTML = `
                    <td class="p-3 font-mono font-bold ${esSel ? 'text-blue-700' : 'text-slate-800'} whitespace-nowrap cursor-pointer" onclick="consultarArticuloPorClave('${eq.clave}')">
                        <span class="hover:underline flex items-center gap-1.5">
                            ${esSel ? '<span class="w-2 h-2 rounded-full bg-blue-600 inline-block shadow-sm"></span>' : ''}
                            ${eq.clave}
                        </span>
                    </td>
                    <td class="p-3 text-slate-800 leading-normal break-words cursor-pointer" onclick="consultarArticuloPorClave('${eq.clave}')">
                        <span class="hover:text-blue-700 font-medium">${eq.nombre}</span>
                    </td>
                    <td class="p-3 text-right font-mono font-bold text-slate-800 whitespace-nowrap">${pLista}</td>
                    <td class="p-3 text-right font-mono font-bold text-slate-800 whitespace-nowrap">${pTalleres}</td>
                    <td class="p-3 text-right font-mono font-bold text-slate-800 whitespace-nowrap">${pMayoreo}</td>
                    <td class="p-3 text-center whitespace-nowrap">
                        <span class="inline-block font-mono ${stockClass}">${eq.existencia}</span>
                    </td>
                    <td class="p-3 text-center whitespace-nowrap ${priorCellClass}">
                        <input type="checkbox" ${checkedPrior} class="w-4 h-4 cursor-pointer text-blue-600 rounded focus:ring-blue-500 transition" 
                               onchange="cambiarPrioridadArticulo(${eq.articulo_id}, this.checked, '${articuloConsultadoActual.articulo.equivalencia || eq.clave}')"
                               title="Dar prioridad de venta a este artículo">
                    </td>
                `;
                tbodyEq.appendChild(tr);
            });
        }

        async function cambiarPrioridadArticulo(artId, activo, equiv) {
            try {
                await fetch('/api/articulos/establecer-prioridad', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        articulo_id: artId,
                        prioridad: activo,
                        equivalencia: equiv
                    })
                });

                if (articuloConsultadoActual && articuloConsultadoActual.equivalencias) {
                    articuloConsultadoActual.equivalencias.forEach(eq => {
                        if (eq.articulo_id === artId) {
                            eq.prioridad = activo;
                        } else if (activo) {
                            eq.prioridad = false;
                        }
                    });
                    renderizarTablaEquivalencias();
                }
            } catch (e) {
                console.warn("Error al actualizar prioridad:", e);
            }
        }

        function obtenerBadgeClasificacionHtml(clas) {
            if (!clas || !clas.trim()) return '';
            const c = clas.trim().toUpperCase();
            if (c === 'B') {
                return `<span class="inline-block w-6 py-0.5 text-center text-[10px] font-black text-white bg-emerald-500 rounded shadow-sm">B</span>`;
            } else if (c === 'C') {
                return `<span class="inline-block w-6 py-0.5 text-center text-[10px] font-black text-white bg-amber-500 rounded shadow-sm">C</span>`;
            } else if (c === 'E') {
                return `<span class="inline-block w-6 py-0.5 text-center text-[10px] font-black text-white bg-rose-600 rounded shadow-sm">E</span>`;
            } else if (c === 'A') {
                return `<span class="inline-block w-6 py-0.5 text-center text-[10px] font-black text-white bg-blue-600 rounded shadow-sm">A</span>`;
            } else if (c === 'D') {
                return `<span class="inline-block w-6 py-0.5 text-center text-[10px] font-black text-white bg-yellow-500 rounded shadow-sm">D</span>`;
            }
            return `<span class="inline-block w-6 py-0.5 text-center text-[10px] font-black text-slate-700 bg-slate-200 rounded">${c}</span>`;
        }

        function obtenerColorTextoClasificacion(clas) {
            if (!clas) return 'text-slate-400';
            const c = clas.trim().toUpperCase();
            if (c === 'B') return 'text-emerald-600';
            if (c === 'C') return 'text-amber-500';
            if (c === 'E') return 'text-rose-600';
            if (c === 'A') return 'text-blue-600';
            return 'text-slate-700';
        }

