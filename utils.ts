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

// Normalize a base32 secret the same way the popup does
export function normalizeSecret(secret: string): string {
  return secret.replace(/[\s-]/g, "").toUpperCase()
}

// Returns an error message, or null if the secret looks like valid base32
export function validateSecret(secret: string): string | null {
  const clean = normalizeSecret(secret)
  if (!clean) return "Enter the secret"
  if (!/^[A-Z2-7]+=*$/.test(clean)) {
    return "Secrets use only the letters A–Z and the digits 2–7"
  }
  if (clean.replace(/=+$/, "").length < 8) return "That secret is too short"
  return null
}

export interface OtpauthDetails {
  secret: string
  name: string
  // Settings this extension can't honour (it always makes 6-digit SHA-1 codes every 30s)
  warnings: string[]
}

// Parse an otpauth://totp/... link (what QR codes contain)
export function parseOtpauthURI(text: string): OtpauthDetails | null {
  const value = text.trim()
  if (!/^otpauth:\/\//i.test(value)) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  const params = url.searchParams
  const secret = normalizeSecret(params.get("secret") || "")
  if (!secret) return null

  const label = decodeURIComponent(url.pathname.replace(/^\/+/, ""))
  const [labelIssuer, labelAccount] = label.includes(":")
    ? label.split(/:(.*)/s).map((s) => s.trim())
    : ["", label.trim()]
  const issuer = (params.get("issuer") || labelIssuer || "").trim()
  const name =
    issuer && labelAccount && issuer !== labelAccount
      ? `${issuer} (${labelAccount})`
      : issuer || labelAccount

  const warnings: string[] = []
  const type = (url.host || url.pathname.split("/")[0]).toLowerCase()
  if (type && type !== "totp")
    warnings.push(
      `This is a ${type.toUpperCase()} secret, and only TOTP is supported`
    )
  const algorithm = (params.get("algorithm") || "SHA1").toUpperCase()
  if (algorithm !== "SHA1")
    warnings.push(`Uses ${algorithm}, but codes are generated with SHA-1`)
  const digits = params.get("digits")
  if (digits && digits !== "6")
    warnings.push(`Expects ${digits}-digit codes, but codes have 6 digits`)
  const period = params.get("period")
  if (period && period !== "30")
    warnings.push(`Uses a ${period}s period, but codes change every 30s`)

  return { secret, name, warnings }
}
