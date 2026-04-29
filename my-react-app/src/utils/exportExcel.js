import ExcelJS from 'exceljs';

function normalizeStatusKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function toArgb(hex) {
  const raw = String(hex || '').replace('#', '').trim();
  if (raw.length !== 6) return 'FFFFFFFF';
  return `FF${raw.toUpperCase()}`;
}

export async function exportToExcel(rows, fileName = 'export.xlsx', headers = [], options = {}) {
  if (!Array.isArray(rows) || rows.length === 0) return;

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Export');

  const headerKeys = headers.length ? headers : Object.keys(rows[0]);
  const statusColumnName = options.statusColumnName || 'Estado';
  const statusStyleMap = options.statusStyleMap || {};

  worksheet.addRow(headerKeys);
  const headerRow = worksheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FF1F2937' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF1F5F9' }
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
    };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
  });

  rows.forEach((row) => {
    const values = headerKeys.map((key) => row[key]);
    worksheet.addRow(values);
  });

  const statusColIndex = headerKeys.findIndex((key) => key === statusColumnName) + 1;
  if (statusColIndex > 0) {
    for (let rowIndex = 2; rowIndex <= worksheet.rowCount; rowIndex += 1) {
      const cell = worksheet.getRow(rowIndex).getCell(statusColIndex);
      const statusKey = normalizeStatusKey(cell.value);
      const style = statusStyleMap[statusKey];
      if (!style) continue;

      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: toArgb(style.bg) }
      };
      cell.font = {
        bold: true,
        color: { argb: toArgb(style.color) }
      };
    }
  }

  worksheet.columns.forEach((column) => {
    let maxLength = 12;
    column.eachCell({ includeEmpty: true }, (cell) => {
      const value = cell.value === null || cell.value === undefined ? '' : String(cell.value);
      maxLength = Math.max(maxLength, value.length + 2);
    });
    column.width = Math.min(40, maxLength);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
