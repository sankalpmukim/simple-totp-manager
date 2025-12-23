/**
 * Simple TOTP implementation
 */

// Base32 decoding
function base32Decode(base32: string): Uint8Array<ArrayBuffer> {
  const base32Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
  let bits = ""
  let value = 0

  base32 = base32.toUpperCase().replace(/=+$/, "")

  for (let i = 0; i < base32.length; i++) {
    const idx = base32Chars.indexOf(base32[i])
    if (idx === -1) throw new Error("Invalid base32 character")
    value = (value << 5) | idx
    bits += ("00000" + idx.toString(2)).slice(-5)
  }

  const bytes: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2))
  }

  const arrayBuffer = new ArrayBuffer(bytes.length)
  const uint8Array = new Uint8Array(arrayBuffer)
  for (let i = 0; i < bytes.length; i++) uint8Array[i] = bytes[i]
  return uint8Array
}

// HMAC-SHA1 implementation
async function hmacSHA1(
  key: Uint8Array<ArrayBuffer>,
  message: Uint8Array<ArrayBuffer>
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  )

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, message)
  return new Uint8Array(signature)
}

// Generate TOTP code
export async function generateTOTP(
  secret: string,
  timeStep = 30
): Promise<string> {
  try {
    // Decode base32 secret
    const key = base32Decode(secret)

    // Get current time step
    const now = Math.floor(Date.now() / 1000)
    const counter = Math.floor(now / timeStep)

    // Convert counter to 8-byte array
    const buffer = new ArrayBuffer(8)
    const view = new DataView(buffer)
    view.setUint32(4, counter, false)

    // Generate HMAC
    const hmac = await hmacSHA1(key, new Uint8Array(buffer))

    // Dynamic truncation
    const offset = hmac[hmac.length - 1] & 0x0f
    const code =
      (((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff)) %
      1000000

    // Pad to 6 digits
    return code.toString().padStart(6, "0")
  } catch (error) {
    console.error("Error generating TOTP:", error)
    return "------"
  }
}

// Get remaining time in current period
export function getRemainingTime(timeStep = 30): number {
  const now = Math.floor(Date.now() / 1000)
  return timeStep - (now % timeStep)
}
