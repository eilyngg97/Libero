export const exportToCsv = (rows, fileName = 'export.csv', headers = []) => {
  if (!Array.isArray(rows) || rows.length === 0) return;

  const headerKeys = headers.length ? headers : Object.keys(rows[0]);
  const escapeCell = (value) => {
    const cell = value === null || value === undefined ? '' : String(value);
    return `"${cell.replace(/"/g, '""')}"`;
  };

  const lines = [
    headerKeys.map(escapeCell).join(','),
    ...rows.map((row) => headerKeys.map((key) => escapeCell(row[key])).join(','))
  ];

  const csvContent = `\ufeff${lines.join('\n')}`;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
