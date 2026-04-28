// TraceAgro Sync — Apps Script v11
// Acciones: write_cosecha, write_traslado_silo, read_cosecha, read_traslados, update_cosecha

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify(handleRequest(e)))
    .setMimeType(ContentService.MimeType.JSON);
}
function doPost(e) { return doGet(e); }

function handleRequest(e) {
  try {
    const p = e.parameter;
    if (!p.action) return { status: 'TraceAgro v10 OK' };
    if (p.action === 'write_cosecha')         return writeCosecha(p);
    if (p.action === 'write_traslado_silo')   return writeTraslado(p);
    if (p.action === 'read_cosecha')          return readCosecha(p);
    if (p.action === 'read_traslados')        return readTraslados(p);
    if (p.action === 'update_cosecha')        return updateCosecha(p);
    if (p.action === 'next_asiento')          return nextAsiento(p);
    if (p.action === 'update_traslado')       return updateTraslado(p);
    if (p.action === 'next_asiento_traslado') return nextAsientoTraslado(p);
    return { error: 'Acción desconocida: ' + p.action };
  } catch(err) {
    return { ok: false, error: err.message };
  }
}

function getSheet(ss, name, headers, color) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    const r = sh.getRange(1, 1, 1, headers.length);
    r.setValues([headers]);
    r.setBackground(color || '#3B6D11').setFontColor('#FFFFFF').setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.setColumnWidths(1, headers.length, 120);
  }
  return sh;
}

function writeCosecha(p) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const camp = (p.campania || '').replace('/', '_');
  const sheetName = 'C_' + p.campo + '-' + p.cultivo + '-' + camp;
  const headers = ['Asiento','Fecha','Técnico','Lote','Has','Variedad','Contrato',
    'Kg Húmedos','Humedad %','Kg Secos','Destino tipo','CP / Silo / Destino',
    'Chofer','Embolso','Contratista'];
  const sh = getSheet(ss, sheetName, headers, '#3B6D11');

  const bg = p.destino === 'cam' ? '#FFFF99' : p.destino === 'silo' ? '#C6EFCE' : '#BDD7EE';
  const fecha = (p.fecha || '').split('T')[0];
  const cpSilo = p.cpSilo || '';
  const asiento = p.asiento || '001';

  // Para camiones: verificar que el CP no esté duplicado en cosecha ni en traslados
  if (p.destino === 'cam' && cpSilo) {
    // Duplicado en cosecha — devolver asiento donde está
    const dataCos = sh.getDataRange().getValues();
    const headersCos = dataCos[0].map(h => String(h).trim());
    const idxCP   = headersCos.indexOf('CP / Silo / Destino');
    const idxTec  = headersCos.indexOf('Técnico');
    const idxAs   = headersCos.indexOf('Asiento');
    for (let i = 1; i < dataCos.length; i++) {
      if (String(dataCos[i][idxCP]).trim() === cpSilo &&
          String(dataCos[i][idxTec]).trim() === p.tecnico) {
        const asientoExistente = String(dataCos[i][idxAs]).trim() || '?';
        return { ok: true, skipped: true, motivo: 'duplicado', cp: cpSilo, asientoExistente };
      }
    }
    // Duplicado en traslados — devolver asiento donde está
    const trasladoName = 'T_' + p.campo + '-' + p.cultivo + '-' + camp;
    const shT = ss.getSheetByName(trasladoName);
    if (shT && shT.getLastRow() > 1) {
      const dataT = shT.getDataRange().getValues();
      const headersT = dataT[0].map(h => String(h).trim());
      const idxCPT = headersT.indexOf('Carta de Porte');
      const idxAsT = headersT.indexOf('Asiento');
      for (let i = 1; i < dataT.length; i++) {
        if (String(dataT[i][idxCPT]).trim() === cpSilo) {
          const asientoExistente = String(dataT[i][idxAsT]).trim() || '?';
          return { ok: false, error: 'CP_EN_TRASLADO', cp: cpSilo, asientoExistente };
        }
      }
    }
  }

  sh.appendRow([
    asiento, fecha, p.tecnico, p.lote,
    parseFloat(p.has) || '',
    p.variedad, p.contrato,
    parseFloat(p.kgH) || 0,
    parseFloat(p.hum) || '',
    parseFloat(p.kgS) || 0,
    p.destino, cpSilo,
    p.chofer || '', p.embolso || '', p.contratista || ''
  ]);
  sh.getRange(sh.getLastRow(), 1, 1, headers.length).setBackground(bg);
  return { ok: true, hoja: sheetName, fila: sh.getLastRow() };
}

function updateCosecha(p) {
  // Borra todas las filas del asiento indicado y las reescribe
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const camp = (p.campania || '').replace('/', '_');
  const sheetName = 'C_' + p.campo + '-' + p.cultivo + '-' + camp;
  const sh = ss.getSheetByName(sheetName);
  if (!sh) return writeCosecha(p);

  // Borrar filas del asiento
  const asiento = p.asiento || '001';
  const data = sh.getDataRange().getValues();
  const headers0 = data[0].map(h => String(h).trim());
  const idxAs = headers0.indexOf('Asiento');
  // Borrar de abajo para arriba para no desplazar índices
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][idxAs]).trim() === asiento) {
      sh.deleteRow(i + 1);
    }
  }
  return { ok: true, deleted: true, asiento };
}

