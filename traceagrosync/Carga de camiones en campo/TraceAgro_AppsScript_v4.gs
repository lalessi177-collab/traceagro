// TraceAgro Sync — Apps Script v4
// Reemplazá el código anterior con este
// Desplegar → Nueva implementación

function doGet(e) {
  const result = handleRequest(e);
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  return doGet(e);
}

function handleRequest(e) {
  try {
    const p = e.parameter;

    if (!p.action) return { status: 'TraceAgro Sync v4 activo ✓' };

    if (p.action === 'write') return escribirLote(p);
    if (p.action === 'read')  return leerResumen(p);

    return { error: 'Acción no reconocida' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function getOrCreateSheet(p) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cam = (p.campania || '').replace('/', '-');
  const sheetName = p.establecimiento + '-' + p.grano + '-' + cam;

  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    const headers = [
      'Fecha', 'Técnico', 'Lote', 'Has cosechadas', 'Variedad',
      'Máquina/Proveedor', 'Kg Húmedos', 'Kg Secos', 'Destino', 'Embolsadora'
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length)
      .setBackground('#3B6D11')
      .setFontColor('#FFFFFF')
      .setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, headers.length, 120);
    sheet.setColumnWidth(9, 220);
  }
  return sheet;
}

function escribirLote(p) {
  const sheet = getOrCreateSheet(p);
  const deposito = p.establecimiento + ' - granos';
  const hasVal = parseFloat(p.lote_has) || 0;
  const kgDep = parseFloat(p.lote_kgDeposito) || 0;
  const silos = p.lote_silosDetalle ? p.lote_silosDetalle.split('||').filter(s=>s) : [];
  const movs  = p.lote_movsDetalle  ? p.lote_movsDetalle.split('||').filter(s=>s)  : [];

  let firstRow = true;

  const appendRow = (kg, dest, emb) => {
    sheet.appendRow([
      p.fecha, p.tecnico, p.lote_num,
      firstRow ? hasVal : '',
      p.lote_variedad || '', p.lote_maquina || '',
      kg, kg, dest, emb || ''
    ]);
    const row = sheet.getLastRow();
    sheet.getRange(row, 1, 1, 10)
      .setBackground(row % 2 === 0 ? '#D6E4D0' : '#FFFFFF');
    firstRow = false;
  };

  if (kgDep > 0) appendRow(kgDep, deposito, '');
  silos.forEach(s => {
    const parts = s.split(':::');
    if (parts[0]) appendRow(parseFloat(parts[1]) || 0, parts[0].trim(), parts[2] || '');
  });
  movs.forEach(m => {
    const parts = m.split(':::');
    if (parts[0]) appendRow(parseFloat(parts[1]) || 0, parts[0].trim(), '');
  });

  return { ok: true, hoja: sheet.getName(), filas: sheet.getLastRow() - 1 };
}

function leerResumen(p) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cam = (p.campania || '').replace('/', '-');
  const sheetName = p.establecimiento + '-' + p.grano + '-' + cam;

  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { ok: false, error: 'Hoja no encontrada: ' + sheetName };

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return { ok: true, hoja: sheetName, filas: [] };

  const headers = data[0].map(h => String(h).trim());
  const rows = data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i] !== '' ? row[i] : '');
    return obj;
  });

  return { ok: true, hoja: sheetName, filas: rows };
}
