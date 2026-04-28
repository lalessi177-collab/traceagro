// TraceAgro Sync — Apps Script v5
// Cosecha + Traslados
// Reemplazá el código anterior y desplegá nueva implementación

function doGet(e) {
  const result = handleRequest(e);
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) { return doGet(e); }

function handleRequest(e) {
  try {
    const p = e.parameter;
    if (!p.action) return { status: 'TraceAgro Sync v5 ✓' };
    if (p.action === 'write_cosecha')  return escribirCosecha(p);
    if (p.action === 'read_cosecha')   return leerHoja(p, 'cosecha');
    if (p.action === 'write_traslado') return escribirTraslado(p);
    if (p.action === 'read_traslado')  return leerHoja(p, 'traslado');
    return { error: 'Acción no reconocida: ' + p.action };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── COSECHA ──
function escribirCosecha(p) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cam = (p.campania || '').replace('/', '-');
  const sheetName = 'C_' + p.establecimiento + '-' + p.grano + '-' + cam;

  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    const headers = ['Fecha','Técnico','Lote','Has cosechadas','Variedad',
                     'Máquina/Proveedor','Contrato','Humedad %','Kg Húmedos','Kg Secos','Destino','Embolsadora'];
    sheet.getRange(1,1,1,headers.length).setValues([headers]);
    sheet.getRange(1,1,1,headers.length)
      .setBackground('#3B6D11').setFontColor('#FFFFFF').setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, headers.length, 120);
    sheet.setColumnWidth(11, 220);
  }

  const deposito = p.establecimiento + ' - granos';
  const hasVal   = parseFloat(p.lote_has) || 0;
  const kgDep    = parseFloat(p.lote_kgDeposito) || 0;
  const silos    = p.lote_silosDetalle ? p.lote_silosDetalle.split('||').filter(s=>s) : [];
  const movs     = p.lote_movsDetalle  ? p.lote_movsDetalle.split('||').filter(s=>s)  : [];
  let firstRow   = true;

  const appendRow = (kg, dest, emb) => {
    const kgSec = p.lote_kg_secos ? parseFloat(p.lote_kg_secos) : kg;
    sheet.appendRow([p.fecha, p.tecnico, p.lote_num,
      firstRow ? hasVal : '', p.lote_variedad||'', p.lote_maquina||'',
      firstRow ? (p.lote_contrato||'') : '',
      firstRow ? (parseFloat(p.lote_humedad)||'') : '',
      kg, kgSec, dest, emb||'']);
    const row = sheet.getLastRow();
    sheet.getRange(row,1,1,10).setBackground(row%2===0?'#D6E4D0':'#FFFFFF');
    firstRow = false;
  };

  // CPEs desde campo (traslados directos)
  const cpes = p.lote_cpesDetalle ? p.lote_cpesDetalle.split('||').filter(s=>s) : [];
  if (cpes.length > 0) {
    cpes.forEach(c => {
      const parts = c.split(':::');
      appendRow(parseFloat(parts[1])||0, '🚛 CPE '+parts[0]+' → '+(parts[3]||''), parts[2]||'');
    });
  } else if (kgDep > 0) {
    appendRow(kgDep, deposito, '');
  }
  silos.forEach(s => {
    const parts = s.split(':::');
    if (parts[0]) appendRow(parseFloat(parts[1])||0, parts[0].trim(), parts[2]||'');
  });
  movs.forEach(m => {
    const parts = m.split(':::');
    if (parts[0]) appendRow(parseFloat(parts[1])||0, parts[0].trim(), '');
  });

  return { ok: true, hoja: sheetName, filas: sheet.getLastRow()-1 };
}

// ── TRASLADO ──
function escribirTraslado(p) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cam = (p.campania || '').replace('/', '-');
  const sheetName = 'T_' + p.establecimiento + '-' + p.grano + '-' + cam;

  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    const headers = ['Fecha Jornada','N° CPE','CTG','Contrato','Fecha CPE',
                     'Titular','Rte. Com. Prod.','Rte. Venta Prim.','Rep. Entregador',
                     'Destinatario','Destino','Empresa Transp.','Flete Pagador',
                     'Chofer','Silo/Origen','Grano','Campaña','Kg Bruto','Kg Tara','Kg Neto',
                     'Procedencia','Destino Merc.','Km','Tarifa','Técnico'];
    sheet.getRange(1,1,1,headers.length).setValues([headers]);
    sheet.getRange(1,1,1,headers.length)
      .setBackground('#534AB7').setFontColor('#FFFFFF').setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(2, 160);
    sheet.setColumnWidth(10, 200);
    sheet.setColumnWidth(11, 200);
    sheet.setColumnWidths(1, headers.length, 120);
  }

  sheet.appendRow([
    p.fechaJornada, p.nroCPE, p.ctg, p.contrato||'', p.fechaCPE,
    p.titular, p.rteComProd, p.rteVentaPrim, p.repEntregador,
    p.destinatario, p.destino, p.empresaTransp, p.fletePagador,
    p.chofer, p.siloOrigen||'', p.grano, p.campania,
    parseFloat(p.kgBruto)||0, parseFloat(p.kgTara)||0, parseFloat(p.kgNeto)||0,
    p.procedencia, p.destinoMerc, p.kms, p.tarifa, p.tecnico
  ]);

  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow,1,1,24).setBackground(lastRow%2===0?'#EEEDFE':'#FFFFFF');

  return { ok: true, hoja: sheetName, fila: lastRow };
}

// ── LEER ──
function leerHoja(p, tipo) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cam = (p.campania || '').replace('/', '-');
  const prefix = tipo === 'cosecha' ? 'C_' : 'T_';
  const sheetName = prefix + p.establecimiento + '-' + p.grano + '-' + cam;

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
