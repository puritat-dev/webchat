'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { encodeRoomCode } from '@/lib/hash'

export default function ChatLandingPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [roomCode, setRoomCode] = useState('')

  const handleRoomCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // อนุญาตเฉพาะภาษาอังกฤษและตัวเลขเท่านั้น
    const value = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    setRoomCode(value)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim() && roomCode.trim()) {
      const trimmedCode = roomCode.trim()
      // Save to localStorage
      localStorage.setItem('chatUserName', name.trim())
      localStorage.setItem('chatRoomCode', trimmedCode)
      // Navigate with encoded room code
      const encoded = encodeRoomCode(trimmedCode)
      router.push(`/chat/${encoded}`)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-500 to-yellow-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">💬 แชทห้อง</h1>
          <p className="text-gray-500">กรอกชื่อและโค้ดห้องเพื่อเริ่มแชท</p>
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
              placeholder="เช่น: คุณA, เหมียว, Somchai..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-blue-600"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              โค้ดห้อง
            </label>
            <input
              type="text"
              value={roomCode}
              onChange={handleRoomCodeChange}
              placeholder="เช่น: ROOM1, ABC123, 9999..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-xl tracking-wider text-blue-600"
              required
            />
            <p className="text-xs text-gray-400 mt-1">
              ภาษาอังกฤษและตัวเลขเท่านั้น (A-Z, 0-9)
            </p>
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-medium transition-colors"
          >
            เข้าห้องแชท
          </button>
        </form>
      </div>
    </div>
  )
}
