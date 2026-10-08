// ================= renderResurtidosGrid =================
function renderResurtidosGrid(rows) {
    const body = document.getElementById('resurtidosGridBody');
    const ventaCountNode = document.getElementById('resurtidosCountVenta');
    const equivCountNode = document.getElementById('resurtidosCountEquiv');
    const clasifCountNode = document.getElementById('resurtidosCountClasif');
    const updateLegendCounts = (venta, equiv, clasif) => {
        if (ventaCountNode) ventaCountNode.textContent = `Venta ${venta}`;
        if (equivCountNode) equivCountNode.textContent = `Equiv. ${equiv}`;
        if (clasifCountNode) clasifCountNode.textContent = `Clasif. ${clasif}`;
    };
    if (!body) return;
    if (!Array.isArray(rows) || !rows.length) {
        body.innerHTML = '<tr><td colspan="20" class="resurtidos-grid-empty">No se encontraron artículos vendidos en el periodo.</td></tr>';
        updateLegendCounts(0, 0, 0);
        return;
    }
    const sortedRows = [...rows].sort((left, right) => {
        const leftEq = String(left?.equivalencia || '').trim().toUpperCase();
        const rightEq = String(right?.equivalencia || '').trim().toUpperCase();
        const leftEmpty = leftEq === '';
        const rightEmpty = rightEq === '';

        if (leftEmpty !== rightEmpty) return leftEmpty ? -1 : 1;

        if (leftEq !== rightEq) {
            return leftEq.localeCompare(rightEq, 'es', { numeric: true, sensitivity: 'base' });
        }

        const leftParte = String(left?.numero_parte || '').trim().toUpperCase();
        const rightParte = String(right?.numero_parte || '').trim().toUpperCase();
        if (leftParte !== rightParte) {
            return leftParte.localeCompare(rightParte, 'es', { numeric: true, sensitivity: 'base' });
        }

        const leftId = String(left?.articulo_id || '').trim();
        const rightId = String(right?.articulo_id || '').trim();
        return leftId.localeCompare(rightId, 'es', { numeric: true, sensitivity: 'base' });
    });
    const sourceCounts = { venta: 0, equivalencia: 0, clasificacion: 0 };
    let previousEquivalencia = null;
    const rowsHtml = [];
    sortedRows.forEach(row => {
        const currentEquivalencia = String(row?.equivalencia || '').trim().toUpperCase();
        const currentIsEmpty = currentEquivalencia === '';
        const previousIsEmpty = previousEquivalencia === '';
        if (previousEquivalencia !== null) {
            const enteringEquivalenceBlock = previousIsEmpty && !currentIsEmpty;
            const changingEquivalentGroup = !currentIsEmpty && !previousIsEmpty && currentEquivalencia !== previousEquivalencia;
            if (enteringEquivalenceBlock || changingEquivalentGroup) {
                rowsHtml.push('<tr class="resurtidos-separator-row" aria-hidden="true"><td colspan="20"></td></tr>');
            }
        }
        const source = String(row.source_row || 'venta').trim().toLowerCase();
        if (source === 'equivalencia') sourceCounts.equivalencia += 1;
        else if (source === 'clasificacion') sourceCounts.clasificacion += 1;
        else sourceCounts.venta += 1;
        const rowClass = source === 'clasificacion'
            ? 'resurtidos-row-clasificacion'
            : (source === 'equivalencia' ? 'resurtidos-row-equivalencia' : 'resurtidos-row-venta');
        const sourceLabel = source === 'clasificacion'
            ? 'Clasif.'
            : (source === 'equivalencia' ? 'Equiv.' : 'Venta');
        const sourceBadgeClass = source === 'clasificacion'
            ? 'resurtidos-source-badge-clasificacion'
            : (source === 'equivalencia' ? 'resurtidos-source-badge-equivalencia' : 'resurtidos-source-badge-venta');
        const faltante = Math.max(0, Math.round(Number(row.promedio_de_inv || 0) - Number(row.inventario || 0)));
        const disponibleParaSurtir = Math.max(0, Math.floor(Number(row.inventario_cedis || 0)) - 1);
        const surtirA = Math.min(faltante, disponibleParaSurtir);
        rowsHtml.push(`<tr class="${rowClass}" data-source-row="${escapeGestionAlmacenesHtml(source)}" data-group-id="${row.grupo_id == null ? '' : escapeGestionAlmacenesHtml(row.grupo_id)}">
        <td class="resurtidos-id-column">${escapeGestionAlmacenesHtml(row.articulo_id)}</td>
        <td>${escapeGestionAlmacenesHtml(row.numero_parte)}</td>
        <td class="resurtidos-description-column" title="${escapeGestionAlmacenesHtml(row.descripcion)}">${escapeGestionAlmacenesHtml(row.descripcion)} <span class="resurtidos-source-badge ${sourceBadgeClass}">${sourceLabel}</span></td>
        <td class="resurtidos-number-cell">${Number(row.venta_periodo || 0)}</td>
        <td class="resurtidos-number-cell">${Number(row.venta_dias_antes || 0)}</td>
        <td class="resurtidos-number-cell">${Number(row.promedio || 0)}</td>
        <td class="resurtidos-number-cell">${Number(row.promedio_de_inv || 0)}</td>
        <td class="resurtidos-number-cell">${Number(row.inventario || 0)}</td>
        <td class="resurtidos-number-cell">${Number(row.inventario_cedis || 0)}</td>
        <td class="resurtidos-number-cell">${Number.isFinite(surtirA) ? surtirA : 0}</td>
        <td class="resurtidos-number-cell">${escapeGestionAlmacenesHtml(row.clasificacion)}</td>
        <td class="resurtidos-number-cell">${escapeGestionAlmacenesHtml(row.clasificacion_cedis)}</td>
        <td class="resurtidos-number-cell">${escapeGestionAlmacenesHtml(row.equivalencia)}</td>
        <td class="resurtidos-number-cell">${escapeGestionAlmacenesHtml(row.es_par || 'N')}</td>
        <td class="resurtidos-number-cell">${escapeGestionAlmacenesHtml(row.izq_der || 'N')}</td>
        <td class="resurtidos-number-cell">${Number(row.multiplo || 0)}</td>
        <td class="resurtidos-number-cell">${row.grupo_id == null ? '' : escapeGestionAlmacenesHtml(row.grupo_id)}</td>
        <td class="resurtidos-number-cell">${Number(row.maximo || 0)}</td>
        <td class="resurtidos-number-cell">${Number(row.reorden || 0)}</td>
        <td class="resurtidos-number-cell">${Number(row.minimo || 0)}</td>
    </tr>`);
        previousEquivalencia = currentEquivalencia;
    });
    body.innerHTML = rowsHtml.join('');
    updateLegendCounts(sourceCounts.venta, sourceCounts.equivalencia, sourceCounts.clasificacion);
}

