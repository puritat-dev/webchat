'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { encodeRoomCode } from '@/lib/hash'
import { supabase } from '@/utils/supabase'
import { getRoomHistory, saveRoomHistory, removeRoomFromHistory, clearRoomHistory, getLastUserName, type RoomHistoryItem } from '@/lib/roomHistory'

export default function ChatLandingPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'join' | 'create'>('join')
  const [name, setName] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [recentRooms, setRecentRooms] = useState<RoomHistoryItem[]>([])
  const [showRecentModal, setShowRecentModal] = useState(false)

  useEffect(() => {
    setRecentRooms(getRoomHistory())

    const savedName = localStorage.getItem('chatUserName') || getLastUserName()
    if (savedName) setName(savedName)
  }, [])

  // สร้างรหัสห้องแบบสุ่ม
  const generateRoomCode = () => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let result = ''
    for (let i = 0; i < 6; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length))
    }
    return result
  }

  // เช็คว่าห้องถูกสร้างไว้แล้วหรือไม่
  const checkRoomExists = async (code: string): Promise<boolean> => {
    const { data, error } = await supabase
      .from('messages')
      .select('id')
      .eq('room_code', code)
      .limit(1)

    if (error) {
      console.error('Error checking room:', error)
      return false
    }

    return data && data.length > 0
  }

  const formatTimeAgo = (dateString: string): string => {
    const now = new Date()
    const date = new Date(dateString)
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'เมื่อสักครู่'
    if (diffMins < 60) return `${diffMins} นาทีที่แล้ว`
    if (diffHours < 24) return `${diffHours} ชม.ที่แล้ว`
    return `${diffDays} วันที่แล้ว`
  }

  const handleQuickJoin = (roomCode: string) => {
    // ดึงชื่อจาก room history ก่อน (เพราะเราบันทึกไว้แล้ว)
    const roomHistoryItem = recentRooms.find((r) => r.roomCode === roomCode)
    const userName = roomHistoryItem?.userName || name.trim() || getLastUserName() || ''

    console.log('handleQuickJoin - roomHistoryItem:', roomHistoryItem, 'userName:', userName)

    if (!userName) {
      setError('กรุณากรอกชื่อของคุณก่อนเข้าห้อง')
      setShowRecentModal(false)
      return
    }

    // บันทึกชื่อที่ใช้
    try {
      localStorage.setItem('chatUserName', userName)
      localStorage.setItem('chatRoomCode', roomCode)
    } catch (e) {
      console.error('localStorage set error:', e)
    }

    saveRoomHistory(roomCode, userName, 'joined', `ห้อง ${roomCode}`)

    const encoded = encodeRoomCode(roomCode)
    router.push(`/chat/${encoded}`)
  }

  const handleRemoveRoom = (e: React.MouseEvent, roomCode: string) => {
    e.stopPropagation()
    removeRoomFromHistory(roomCode)
    setRecentRooms(getRoomHistory())
  }

  const handleRoomCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // อนุญาตเฉพาะภาษาอังกฤษและตัวเลขเท่านั้น
    const value = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    setRoomCode(value)
    setError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) return

    setError('')
    setLoading(true)

    let finalRoomCode = roomCode.trim()

    try {
      if (mode === 'create') {
        // โหมดสร้างห้อง - สร้างรหัสใหม่ถ้าไม่ได้กรอก
        if (!finalRoomCode) {
          finalRoomCode = generateRoomCode()
        }

        // เช็คว่าห้องมีอยู่แล้วหรือไม่
        const exists = await checkRoomExists(finalRoomCode)
        if (exists) {
          setError('รหัสห้องนี้ถูกใช้แล้ว กรุณาสร้างใหม่')
          setLoading(false)
          return
        }

        // สร้างห้องโดย insert ข้อความ system
        const { error: createError } = await supabase
          .from('messages')
          .insert({
            room_code: finalRoomCode,
            sender_name: 'SYSTEM',
            message: `created at ${new Date().toLocaleString('th-TH')}`,
          })

        if (createError) {
          setError('สร้างห้องไม่สำเร็จ กรุณาลองใหม่')
          setLoading(false)
          return
        }

        setRoomCode(finalRoomCode)
      } else {
        // โหมดเข้าห้อง - เช็คว่าห้องมีอยู่จริงหรือไม่
        if (!finalRoomCode) {
          setError('กรุณากรอกรหัสห้อง')
          setLoading(false)
          return
        }

        const exists = await checkRoomExists(finalRoomCode)
        if (!exists) {
          setError('ไม่พบห้องนี้ กรุณาตรวจสอบรหัสอีกครั้ง')
          setRoomCode('')
          setLoading(false)
          return
        }
      }

      if (!finalRoomCode) {
        setLoading(false)
        return
      }

      // Save to localStorage
      const nameToSave = name.trim()
      console.log('handleSubmit - Saving name to localStorage:', nameToSave)
      localStorage.setItem('chatUserName', nameToSave)
      localStorage.setItem('chatRoomCode', finalRoomCode)

      // Verify it was saved
      const savedName = localStorage.getItem('chatUserName')
      console.log('handleSubmit - Verified saved name:', savedName)

      saveRoomHistory(finalRoomCode, nameToSave, mode, `ห้อง ${finalRoomCode}`)

      // Navigate with encoded room code
      const encoded = encodeRoomCode(finalRoomCode)
      router.push(`/chat/${encoded}`)
    } catch (err) {
      console.error('Error:', err)
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-500 to-yellow-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">💬 แชทห้อง</h1>
          <p className="text-gray-500">เลือกโหมดเพื่อเริ่มแชท</p>
        </div>

        {/* Mode Toggle */}
        <div className="flex gap-2 mb-6 bg-gray-100 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => {
              setMode('join')
              setRoomCode('')
              setError('')
            }}
            className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
              mode === 'join'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            🔑 เข้าห้อง
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('create')
              setError('')
              setRoomCode(generateRoomCode())
            }}
            className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
              mode === 'create'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            ✨ สร้างห้อง
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ชื่อของคุณ
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="กรอกชื่อ"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-blue-600"
              required
            />
          </div>

          {mode === 'join' ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                โค้ดห้อง
              </label>
              <input
                type="text"
                value={roomCode}
                onChange={handleRoomCodeChange}
                placeholder="กรอกรหัสห้อง"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-xl tracking-wider text-blue-600"
                required
              />
              <p className="text-xs text-gray-400 mt-1">
                ภาษาอังกฤษและตัวเลขเท่านั้น (A-Z, 0-9)
              </p>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                รหัสห้องของคุณ
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={roomCode}
                  onChange={handleRoomCodeChange}
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-xl tracking-wider text-blue-600"
                />
                <button
                  type="button"
                  onClick={() => setRoomCode(generateRoomCode())}
                  className="px-4 py-3 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                  title="สร้างรหัสใหม่"
                >
                  🔄
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                แชร์รหัสนี้ให้เพื่อนเพื่อเข้าห้องเดียวกัน
              </p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="text-red-500 text-sm text-center bg-red-50 py-2 px-3 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'กำลังดำเนินการ...' : mode === 'join' ? 'เข้าห้องแชท' : 'สร้างและเข้าห้อง'}
          </button>
        </form>

        {/* Recent Rooms Link */}
        {recentRooms.length > 0 && (
          <div className="mt-4 text-center">
            <button
              onClick={() => setShowRecentModal(true)}
              className="text-blue-600 hover:text-blue-700 underline underline-offset-2 text-sm font-medium"
            >
              รายการล่าสุด ({recentRooms.length})
            </button>
          </div>
        )}
      </div>

      {/* Recent Rooms Modal */}
      {showRecentModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={() => setShowRecentModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-800">รายการล่าสุด</h2>
              <button
                onClick={() => setShowRecentModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1">
              {recentRooms.length === 0 ? (
                <div className="text-center text-gray-400 py-8">
                  ไม่มีรายการห้อง
                </div>
              ) : (
                <div className="space-y-2">
                  {recentRooms.map((room) => (
                    <div
                      key={room.roomCode}
                      onClick={() => {
                        handleQuickJoin(room.roomCode)
                        setShowRecentModal(false)
                      }}
                      className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors group cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg">
                          {room.action === 'created' ? '✨' : '🔑'}
                        </span>
                        <div className="text-left">
                          <div className="font-medium text-gray-800">
                            {room.roomCode}
                          </div>
                          <div className="text-xs text-gray-400">
                            {formatTimeAgo(room.lastAccess)}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemoveRoom(e, room.roomCode)
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-200">
              <button
                onClick={() => {
                  clearRoomHistory()
                  setRecentRooms([])
                }}
                className="w-full py-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors text-sm font-medium"
              >
                ล้างรายการทั้งหมด
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
