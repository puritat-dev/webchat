// Simple reversible encoding for room codes
// This is NOT for security, just to obscure the room code in URL

const SECRET = 'chat-room-secret'

export function encodeRoomCode(roomCode: string): string {
  const combined = roomCode + SECRET
  const encoded = Buffer.from(combined).toString('base64')
  // Make it URL-safe
  return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

export function decodeRoomCode(hash: string): string | null {
  try {
    if (!hash || hash.length < 4) return null
    // Restore base64 characters
    const restored = hash.replace(/-/g, '+').replace(/_/g, '/')
    // Add padding if needed
    const padded = restored + '=='.slice(0, (4 - restored.length % 4) % 4)
    const decoded = Buffer.from(padded, 'base64').toString()
    // Remove secret to get original room code
    const result = decoded.replace(SECRET, '')
    return result || null
  } catch {
    return null
  }
}