async function removeResurtidosExcludedRows(companyId) {
    const body = document.getElementById('resurtidosGridBody');
    if (!body) return 0;
    const response = await fetch(`/api/resurtidos/grupos-excluidos?company_id=${encodeURIComponent(companyId)}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'No fue posible consultar los grupos excluidos.');
    const excludedIds = new Set(
        (payload.data?.grupos_excluidos || []).map(group => String(group?.grupo_id ?? '').trim()).filter(Boolean),
    );
    let removedCount = 0;
    body.querySelectorAll('tr.resurtidos-row-venta, tr.resurtidos-row-equivalencia, tr.resurtidos-row-clasificacion').forEach(row => {
        const grupoId = String(row.dataset.groupId || '').trim();
        if (grupoId && excludedIds.has(grupoId)) {
            row.remove();
            removedCount += 1;
        }
    });
    body.querySelectorAll('tr.resurtidos-separator-row').forEach(row => {
        const nextRow = row.nextElementSibling;
        if (!nextRow || nextRow.classList.contains('resurtidos-separator-row')) row.remove();
    });
    return removedCount;
}

async function markResurtidosUnfilteredRows(companyId) {
    const body = document.getElementById('resurtidosGridBody');
    if (!body) return 0;
    const response = await fetch(`/api/resurtidos/grupos-sin-filtrar?company_id=${encodeURIComponent(companyId)}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'No fue posible consultar los grupos sin filtrar.');
    const unfilteredIds = new Set(
        (payload.data?.grupos_sin_filtrar || []).map(group => String(group?.grupo_id ?? '').trim()).filter(Boolean),
    );
    let markedCount = 0;
    body.querySelectorAll('tr.resurtidos-row-venta, tr.resurtidos-row-equivalencia, tr.resurtidos-row-clasificacion').forEach(row => {
        const grupoId = String(row.dataset.groupId || '').trim();
        if (!grupoId || !unfilteredIds.has(grupoId)) return;
        row.classList.add('resurtidos-row-sin-filtrar');
        const numeroParteCell = row.cells[1];
        if (numeroParteCell && !numeroParteCell.querySelector('.resurtidos-unfiltered-badge')) {
            const badge = document.createElement('span');
            badge.className = 'resurtidos-unfiltered-badge';
            badge.textContent = 'SF';
            badge.title = 'Grupo marcado como SIN FILTRAR';
            numeroParteCell.append(' ', badge);
        }
        markedCount += 1;
    });
    return markedCount;
}


