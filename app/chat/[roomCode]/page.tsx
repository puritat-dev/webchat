'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/utils/supabase'
import { RealtimeChannel } from '@supabase/supabase-js'
import { Message } from '@/lib/types'
import { decodeRoomCode } from '@/lib/hash'

interface MessageReadPayload {
  message_id: string
  reader_name: string
}

export default function ChatRoomPage() {
  const params = useParams()
  const router = useRouter()
  const roomHash = params.roomCode as string

  // Decode the hash to get the actual room code
  const roomCode = decodeRoomCode(roomHash) || ''

  const [userName, setUserName] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [messageReads, setMessageReads] = useState<Record<string, string[]>>({})
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [hasNewMessages, setHasNewMessages] = useState(false)
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [fullImage, setFullImage] = useState<string | null>(null)
  const [showMenu, setShowMenu] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const emojiPickerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
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

  // Mark message as read and broadcast
  const markMessageAsRead = useCallback(async (messageId: string) => {
    if (!userName || !roomCode) return

    // Check if already read by this user
    const existingReads = messageReads[messageId] || []
    if (existingReads.includes(userName)) return

    // Broadcast read event
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'message-read',
        payload: { message_id: messageId, reader_name: userName } as MessageReadPayload,
      })
    }

    // Save to database (for history)
    await supabase
      .from('message_reads')
      .insert({
        message_id: messageId,
        room_code: roomCode,
        reader_name: userName
      })

    // Update local state
    setMessageReads(prev => ({
      ...prev,
      [messageId]: [...(prev[messageId] || []), userName]
    }))
  }, [userName, roomCode, messageReads])

  // Fetch message reads for a room (on initial load)
  const fetchMessageReads = useCallback(async () => {
    if (!roomCode) return

    const { data, error } = await supabase
      .from('message_reads')
      .select('*')
      .eq('room_code', roomCode)

    if (!error && data) {
      const readsByMessage: Record<string, string[]> = {}
      data.forEach((read: any) => {
        if (!readsByMessage[read.message_id]) {
          readsByMessage[read.message_id] = []
        }
        readsByMessage[read.message_id].push(read.reader_name)
      })
      setMessageReads(readsByMessage)
    }
  }, [roomCode])

  // Mark all visible messages as read
  const markVisibleMessagesAsRead = useCallback(() => {
    messages.forEach(msg => {
      // Don't mark own messages as read
      if (msg.sender_name !== userName && !msg.id.startsWith('temp-')) {
        markMessageAsRead(msg.id)
      }
    })
    setHasNewMessages(false)
  }, [messages, userName, markMessageAsRead])

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
    fetchMessageReads()

    // Setup realtime subscription for messages and reads
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
            const existingTempIndex = prev.findIndex(
              (m) => m.id.startsWith('temp-') && m.sender_name === newMsg.sender_name && m.message === newMsg.message
            )

            if (existingTempIndex !== -1) {
              const updated = [...prev]
              updated[existingTempIndex] = newMsg
              return updated
            }

            if (prev.some((m) => m.id === newMsg.id)) {
              return prev
            }

            if (newMsg.sender_name !== userName) {
              setHasNewMessages(true)
            }

            return [...prev, newMsg]
          })
        }
      )
      // Listen for message-read events (via broadcast)
      .on('broadcast', { event: 'message-read' }, ({ payload }) => {
        const read = payload as MessageReadPayload
        if (read.reader_name !== userName) {
          setMessageReads(prev => ({
            ...prev,
            [read.message_id]: [...(prev[read.message_id] || []), read.reader_name]
          }))
        }
      })
      .subscribe()

    channelRef.current = channel

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
    }
  }, [roomCode, userName, fetchMessageReads])

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })

    // Auto-mark messages as read after scroll (with a small delay)
    const timer = setTimeout(() => {
      markVisibleMessagesAsRead()
    }, 500)

    return () => clearTimeout(timer)
  }, [messages, markVisibleMessagesAsRead])

  // Detect if user is at bottom to mark messages as read
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 100

      if (isAtBottom && hasNewMessages) {
        markVisibleMessagesAsRead()
      }
    }

    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [hasNewMessages, markVisibleMessagesAsRead])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value)
  }

  // Handle image selection
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('กรุณาเลือกไฟล์รูปภาพ')
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('รูปภาพต้องไม่เกิน 5MB')
      return
    }

    setSelectedImage(file)
    setImagePreview(URL.createObjectURL(file))
  }

  // Upload image to Supabase Storage
  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`
      const filePath = `${roomCode}/${fileName}`

      const { data, error } = await supabase.storage
        .from('attachments')
        .upload(filePath, file)

      if (error) {
        console.error('Error uploading image:', error)
        return null
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('attachments')
        .getPublicUrl(filePath)

      return publicUrl
    } catch (error) {
      console.error('Error uploading image:', error)
      return null
    }
  }

  // Clear selected image
  const clearImage = () => {
    setSelectedImage(null)
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview)
      setImagePreview(null)
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault()

    // Check if there's content to send
    const hasText = newMessage.trim().length > 0
    const hasImage = selectedImage !== null

    if (!hasText && !hasImage) return
    if (!roomCode) return

    const messageText = newMessage.trim()
    setNewMessage('')
    setUploadingImage(true)

    // Upload image if selected
    let imageUrl: string | undefined
    if (selectedImage) {
      imageUrl = await uploadImage(selectedImage) || undefined
      clearImage()
    }

    setUploadingImage(false)

    const tempMessage: Message = {
      id: `temp-${Date.now()}`,
      room_code: roomCode,
      sender_name: userName,
      message: messageText,
      image_url: imageUrl,
      created_at: new Date().toISOString()
    }
    setMessages((prev) => [...prev, tempMessage])

    const { data, error } = await supabase
      .from('messages')
      .insert({
        room_code: roomCode,
        sender_name: userName,
        message: messageText,
        image_url: imageUrl
      })
      .select()

    if (error) {
      console.error('Error sending message:', error)
      setMessages((prev) => prev.filter((m) => m.id !== tempMessage.id))
    } else if (data && data[0]) {
      await markMessageAsRead(data[0].id)
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

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false)
      }
    }

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showMenu])

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
      <div ref={messagesContainerRef} className="flex-1 overflow-auto p-4 space-y-4">
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
                <div className={`max-w-xs md:max-w-md lg:max-w-lg ${isMe ? 'order-2' : 'order-1'}`}>
                  <div className="flex items-end gap-1">
                    {!isMe && (
                      <p className={`text-xs ${isMe ? 'text-blue-600' : 'text-gray-500'} mb-1`}>
                        {msg.sender_name}
                      </p>
                    )}
                    <div
                      className={`px-4 py-2 rounded-2xl ${
                        isMe
                          ? 'bg-blue-600 text-white rounded-br-sm'
                          : 'bg-white text-gray-800 rounded-bl-sm'
                      }`}
                    >
                      {/* Show image if exists */}
                      {msg.image_url && (
                        <img
                          src={msg.image_url}
                          alt="Uploaded"
                          className="max-w-[200px] max-h-[200px] rounded-lg mb-2 cursor-pointer hover:opacity-90 transition-opacity"
                          loading="lazy"
                          onClick={() => setFullImage(msg.image_url!)}
                        />
                      )}
                      {/* Show text message if exists */}
                      {msg.message && (
                        <p className="break-words">{msg.message}</p>
                      )}
                    </div>
                  </div>
                  <div className={`flex items-center gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <p className={`text-xs text-gray-400 mt-1`}>
                      {new Date(msg.created_at).toLocaleTimeString('th-TH', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                    {isMe && !msg.id.startsWith('temp-') && (
                      <span className="text-xs text-blue-500">
                        {messageReads[msg.id]?.filter(r => r !== userName).length > 0 ? '✓✓' : '✓'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
        {/* New messages indicator */}
        {hasNewMessages && (
          <div className="flex justify-center">
            <button
              onClick={() => {
                messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
                markVisibleMessagesAsRead()
              }}
              className="bg-blue-500 text-white px-4 py-2 rounded-full text-sm shadow-lg hover:bg-blue-600 transition-colors"
            >
              ข้อความใหม่ ↓
            </button>
          </div>
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

        {/* Image preview */}
        {imagePreview && (
          <div className="mb-2 relative inline-block">
            <img
              src={imagePreview}
              alt="Preview"
              className="max-w-xs max-h-40 rounded-lg border"
            />
            <button
              type="button"
              onClick={clearImage}
              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm hover:bg-red-600"
            >
              ×
            </button>
          </div>
        )}

        <form onSubmit={sendMessage} className="flex gap-2 items-center relative">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageSelect}
            className="hidden"
          />

          {/* Menu popup */}
          {showMenu && (
            <div
              ref={menuRef}
              className="absolute bottom-14 left-0 bg-white border border-gray-200 rounded-lg shadow-lg flex flex-col overflow-hidden"
            >
              <button
                type="button"
                onClick={() => {
                  fileInputRef.current?.click()
                  setShowMenu(false)
                }}
                className="px-4 py-3 hover:bg-gray-100 transition-colors"
              >
                <span className="text-2xl">📷</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowMenu(false)
                  setShowEmojiPicker(true)
                }}
                className="px-4 py-3 hover:bg-gray-100 transition-colors"
              >
                <span className="text-2xl">😊</span>
              </button>
            </div>
          )}

          {/* Menu button */}
          <button
            type="button"
            onClick={() => setShowMenu(!showMenu)}
            className="px-3 py-2 text-2xl hover:bg-gray-100 rounded-full transition-colors"
          >
            {showMenu ? '×' : '+'}
          </button>
          <div className="flex-1 relative">
            <input
              type="text"
              value={newMessage}
              onChange={handleInputChange}
              placeholder="พิมพ์ข้อความ..."
              className="w-full px-4 py-2 pr-12 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {uploadingImage && (
                <span className="text-sm text-gray-500">⏳</span>
              )}
              <button
                type="submit"
                disabled={!newMessage.trim() && !selectedImage}
                className="p-1.5 hover:bg-gray-100 rounded-full transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <img src="/icon/send.png" alt="ส่ง" className="w-5 h-5" />
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Full image modal */}
      {fullImage && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setFullImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <img
              src={fullImage}
              alt="Full size"
              className="max-w-full max-h-[90vh] object-contain"
            />
            <button
              onClick={() => setFullImage(null)}
              className="absolute -top-10 right-0 text-white text-3xl hover:text-gray-300"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
