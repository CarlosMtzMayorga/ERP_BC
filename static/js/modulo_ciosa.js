        // ================= MÓDULO 1 (ESPECIAL CIOSA): CLAVES SIMILARES Y CONTROL DE PRECIOS =================
        let datosSimilaresCiosa = [];
        let proveedorDetectadoXml = null;
        let mapaSimilaresCiosaPorCodigo = {};

        function esProveedorCiosaActivo() {
            if (proveedorDetectadoXml) {
                const rfc = (proveedorDetectadoXml.rfc || '').toUpperCase();
                const nom = (proveedorDetectadoXml.nombre || '').toUpperCase();
                if (rfc === 'GCI880513UL6' || rfc.startsWith('GCI') || nom.includes('CIOSA')) return true;
            }
            if (proveedorSeleccionado) {
                const rfc = (proveedorSeleccionado.rfc || '').toUpperCase();
                const nom = (proveedorSeleccionado.nombre || '').toUpperCase();
                if (rfc === 'GCI880513UL6' || rfc.startsWith('GCI') || nom.includes('CIOSA')) return true;
            }
            const sel = document.getElementById('selectProveedor');
            if (sel && sel.selectedIndex >= 0) {
                const txt = sel.options[sel.selectedIndex].text.toUpperCase();
                if (txt.includes('CIOSA')) return true;
            }
            return false;
        }

        function ocultarPanelCiosaSimilares() {
            const sec = document.getElementById('seccionCiosaSimilares');
            if (sec) sec.classList.add('hidden');
            const badgeResumen = document.getElementById('badgeResumenCiosaSimilares');
            if (badgeResumen) badgeResumen.classList.add('hidden');
            const miniResumen = document.getElementById('resumenSimilaresCiosaMini');
            if (miniResumen) miniResumen.classList.add('hidden');
            const leyendaFila = document.getElementById('leyendaFilaCiosa');
            if (leyendaFila) leyendaFila.classList.add('hidden');
            datosSimilaresCiosa = [];
            mapaSimilaresCiosaPorCodigo = {};
            actualizarContadorSeleccionados();
        }

        async function analizarSimilaresCiosa() {
            if (!esProveedorCiosaActivo() || parsedItems.length === 0) {
                ocultarPanelCiosaSimilares();
                return;
            }

            const sec = document.getElementById('seccionCiosaSimilares');
            if (sec) sec.classList.remove('hidden');

            const listaEl = document.getElementById('ciosaListaSimilares');
            if (listaEl) {
                listaEl.innerHTML = `
                    <div class="p-5 text-center text-slate-500 bg-white/80 rounded-2xl border border-amber-200">
                        <span class="animate-spin inline-block text-xl mr-2">⌛</span>
                        <span class="font-bold text-xs">Consultando claves similares en Microsip para CIOSA (ej. 41292 vs 41292C)...</span>
                    </div>
                `;
            }

            try {
                const payloadItems = parsedItems.map(it => ({
                    codigo: it.codigo,
                    descripcion: it.descripcion,
                    costo: it.costo,
                    precioPublico: it.precioPublico,
                    precioTalleres: it.precioTalleres,
                    precioMayoreo: it.precioMayoreo,
                    precioMinimo: it.precioMinimo
                }));

                const res = await fetch('/api/ciosa/analizar-similares', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ items: payloadItems })
                });

                const data = await res.json();
                if (!res.ok || !data.success) throw new Error(data.error || 'Error al analizar similares de CIOSA');

                datosSimilaresCiosa = data.coincidencias || [];
                mapaSimilaresCiosaPorCodigo = {};

                datosSimilaresCiosa.forEach(c => {
                    const up = c.item_xml.codigo.trim().toUpperCase();
                    mapaSimilaresCiosaPorCodigo[up] = c.similares || [];
                });

                renderizarSeccionCiosa();
                renderTable();

            } catch (err) {
                console.error("Error al analizar similares de CIOSA:", err);
                if (listaEl) {
                    listaEl.innerHTML = `
                        <div class="p-4 text-center text-rose-700 bg-rose-50 rounded-2xl border border-rose-200 text-xs font-bold">
                            Aviso al consultar claves similares de CIOSA: ${err.message}
                        </div>
                    `;
                }
            }
        }

        function actualizarBadgesContadoresCiosa() {
            let totalArticulosSimilares = 0;
            let totalQueSubieron = 0;
            datosSimilaresCiosa.forEach(c => {
                (c.similares || []).forEach(s => {
                    totalArticulosSimilares++;
                    if (s.subio_precio) totalQueSubieron++;
                });
            });
            const badgeCont = document.getElementById('ciosaBadgeContador');
            const badgeSubieron = document.getElementById('ciosaBadgeSubieron');
            if (badgeCont) badgeCont.textContent = `${datosSimilaresCiosa.length} clave(s) con similares (${totalArticulosSimilares} arts.)`;
            if (badgeSubieron) {
                badgeSubieron.textContent = `${totalQueSubieron} con aumento de precio`;
                badgeSubieron.className = totalQueSubieron > 0
                    ? "bg-rose-100 text-rose-800 border border-rose-300 px-2.5 py-1 rounded-xl text-xs font-black"
                    : "bg-emerald-100 text-emerald-800 border border-emerald-300 px-2.5 py-1 rounded-xl text-xs font-black";
            }

            // Actualizar resumen fiscal superior
            const badgeResumen = document.getElementById('badgeResumenCiosaSimilares');
            if (badgeResumen) {
                if (datosSimilaresCiosa.length > 0) {
                    badgeResumen.textContent = `⚡ ${datosSimilaresCiosa.length} similares CIOSA`;
                    badgeResumen.classList.remove('hidden');
                } else {
                    badgeResumen.classList.add('hidden');
                }
            }

            const miniResumen = document.getElementById('resumenSimilaresCiosaMini');
            if (miniResumen) {
                if (datosSimilaresCiosa.length > 0) {
                    miniResumen.textContent = `⚡ ${datosSimilaresCiosa.length} con clave similar`;
                    miniResumen.classList.remove('hidden');
                } else {
                    miniResumen.classList.add('hidden');
                }
            }

            const leyendaFila = document.getElementById('leyendaFilaCiosa');
            if (leyendaFila) {
                if (datosSimilaresCiosa.length > 0) {
                    leyendaFila.classList.remove('hidden');
                } else {
                    leyendaFila.classList.add('hidden');
                }
            }

            actualizarContadorSeleccionados();
        }

        function renderizarSeccionCiosa() {
            const sec = document.getElementById('seccionCiosaSimilares');
            const listaEl = document.getElementById('ciosaListaSimilares');

            if (!datosSimilaresCiosa || datosSimilaresCiosa.length === 0) {
                if (sec) sec.classList.remove('hidden');
                actualizarBadgesContadoresCiosa();
                if (listaEl) {
                    listaEl.innerHTML = `
                        <div class="p-5 text-center text-slate-500 bg-white/80 rounded-2xl border border-amber-200 text-xs">
                            No se detectaron variantes de claves ni artículos similares para las partidas de esta factura de CIOSA.
                        </div>
                    `;
                }
                return;
            }

            actualizarBadgesContadoresCiosa();
            listaEl.innerHTML = '';

            datosSimilaresCiosa.forEach(c => {
                const cardIdSafe = 'ciosa_card_' + c.item_xml.codigo.replace(/[^a-zA-Z0-9]/g, '_');
                const card = document.createElement('div');
                card.id = cardIdSafe;
                card.className = "ciosa-card bg-white rounded-2xl border border-amber-200 shadow-xs p-3.5 space-y-2.5 transition";

                let filasSimilaresHtml = '';
                c.similares.forEach(s => {
                    const badgeVariante = s.es_misma_clave
                        ? `<span class="bg-slate-200 text-slate-700 text-[9px] font-bold px-1.5 py-0.5 rounded">Misma clave exacta</span>`
                        : `<span class="bg-amber-100 text-amber-800 text-[9px] font-bold px-1.5 py-0.5 rounded border border-amber-300">Variante (Base: ${c.base_detectada})</span>`;

                    const subio = s.subio_precio;

                    const renderPrecioCol = (etq, pBD, pXML, dif) => {
                        let badgeDif = '';
                        let colorBorder = 'bg-white border-slate-200';
                        if (dif > 0.05) {
                            badgeDif = `<span class="text-[9px] font-black text-rose-600">▲ +${formatearMoneda(dif)}</span>`;
                            colorBorder = 'bg-rose-50/70 border-rose-200';
                        } else if (dif < -0.05) {
                            badgeDif = `<span class="text-[9px] font-black text-emerald-600">▼ ${formatearMoneda(dif)}</span>`;
                            colorBorder = 'bg-emerald-50/50 border-emerald-200';
                        } else {
                            badgeDif = `<span class="text-[9px] font-bold text-slate-400">= Mismo</span>`;
                        }

                        return `
                            <div class="p-1.5 rounded-xl border ${colorBorder} flex flex-col justify-center">
                                <div class="text-[8.5px] font-extrabold text-slate-400 uppercase tracking-tight">${etq} (c/IVA)</div>
                                <div class="text-[10.5px] text-slate-600 leading-tight">BD: <strong>${formatearMoneda(pBD)}</strong></div>
                                <div class="text-[11px] font-black text-slate-900 leading-tight" title="Precio calculado con margen e IVA incluido">Sugerido: ${formatearMoneda(pXML)}</div>
                                <div class="leading-none mt-0.5">${badgeDif}</div>
                            </div>
                        `;
                    };

                    filasSimilaresHtml += `
                        <div class="bg-slate-50/90 rounded-xl p-2.5 border border-slate-200 text-xs flex flex-col xl:flex-row xl:items-center justify-between gap-2.5">
                            <div class="flex items-start gap-2.5 min-w-[240px]">
                                <input type="checkbox" id="ciosa_chk_${s.articulo_id}" ${subio ? 'checked' : ''} class="ciosa-item-chk mt-1 w-4 h-4 text-emerald-600 rounded border-slate-300 cursor-pointer" data-artid="${s.articulo_id}" data-clave="${s.clave}">
                                <div>
                                    <div class="flex items-center gap-1.5">
                                        <span class="font-mono font-black text-sm text-slate-900">${s.clave}</span>
                                        ${badgeVariante}
                                        <span class="text-[10px] text-slate-400 font-mono">ID: ${s.articulo_id}</span>
                                    </div>
                                    <div class="text-slate-800 font-medium text-[11px] truncate max-w-[280px]" title="${s.nombre}">${s.nombre}</div>
                                    <div class="text-slate-500 text-[10px]">${s.linea || 'Sin línea'}</div>
                                </div>
                            </div>

                            <div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5 flex-1 text-center font-mono">
                                ${renderPrecioCol('Lista (Público)', s.precios_bd.publico, s.precios_xml.publico, s.diferencias.publico)}
                                ${renderPrecioCol('Mínimo', s.precios_bd.minimo, s.precios_xml.minimo, s.diferencias.minimo)}
                                ${renderPrecioCol('Talleres', s.precios_bd.talleres, s.precios_xml.talleres, s.diferencias.talleres)}
                                ${renderPrecioCol('Mayoreo', s.precios_bd.mayoreo, s.precios_xml.mayoreo, s.diferencias.mayoreo)}
                            </div>

                            <div class="self-end xl:self-center">
                                <button type="button" id="btnActCiosa_${s.articulo_id}" onclick="actualizarPreciosArticuloCiosa(${s.articulo_id})" class="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-3 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-sm">
                                    <span>⚡</span> Actualizar <strong>${s.clave}</strong>
                                </button>
                            </div>
                        </div>
                    `;
                });

                card.innerHTML = `
                    <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-2 bg-amber-50/80 p-2.5 rounded-xl border border-amber-200/90 text-xs">
                        <div class="flex items-center gap-2">
                            <span class="font-mono font-black text-sm bg-amber-200 text-amber-950 px-2.5 py-0.5 rounded-lg border border-amber-300">
                                XML: ${c.item_xml.codigo}
                            </span>
                            <span class="font-semibold text-slate-800 truncate max-w-[340px]" title="${c.item_xml.descripcion}">
                                ${c.item_xml.descripcion}
                            </span>
                            ${c.sufijo_detectado ? `<span class="bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded text-[10px] font-bold">Base: ${c.base_detectada} | Sufijo: "${c.sufijo_detectado}"</span>` : ''}
                        </div>
                        <div class="flex flex-wrap items-center gap-2 text-[10.5px] font-mono">
                            <span class="bg-white px-2 py-0.5 rounded-lg border border-slate-200 font-bold text-slate-700">Costo Factura: <strong>${formatearMoneda(c.item_xml.costo)}</strong></span>
                        </div>
                    </div>
                    <div class="space-y-1.5">
                        ${filasSimilaresHtml}
                    </div>
                `;
                listaEl.appendChild(card);
            });
        }

        function renderBadgeCiosaSimilares(codigo) {
            const up = (codigo || '').trim().toUpperCase();
            const sims = mapaSimilaresCiosaPorCodigo[up];
            if (!sims || sims.length === 0) return '';

            const simPrincipal = sims.find(s => !s.es_misma_clave) || sims[0];
            const pFmt = simPrincipal.precios_bd.publico ? formatearMoneda(simPrincipal.precios_bd.publico) : 'S/P';
            const subio = simPrincipal.subio_precio;

            return `
                <div class="mt-1">
                    <button type="button" onclick="enfocarCiosaSimilar('${codigo}')" title="Ver precios de ${simPrincipal.clave} en panel de revisión CIOSA" class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold ${subio ? 'bg-amber-100 text-amber-950 border border-amber-300 hover:bg-amber-200' : 'bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200'} transition cursor-pointer shadow-xs">
                        <span>🔄</span>
                        <span>Similar: <strong>${simPrincipal.clave}</strong></span>
                        <span class="${subio ? 'text-rose-700 font-extrabold' : 'text-slate-600'}">(${pFmt})</span>
                    </button>
                </div>
            `;
        }

        function enfocarCiosaSimilar(codigo) {
            const cardIdSafe = 'ciosa_card_' + (codigo || '').replace(/[^a-zA-Z0-9]/g, '_');
            const el = document.getElementById(cardIdSafe);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.classList.add('ring-4', 'ring-amber-400', 'bg-amber-50');
                setTimeout(() => {
                    el.classList.remove('ring-4', 'ring-amber-400', 'bg-amber-50');
                }, 2000);
            }
        }

        function toggleDetalleCiosa() {
            const lista = document.getElementById('ciosaListaSimilares');
            const txt = document.getElementById('txtBtnToggleCiosa');
            if (!lista) return;
            if (lista.classList.contains('hidden')) {
                lista.classList.remove('hidden');
                if (txt) txt.textContent = 'Ocultar Detalle';
            } else {
                lista.classList.add('hidden');
                if (txt) txt.textContent = 'Ver Detalle';
            }
        }

        function toggleSelectAllCiosa(checked) {
            document.querySelectorAll('.ciosa-item-chk').forEach(cb => {
                cb.checked = checked;
            });
        }

        function filtrarListaCiosa(val) {
            const q = (val || '').trim().toUpperCase();
            document.querySelectorAll('.ciosa-card').forEach(card => {
                const txt = card.textContent.toUpperCase();
                if (!q || txt.includes(q)) {
                    card.classList.remove('hidden');
                } else {
                    card.classList.add('hidden');
                }
            });
        }

        async function actualizarPreciosArticuloCiosa(articuloId) {
            let similarEncontrado = null;
            let claveArticulo = '';
            for (const match of datosSimilaresCiosa) {
                const s = (match.similares || []).find(sim => sim.articulo_id === articuloId);
                if (s) {
                    similarEncontrado = s;
                    claveArticulo = s.clave;
                    break;
                }
            }
            if (!similarEncontrado) return;

            const btn = document.getElementById(`btnActCiosa_${articuloId}`);
            const originalText = btn ? btn.innerHTML : '';
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = `<span class="animate-spin inline-block mr-1">⌛</span> Actualizando...`;
            }

            try {
                const res = await fetch('/api/ciosa/actualizar-precios-similares', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        articulos: [{
                            articulo_id: articuloId,
                            clave: claveArticulo,
                            precios: similarEncontrado.precios_xml
                        }]
                    })
                });
                const data = await res.json();
                if (data.success) {
                    mostrarAlerta('success', `✓ Precios de <strong>${claveArticulo}</strong> actualizados con éxito en Microsip.`);
                    if (btn) {
                        btn.className = "bg-emerald-600 text-white font-bold text-xs px-3 py-2 rounded-xl flex items-center gap-1.5 cursor-default";
                        btn.innerHTML = `<span>✔</span> Precios Actualizados`;
                        btn.disabled = true;
                    }
                    similarEncontrado.precios_bd = { ...similarEncontrado.precios_xml };
                    similarEncontrado.diferencias = { publico: 0, minimo: 0, talleres: 0, mayoreo: 0 };
                    similarEncontrado.subio_precio = false;
                    actualizarBadgesContadoresCiosa();
                } else {
                    throw new Error(data.error || 'Error al actualizar precios');
                }
            } catch (err) {
                mostrarAlerta('error', `Error al actualizar precios de ${claveArticulo}: ${err.message}`);
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = originalText;
                }
            }
        }

        async function actualizarPreciosCiosaSeleccionados() {
            const checkboxes = document.querySelectorAll('.ciosa-item-chk:checked');
            if (checkboxes.length === 0) {
                alert('Selecciona al menos un artículo para actualizar sus precios en Microsip.');
                return;
            }

            const articulosAEnviar = [];
            checkboxes.forEach(cb => {
                const artId = parseInt(cb.dataset.artid);
                for (const match of datosSimilaresCiosa) {
                    const s = (match.similares || []).find(sim => sim.articulo_id === artId);
                    if (s) {
                        articulosAEnviar.push({
                            articulo_id: artId,
                            clave: s.clave,
                            precios: s.precios_xml
                        });
                        break;
                    }
                }
            });

            if (articulosAEnviar.length === 0) return;

            const btn = document.getElementById('btnActualizarTodosCiosa');
            const originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = `<span class="animate-spin inline-block mr-1">⌛</span> Actualizando ${articulosAEnviar.length} artículos...`;

            try {
                const res = await fetch('/api/ciosa/actualizar-precios-similares', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ articulos: articulosAEnviar })
                });
                const data = await res.json();
                if (data.success) {
                    mostrarAlerta('success', `✓ ¡Precios actualizados en Microsip! ${data.mensaje || ''}`);
                    articulosAEnviar.forEach(art => {
                        const b = document.getElementById(`btnActCiosa_${art.articulo_id}`);
                        if (b) {
                            b.className = "bg-emerald-600 text-white font-bold text-xs px-3 py-2 rounded-xl flex items-center gap-1.5 cursor-default";
                            b.innerHTML = `<span>✔</span> Precios Actualizados`;
                            b.disabled = true;
                        }
                    });
                    setTimeout(() => {
                        analizarSimilaresCiosa();
                    }, 800);
                } else {
                    throw new Error(data.error || 'Error al actualizar precios');
                }
            } catch (err) {
                mostrarAlerta('error', `Error al actualizar precios masivos: ${err.message}`);
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        }