// ================= normalizeResurtidosSurtirNegativeValues =================
function normalizeResurtidosSurtirNegativeValues() {
    const body = document.getElementById('resurtidosGridBody');
    if (!body) return 0;
    let normalizedCount = 0;
    body.querySelectorAll('tr.resurtidos-row-venta, tr.resurtidos-row-equivalencia, tr.resurtidos-row-clasificacion').forEach(row => {
        const surtirCell = row.cells[9];
        const surtirValue = Number(String(surtirCell?.textContent || '').trim());
        if (Number.isFinite(surtirValue) && surtirValue < 0) {
            surtirCell.textContent = '0';
            normalizedCount += 1;
        }
    });
    return normalizedCount;
}


// ================= applyResurtidosMinimumByClassification =================
function applyResurtidosMinimumByClassification() {
    const body = document.getElementById('resurtidosGridBody');
    if (!body) return 0;
    const equivalenceCounts = getResurtidosEquivalenceCounts();
    const selectedClasificaciones = new Set([
        ['resurtidosCheckboxA', 'A'],
        ['resurtidosCheckboxB', 'B'],
        ['resurtidosCheckboxC', 'C'],
        ['resurtidosCheckboxD', 'D'],
        ['resurtidosCheckboxE', 'E'],
        ['resurtidosCheckboxN', 'N'],
    ].filter(([checkboxId]) => Boolean(document.getElementById(checkboxId)?.checked))
        .map(([, value]) => value));
    let appliedCount = 0;
    body.querySelectorAll('tr.resurtidos-row-venta, tr.resurtidos-row-equivalencia, tr.resurtidos-row-clasificacion').forEach(row => {
        const inventarioSucursal = Number(String(row.cells[7]?.textContent || '').trim());
        const inventarioCedis = Number(String(row.cells[8]?.textContent || '').trim());
        const surtirCell = row.cells[9];
        const surtirValue = Number(String(surtirCell?.textContent || '').trim());
        const clasificacionSucursal = String(row.cells[10]?.textContent || 'N').trim().toUpperCase() || 'N';
        const esPar = String(row.cells[13]?.textContent || 'N').trim().toUpperCase();
        if (!canProcessResurtidosEquivalenceRow(row, equivalenceCounts) || !selectedClasificaciones.has(clasificacionSucursal)) return;
        if (!Number.isFinite(surtirValue) || surtirValue !== 0) return;
        if (!Number.isFinite(inventarioSucursal) || inventarioSucursal !== 0) return;
        if (!Number.isFinite(inventarioCedis) || inventarioCedis <= 0) return;
        const piezasSugeridas = esPar === 'S' ? Math.min(2, Math.floor(inventarioCedis)) : 1;
        if (piezasSugeridas <= 0) return;
        surtirCell.textContent = String(piezasSugeridas);
        appliedCount += 1;
    });
    return appliedCount;
}


