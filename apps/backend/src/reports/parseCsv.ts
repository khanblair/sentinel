/** RFC 4180 CSV parser: handles quoted fields, embedded commas/newlines, and
 * doubled-quote escaping. Mirrors formatCsv's escaping rules in reverse. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let sawAnyField = false;
  let i = 0;
  const len = text.length;

  function pushField(): void {
    row.push(field);
    field = "";
  }
  function pushRow(): void {
    pushField();
    rows.push(row);
    row = [];
    sawAnyField = false;
  }

  while (i < len) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      sawAnyField = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      pushField();
      sawAnyField = true;
      i += 1;
      continue;
    }
    if (char === "\r") {
      i += 1;
      continue;
    }
    if (char === "\n") {
      pushRow();
      i += 1;
      continue;
    }
    field += char;
    sawAnyField = true;
    i += 1;
  }
  if (sawAnyField || field.length > 0) {
    pushRow();
  }
  return rows;
}
