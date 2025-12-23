export interface Account {
  id: number;
  name: string;
  secret: string;
}

// Export accounts to CSV
export function exportToCSV(accounts: Account[]): void {
  const headers = ['Name', 'Secret'];
  const rows = accounts.map(account => [account.name, account.secret]);

  const csvContent = [headers, ...rows]
    .map(row => row.map(field => `"${field.replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', 'totp-accounts.csv');
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Import accounts from CSV
export function importFromCSV(csvText: string): Account[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  if (headers.length !== 2 || headers[0].toLowerCase() !== 'name' || headers[1].toLowerCase() !== 'secret') {
    throw new Error('Invalid CSV format. Expected headers: Name,Secret');
  }

  const accounts: Account[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const fields = parseCSVLine(line);
    if (fields.length !== 2) continue;

    const [name, secret] = fields;
    if (!name.trim() || !secret.trim()) continue;

    // Clean and normalize secret
    const cleanSecret = secret.replace(/\s/g, '').toUpperCase();

    accounts.push({
      id: Date.now() + Math.random(), // Ensure unique IDs
      name: name.trim(),
      secret: cleanSecret
    });
  }

  return accounts;
}

// Parse a single CSV line, handling quoted fields
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator
      result.push(current.replace(/^"|"$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }

  // Add the last field
  result.push(current.replace(/^"|"$/g, ''));

  return result;
}