// ================= clearResurtidosUnselectedClassificationValues =================
function clearResurtidosUnselectedClassificationValues() {
    const body = document.getElementById('resurtidosGridBody');
    if (!body) return 0;
    const equivalenceCounts = getResurtidosEquivalenceCounts();
    const selectedClasificaciones = new Set([
        ['resurtidosCheckboxA', 'A'],
        ['resurtidosCheckboxB', 'B'],
        ['resurtidosCheckboxC', 'C'],
        ['resurtidosCheckboxD', 'D'],
        ['resurtidosCheckboxE', 'E'],
        ['resurtidosCheckboxN', 'N'],
    ].filter(([checkboxId]) => Boolean(document.getElementById(checkboxId)?.checked))
        .map(([, value]) => value));
    let clearedCount = 0;
    body.querySelectorAll('tr.resurtidos-row-venta, tr.resurtidos-row-equivalencia, tr.resurtidos-row-clasificacion').forEach(row => {
        const surtirCell = row.cells[9];
        const clasificacionSucursal = String(row.cells[10]?.textContent || 'N').trim().toUpperCase() || 'N';
        const surtirValue = Number(String(surtirCell?.textContent || '').trim());
        if (!canProcessResurtidosEquivalenceRow(row, equivalenceCounts) || selectedClasificaciones.has(clasificacionSucursal)) return;
        if (Number.isFinite(surtirValue) && surtirValue !== 0) {
            surtirCell.textContent = '0';
            clearedCount += 1;
        }
    });
    return clearedCount;
}


// ================= markResurtidosEquivalentGroupsToSupply =================
function markResurtidosEquivalentGroupsToSupply() {
    const body = document.getElementById('resurtidosGridBody');
    if (!body) return 0;
    const selectedClasificaciones = new Set([
        ['resurtidosCheckboxA', 'A'],
        ['resurtidosCheckboxB', 'B'],
        ['resurtidosCheckboxC', 'C'],
        ['resurtidosCheckboxD', 'D'],
        ['resurtidosCheckboxE', 'E'],
        ['resurtidosCheckboxN', 'N'],
    ].filter(([checkboxId]) => Boolean(document.getElementById(checkboxId)?.checked))
        .map(([, value]) => value));
    const groups = new Map();
    body.querySelectorAll('tr.resurtidos-row-venta, tr.resurtidos-row-equivalencia, tr.resurtidos-row-clasificacion').forEach(row => {
        if (isResurtidosUnfilteredRow(row)) return;
        const equivalencia = String(row.cells[12]?.textContent || '').trim().toUpperCase();
        if (!equivalencia) return;
        if (!groups.has(equivalencia)) groups.set(equivalencia, []);
        groups.get(equivalencia).push(row);
    });
    let markedCount = 0;
    groups.forEach(rows => {
        if (rows.length <= 1) return;
        const allSurtirZero = rows.every(row => Number(String(row.cells[9]?.textContent || '').trim()) === 0);
        const allInventarioSucursalZero = rows.every(row => Number(String(row.cells[7]?.textContent || '').trim()) === 0);
        const hasSelectedClassification = rows.some(row => {
            const clasificacion = String(row.cells[10]?.textContent || 'N').trim().toUpperCase() || 'N';
            return selectedClasificaciones.has(clasificacion);
        });
        if (!allSurtirZero || !allInventarioSucursalZero || !hasSelectedClassification) return;
        rows.forEach(row => {
            const numeroParteCell = row.cells[1];
            if (!numeroParteCell || numeroParteCell.querySelector('.resurtidos-supply-badge')) return;
            const badge = document.createElement('span');
            badge.className = 'resurtidos-supply-badge';
            badge.textContent = 'AS';
            badge.title = 'Articulo sugerido a surtir';
            numeroParteCell.append(' ', badge);
            markedCount += 1;
        });
    });
    return markedCount;
}