function nextAsiento(p) {
  // Devuelve el próximo número de asiento disponible
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const camp = (p.campania || '').replace('/', '_');
  const sheetName = 'C_' + p.campo + '-' + p.cultivo + '-' + camp;
  const sh = ss.getSheetByName(sheetName);
  if (!sh) return { ok: true, next: '001' };
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return { ok: true, next: '001' };
  const headers0 = data[0].map(h => String(h).trim());
  const idxAs = headers0.indexOf('Asiento');
  let max = 0;
  data.slice(1).forEach(row => {
    const n = parseInt(row[idxAs]) || 0;
    if (n > max) max = n;
  });
  return { ok: true, next: String(max + 1).padStart(3, '0') };
}

function writeTraslado(p) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const camp = (p.campania || '').replace('/', '_');
  const sheetName = 'T_' + p.campo + '-' + p.cultivo + '-' + camp;
  const headers = ['Asiento','Fecha','Técnico','Silo de origen','Kg','Carta de Porte',
    'Destino','Chofer','Contrato','Transportista'];
  const sh = getSheet(ss, sheetName, headers, '#534AB7');

  const fecha = (p.fecha || '').split('T')[0];
  const asiento = p.asiento || '001';
  const cp = p.cp || '';

  // Verificar que el CP no exista ya en la hoja de cosecha
  if (cp) {
    const cosechaName = 'C_' + p.campo + '-' + p.cultivo + '-' + camp;
    const shC = ss.getSheetByName(cosechaName);
    if (shC) {
      const dataC = shC.getDataRange().getValues();
      const headersC = dataC[0].map(h => String(h).trim());
      const idxCP  = headersC.indexOf('CP / Silo / Destino');
      const idxAsC = headersC.indexOf('Asiento');
      for (let i = 1; i < dataC.length; i++) {
        if (String(dataC[i][idxCP]).trim() === cp) {
          const asientoExistente = String(dataC[i][idxAsC]).trim() || '?';
          return { ok: false, error: 'CP_EN_COSECHA', cp, asientoExistente };
        }
      }
    }
    // Verificar que el CP no esté duplicado en traslados
    if (sh.getLastRow() > 1) {
      const dataT = sh.getDataRange().getValues();
      const headersT = dataT[0].map(h => String(h).trim());
      const idxCPT = headersT.indexOf('Carta de Porte');
      const idxAsT = headersT.indexOf('Asiento');
      for (let i = 1; i < dataT.length; i++) {
        if (String(dataT[i][idxCPT]).trim() === cp) {
          const asientoExistente = String(dataT[i][idxAsT]).trim() || '?';
          return { ok: true, skipped: true, motivo: 'duplicado', cp, asientoExistente };
        }
      }
    }
  }

  sh.appendRow([
    asiento, fecha, p.tecnico, p.silo,
    parseFloat(p.kg) || 0,
    cp, p.destino || '', p.chofer || '', p.contrato || '', p.transporte || ''
  ]);
  const row = sh.getLastRow();
  sh.getRange(row, 1, 1, 10).setBackground(row % 2 === 0 ? '#EEEDFE' : '#FFFFFF');
  return { ok: true, hoja: sheetName, fila: row };
}

function updateTraslado(p) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const camp = (p.campania || '').replace('/', '_');
  const sheetName = 'T_' + p.campo + '-' + p.cultivo + '-' + camp;
  const sh = ss.getSheetByName(sheetName);
  if (!sh) return { ok: true, deleted: false };
  const asiento = p.asiento || '001';
  const data = sh.getDataRange().getValues();
  const headers0 = data[0].map(h => String(h).trim());
  const idxAs = headers0.indexOf('Asiento');
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][idxAs]).trim() === asiento) sh.deleteRow(i + 1);
  }
  return { ok: true, deleted: true, asiento };
}

function nextAsientoTraslado(p) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const camp = (p.campania || '').replace('/', '_');
  const sheetName = 'T_' + p.campo + '-' + p.cultivo + '-' + camp;
  const sh = ss.getSheetByName(sheetName);
  if (!sh) return { ok: true, next: '001' };
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return { ok: true, next: '001' };
  const headers0 = data[0].map(h => String(h).trim());
  const idxAs = headers0.indexOf('Asiento');
  let max = 0;
  data.slice(1).forEach(row => {
    const n = parseInt(row[idxAs]) || 0;
    if (n > max) max = n;
  });
  return { ok: true, next: String(max + 1).padStart(3, '0') };
}


function readTraslados(p) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const camp = (p.campania || '').replace('/', '_');
  const sheetName = 'T_' + p.campo + '-' + p.cultivo + '-' + camp;
  const sh = ss.getSheetByName(sheetName);
  if (!sh) return { ok: true, filas: [] };
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return { ok: true, filas: [] };
  const headers = data[0].map(h => String(h).trim());
  const filas = data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i] !== '' ? row[i] : '');
    return obj;
  });
  return { ok: true, hoja: sheetName, filas };
}

function readCosecha(p) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const camp = (p.campania || '').replace('/', '_');
  const sheetName = 'C_' + p.campo + '-' + p.cultivo + '-' + camp;
  const sh = ss.getSheetByName(sheetName);
  if (!sh) return { ok: true, filas: [] };
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return { ok: true, filas: [] };
  const headers = data[0].map(h => String(h).trim());
  const filas = data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i] !== '' ? row[i] : '');
    return obj;
  });
  return { ok: true, hoja: sheetName, filas };
}
