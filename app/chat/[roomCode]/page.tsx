'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/utils/supabase'
import { RealtimeChannel } from '@supabase/supabase-js'
import { Message } from '@/lib/types'
import { decodeRoomCode } from '@/lib/hash'

export default function ChatRoomPage() {
  const params = useParams()
  const router = useRouter()
  const roomHash = params.roomCode as string

  // Decode the hash to get the actual room code
  const roomCode = decodeRoomCode(roomHash) || ''

  const [userName, setUserName] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const emojiPickerRef = useRef<HTMLDivElement>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)

  // Get user name from localStorage and validate room code
  useEffect(() => {
    const storedName = localStorage.getItem('chatUserName')
    if (!storedName || !roomCode) {
      router.push('/chat')
      return
    }
    setUserName(storedName)
  }, [router, roomCode])

  // Fetch initial messages and setup realtime subscription
  useEffect(() => {
    if (!roomCode) return

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('room_code', roomCode)
        .order('created_at', { ascending: true })

      if (!error && data) {
        setMessages(data)
      }
      setLoading(false)
    }

    fetchMessages()

    // Setup realtime subscription
    const channel = supabase
      .channel(`room:${roomCode}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `room_code=eq.${roomCode}`
        },
        (payload) => {
          const newMsg = payload.new as Message
          setMessages((prev) => {
            // ถ้าเป็นข้อความของตัวเอง และมีใน list แล้ว (temp id) ให้ลบ temp ออกแล้วใส่ของจริง
            // ถ้าเป็นข้อความของคนอื่น หรือยังไม่มีใน list ให้เพิ่ม
            const existingTempIndex = prev.findIndex(
              (m) => m.id.startsWith('temp-') && m.sender_name === newMsg.sender_name && m.message === newMsg.message
            )

            if (existingTempIndex !== -1) {
              // Replace temp message with real one
              const updated = [...prev]
              updated[existingTempIndex] = newMsg
              return updated
            }

            // Check for duplicate (by id) - don't add if already exists
            if (prev.some((m) => m.id === newMsg.id)) {
              return prev
            }

            return [...prev, newMsg]
          })
        }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
    }
  }, [roomCode])

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || !roomCode) return

    const messageText = newMessage.trim()
    setNewMessage('')

    // Optimistic UI - show message immediately
    const tempMessage: Message = {
      id: `temp-${Date.now()}`,
      room_code: roomCode,
      sender_name: userName,
      message: messageText,
      created_at: new Date().toISOString()
    }
    setMessages((prev) => [...prev, tempMessage])

    // Send to database
    const { error } = await supabase
      .from('messages')
      .insert({
        room_code: roomCode,
        sender_name: userName,
        message: messageText
      })

    if (error) {
      console.error('Error sending message:', error)
      // Remove temp message on error
      setMessages((prev) => prev.filter((m) => m.id !== tempMessage.id))
    }
  }

  const leaveRoom = () => {
    localStorage.removeItem('chatUserName')
    localStorage.removeItem('chatRoomCode')
    router.push('/chat')
  }

  // Close emoji picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false)
      }
    }

    if (showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showEmojiPicker])

  const emojis = [
    '😀', '😂', '🤣', '😊', '😍', '🥰', '😘', '😜',
    '🤔', '😎', '🥳', '😢', '😭', '😡', '👍', '👎',
    '❤️', '🔥', '✨', '🎉', '👋', '🙏', '💪', '👏',
    '🤝', '💯', '⭐', '🌟', '💫', '🎁', '🍕', '🍔',
    '🥤', '☕', '🍿', '🚀', '💻', '📱', '🎮', '🎵',
    '✅', '❌', '⚠️', '💡', '📍', '🔔', '📢', '💬'
  ]

  const addEmoji = (emoji: string) => {
    setNewMessage((prev) => prev + emoji)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <div className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-gray-800">ห้อง: {roomCode}</h1>
          <p className="text-sm text-gray-500">ชื่อของคุณ: {userName}</p>
        </div>
        <button
          onClick={leaveRoom}
          className="text-red-600 hover:text-red-700 text-sm font-medium"
        >
          ออกจากห้อง
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            <p>ยังไม่มีข้อความ</p>
            <p className="text-sm">เริ่มแชทกันเลย!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender_name === userName
            return (
              <div
                key={msg.id}
                className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-xs md:max-w-md ${isMe ? 'order-2' : 'order-1'}`}>
                  <p className={`text-xs ${isMe ? 'text-blue-600' : 'text-gray-500'} mb-1`}>
                    {msg.sender_name}
                  </p>
                  <div
                    className={`px-4 py-2 rounded-2xl ${
                      isMe
                        ? 'bg-blue-600 text-white rounded-br-sm'
                        : 'bg-white text-gray-800 rounded-bl-sm'
                    }`}
                  >
                    <p className="break-words">{msg.message}</p>
                  </div>
                  <p className={`text-xs text-gray-400 mt-1 ${isMe ? 'text-right' : 'text-left'}`}>
                    {new Date(msg.created_at).toLocaleTimeString('th-TH', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="bg-white px-4 py-3">
        {/* Emoji Picker */}
        {showEmojiPicker && (
          <div
            ref={emojiPickerRef}
            className="mb-2 p-3 bg-white border border-gray-200 rounded-lg shadow-lg"
          >
            <div className="grid grid-cols-8 gap-1">
              {emojis.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => addEmoji(emoji)}
                  className="text-2xl hover:bg-gray-100 rounded p-1 transition-colors"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={sendMessage} className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="px-3 py-2 text-2xl hover:bg-gray-100 rounded-full transition-colors"
          >
            {showEmojiPicker ? '❌' : '😊'}
          </button>
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="พิมพ์ข้อความ..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
          />
          <button
            type="submit"
            disabled={!newMessage.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-6 py-2 rounded-full font-medium transition-colors"
          >
            ส่ง
          </button>
        </form>
      </div>
    </div>
  )
}