// ================= applyResurtidosEquivalentGroupSupplySelection =================
function applyResurtidosEquivalentGroupSupplySelection() {
    const body = document.getElementById('resurtidosGridBody');
    if (!body) return 0;
    const classificationOrder = { A: 0, B: 1, C: 2, D: 3, E: 4, N: 5 };
    const selectedClassifications = new Set([
        ['resurtidosCheckboxA', 'A'],
        ['resurtidosCheckboxB', 'B'],
        ['resurtidosCheckboxC', 'C'],
        ['resurtidosCheckboxD', 'D'],
        ['resurtidosCheckboxE', 'E'],
        ['resurtidosCheckboxN', 'N'],
    ].filter(([checkboxId]) => Boolean(document.getElementById(checkboxId)?.checked))
        .map(([, value]) => value));
    const groups = new Map();
    body.querySelectorAll('tr.resurtidos-row-venta, tr.resurtidos-row-equivalencia, tr.resurtidos-row-clasificacion').forEach(row => {
        if (isResurtidosUnfilteredRow(row)) return;
        const equivalencia = String(row.cells[12]?.textContent || '').trim().toUpperCase();
        if (!equivalencia) return;
        if (!groups.has(equivalencia)) groups.set(equivalencia, []);
        groups.get(equivalencia).push(row);
    });
    let selectedCount = 0;
    groups.forEach(rows => {
        if (rows.length <= 1) return;
        const eligibleRows = rows.filter(row => {
            const classification = String(row.cells[10]?.textContent || 'N').trim().toUpperCase() || 'N';
            return selectedClassifications.has(classification);
        });
        const requestedSupply = eligibleRows.reduce((total, row) => {
            const supply = Number(String(row.cells[9]?.textContent || '').trim());
            return total + (Number.isFinite(supply) ? Math.max(0, supply) : 0);
        }, 0);
        const hasDestinationInventory = eligibleRows.some(row => {
            const inventory = Number(String(row.cells[7]?.textContent || '').trim());
            return Number.isFinite(inventory) && inventory > 0;
        });
        rows.forEach(row => {
            if (row.cells[9]) row.cells[9].textContent = '0';
        });
        if (!eligibleRows.length) return;
        if (hasDestinationInventory) return;

        const multiple = eligibleRows.reduce((current, row) => {
            const value = Number(String(row.cells[15]?.textContent || '').trim());
            return Number.isFinite(value) && value > current ? value : current;
        }, 0);
        const baseRequired = Math.max(1, requestedSupply, multiple);
        const requiredSupply = multiple > 1
            ? Math.ceil(baseRequired / multiple) * multiple
            : baseRequired;

        const candidates = eligibleRows.map((row, index) => {
            const inventarioCedis = Number(String(row.cells[8]?.textContent || '').trim());
            const clasificacion = String(row.cells[10]?.textContent || 'N').trim().toUpperCase() || 'N';
            return {
                row,
                index,
                inventarioCedis: Number.isFinite(inventarioCedis) ? inventarioCedis : 0,
                classificationRank: Object.prototype.hasOwnProperty.call(classificationOrder, clasificacion) ? classificationOrder[clasificacion] : classificationOrder.N,
            };
        }).filter(candidate => candidate.inventarioCedis > 0).sort((left, right) => {
            if (right.inventarioCedis !== left.inventarioCedis) return right.inventarioCedis - left.inventarioCedis;
            if (left.classificationRank !== right.classificationRank) return left.classificationRank - right.classificationRank;
            return left.index - right.index;
        });
        const selected = candidates[0];
        if (!selected || !selected.row.cells[9]) return;
        selected.row.cells[9].textContent = String(requiredSupply);
        selectedCount += 1;
    });
    return selectedCount;
}


// ================= clearResurtidosZeroCedisSupply =================
function clearResurtidosZeroCedisSupply() {
    const body = document.getElementById('resurtidosGridBody');
    if (!body) return 0;
    let clearedCount = 0;
    body.querySelectorAll('tr.resurtidos-row-venta, tr.resurtidos-row-equivalencia, tr.resurtidos-row-clasificacion').forEach(row => {
        const inventarioCedis = Number(String(row.cells[8]?.textContent || '').trim());
        const surtirCell = row.cells[9];
        const surtirValue = Number(String(surtirCell?.textContent || '').trim());
        if (Number.isFinite(inventarioCedis) && inventarioCedis <= 0 && Number.isFinite(surtirValue) && surtirValue !== 0) {
            surtirCell.textContent = '0';
            clearedCount += 1;
        }
    });
    return clearedCount;
}


