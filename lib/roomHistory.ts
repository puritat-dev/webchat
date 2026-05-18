export interface RoomHistoryItem {
  roomCode: string
  roomName: string
  userName: string
  lastAccess: string
  action: 'created' | 'joined'
}

const STORAGE_KEY = 'chatRoomHistory'
const MAX_HISTORY = 10

export function getRoomHistory(): RoomHistoryItem[] {
  if (typeof window === 'undefined') return []

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

export function saveRoomHistory(
  roomCode: string,
  userName: string,
  action: 'created' | 'joined',
  roomName?: string
): void {
  if (typeof window === 'undefined') return

  const history = getRoomHistory()

  const newItem: RoomHistoryItem = {
    roomCode,
    roomName: roomName || `ห้อง ${roomCode}`,
    userName,
    lastAccess: new Date().toISOString(),
    action,
  }

  const existingIndex = history.findIndex((item) => item.roomCode === roomCode)

  if (existingIndex >= 0) {
    history[existingIndex] = newItem
  } else {
    history.unshift(newItem)
  }

  const trimmed = history.slice(0, MAX_HISTORY)

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch (e) {
    console.error('Failed to save room history:', e)
  }
}

export function clearRoomHistory(): void {
  if (typeof window === 'undefined') return

  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (e) {
    console.error('Failed to clear room history:', e)
  }
}

export function removeRoomFromHistory(roomCode: string): void {
  if (typeof window === 'undefined') return

  const history = getRoomHistory()
  const filtered = history.filter((item) => item.roomCode !== roomCode)

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
  } catch (e) {
    console.error('Failed to remove room from history:', e)
  }
}

export function getLastUserName(): string | null {
  if (typeof window === 'undefined') return null

  try {
    const history = getRoomHistory()
    return history.length > 0 ? history[0].userName : null
  } catch {
    return null
  }
}
