export interface Message {
  id: string
  room_code: string
  sender_name: string
  message: string
  created_at: string
  image_url?: string // URL of uploaded image
  read_by?: string[] // Array of user names who have read this message
}

export interface MessageRead {
  id: string
  message_id: string
  room_code: string
  reader_name: string
  created_at: string
}