// ================= applyResurtidosCedisMinimumReserve =================
function applyResurtidosCedisMinimumReserve() {
    const body = document.getElementById('resurtidosGridBody');
    if (!body) return 0;
    let adjustedCount = 0;
    body.querySelectorAll('tr.resurtidos-row-venta, tr.resurtidos-row-equivalencia, tr.resurtidos-row-clasificacion').forEach(row => {
        const objetivoInventario = Number(String(row.cells[6]?.textContent || '').trim());
        const inventarioSucursal = Number(String(row.cells[7]?.textContent || '').trim());
        const inventarioCedis = Number(String(row.cells[8]?.textContent || '').trim());
        const surtirCell = row.cells[9];
        const surtirValue = Number(String(surtirCell?.textContent || '').trim());
        if (!Number.isFinite(objetivoInventario) || !Number.isFinite(inventarioSucursal)
            || !Number.isFinite(inventarioCedis) || !Number.isFinite(surtirValue) || surtirValue <= 0) return;
        const faltante = Math.max(0, Math.round(objetivoInventario - inventarioSucursal));
        const disponibleParaSurtir = Math.max(0, Math.floor(inventarioCedis) - 1);
        const maxSurtir = Math.min(faltante, disponibleParaSurtir);
        if (surtirValue > maxSurtir) {
            surtirCell.textContent = String(maxSurtir);
            adjustedCount += 1;
        }
    });
    return adjustedCount;
}


// ================= enforceResurtidosEquivalentDestinationInventoryRule =================
function enforceResurtidosEquivalentDestinationInventoryRule() {
    const body = document.getElementById('resurtidosGridBody');
    if (!body) return 0;
    const groups = new Map();
    body.querySelectorAll('tr.resurtidos-row-venta, tr.resurtidos-row-equivalencia, tr.resurtidos-row-clasificacion').forEach(row => {
        if (isResurtidosUnfilteredRow(row)) return;
        const equivalencia = String(row.cells[12]?.textContent || '').trim().toUpperCase();
        if (!equivalencia) return;
        if (!groups.has(equivalencia)) groups.set(equivalencia, []);
        groups.get(equivalencia).push(row);
    });
    let clearedCount = 0;
    groups.forEach(rows => {
        if (rows.length <= 1) return;
        const hasDestinationInventory = rows.some(row => {
            const inventory = Number(String(row.cells[7]?.textContent || '').trim());
            return Number.isFinite(inventory) && inventory > 0;
        });
        if (!hasDestinationInventory) return;
        rows.forEach(row => {
            const supplyCell = row.cells[9];
            const supply = Number(String(supplyCell?.textContent || '').trim());
            if (supplyCell && Number.isFinite(supply) && supply !== 0) {
                supplyCell.textContent = '0';
                clearedCount += 1;
            }
        });
    });
    return clearedCount;
}


// ================= applyResurtidosEquivalentZeroInventoryFallback =================
function applyResurtidosEquivalentZeroInventoryFallback() {
    const body = document.getElementById('resurtidosGridBody');
    if (!body) return 0;
    const selectedClassifications = new Set([
        ['resurtidosCheckboxA', 'A'],
        ['resurtidosCheckboxB', 'B'],
        ['resurtidosCheckboxC', 'C'],
        ['resurtidosCheckboxD', 'D'],
        ['resurtidosCheckboxE', 'E'],
        ['resurtidosCheckboxN', 'N'],
    ].filter(([checkboxId]) => Boolean(document.getElementById(checkboxId)?.checked))
        .map(([, value]) => value));
    const groups = new Map();
    body.querySelectorAll('tr.resurtidos-row-venta, tr.resurtidos-row-equivalencia, tr.resurtidos-row-clasificacion').forEach(row => {
        const equivalencia = String(row.cells[12]?.textContent || '').trim().toUpperCase();
        if (!equivalencia) return;
        if (!groups.has(equivalencia)) groups.set(equivalencia, []);
        groups.get(equivalencia).push(row);
    });

    let selectedCount = 0;
    groups.forEach(rows => {
        if (rows.length < 2) return;
        const allSurtirZero = rows.every(row => Number(String(row.cells[9]?.textContent || '').trim()) === 0);
        const hasDestinationInventory = rows.some(row => {
            const inventory = Number(String(row.cells[7]?.textContent || '').trim());
            return Number.isFinite(inventory) && inventory > 0;
        });
        const hasSelectedClassification = rows.some(row => {
            const classification = String(row.cells[10]?.textContent || 'N').trim().toUpperCase() || 'N';
            return selectedClassifications.has(classification);
        });
        if (!allSurtirZero || hasDestinationInventory || !hasSelectedClassification) return;

        const candidates = rows.map((row, index) => {
            const classification = String(row.cells[10]?.textContent || 'N').trim().toUpperCase() || 'N';
            const cedisInventory = Math.max(0, Math.floor(Number(String(row.cells[8]?.textContent || '').trim()) || 0));
            return { row, index, classification, cedisInventory };
        }).filter(candidate => (
            !isResurtidosUnfilteredRow(candidate.row)
            && candidate.cedisInventory > 1
        )).sort((left, right) => {
            if (right.cedisInventory !== left.cedisInventory) return right.cedisInventory - left.cedisInventory;
            return left.index - right.index;
        });

        const selected = candidates[0];
        if (!selected || !selected.row.cells[9]) return;

        const targetInventory = Math.max(0, Math.round(Number(String(selected.row.cells[6]?.textContent || '').trim()) || 0));
        const destinationInventory = Math.max(0, Math.floor(Number(String(selected.row.cells[7]?.textContent || '').trim()) || 0));
        const rawMultiple = Math.floor(Number(String(selected.row.cells[15]?.textContent || '').trim()) || 0);
        const multiple = rawMultiple > 0 ? rawMultiple : 1;
        const isPair = String(selected.row.cells[13]?.textContent || '').trim().toUpperCase() === 'S';
        const packSize = isPair ? (multiple / (() => {
            let left = multiple;
            let right = 2;
            while (right) [left, right] = [right, left % right];
            return left || 1;
        })()) * 2 : multiple;
        const required = Math.max(packSize, targetInventory - destinationInventory);
        const requested = Math.ceil(required / packSize) * packSize;
        const available = Math.max(0, selected.cedisInventory - 1);
        selected.row.cells[9].textContent = String(Math.min(requested, available));
        selectedCount += 1;
    });

    return selectedCount;
}


// ================= applyResurtidosUnfilteredNoSalesMinimum =================
function applyResurtidosUnfilteredNoSalesMinimum() {
    const body = document.getElementById('resurtidosGridBody');
    if (!body) return 0;
    const selectedClassifications = new Set([
        ['resurtidosCheckboxA', 'A'],
        ['resurtidosCheckboxB', 'B'],
        ['resurtidosCheckboxC', 'C'],
        ['resurtidosCheckboxD', 'D'],
        ['resurtidosCheckboxE', 'E'],
        ['resurtidosCheckboxN', 'N'],
    ].filter(([checkboxId]) => Boolean(document.getElementById(checkboxId)?.checked))
        .map(([, value]) => value));
    const greatestCommonDivisor = (left, right) => {
        let a = Math.abs(left);
        let b = Math.abs(right);
        while (b) [a, b] = [b, a % b];
        return a || 1;
    };
    let adjustedCount = 0;

    body.querySelectorAll('tr.resurtidos-row-venta, tr.resurtidos-row-equivalencia, tr.resurtidos-row-clasificacion').forEach(row => {
        if (!isResurtidosUnfilteredRow(row)) return;
        const sales = Number(String(row.cells[3]?.textContent || '').trim());
        const classification = String(row.cells[10]?.textContent || 'N').trim().toUpperCase() || 'N';
        if (!Number.isFinite(sales) || sales !== 0 || !selectedClassifications.has(classification)) return;

        const destinationInventory = Math.max(0, Math.floor(Number(String(row.cells[7]?.textContent || '').trim()) || 0));
        const cedisInventory = Math.max(0, Math.floor(Number(String(row.cells[8]?.textContent || '').trim()) || 0));
        const rawMultiple = Math.floor(Number(String(row.cells[15]?.textContent || '').trim()) || 0);
        const multiple = rawMultiple > 0 ? rawMultiple : 1;
        const isPair = String(row.cells[13]?.textContent || '').trim().toUpperCase() === 'S';
        const packSize = isPair ? (multiple / greatestCommonDivisor(multiple, 2)) * 2 : multiple;
        const destinationGap = Math.max(0, packSize - destinationInventory);
        if (!destinationGap) return;

        const requestedUnits = Math.ceil(destinationGap / packSize) * packSize;
        const availableToShip = Math.max(0, cedisInventory - 1);
        const supply = Math.min(requestedUnits, availableToShip);
        if (row.cells[9]) {
            row.cells[9].textContent = String(supply);
            adjustedCount += 1;
        }
    });

    return adjustedCount;
}


