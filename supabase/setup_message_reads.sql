-- STEP 1: First, check if messages table exists and get its structure
-- If messages table doesn't have UUID id, we need to adjust

-- STEP 2: Create message_reads table without foreign key constraint first
CREATE TABLE IF NOT EXISTS message_reads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id TEXT NOT NULL,  -- Use TEXT instead of UUID to be safe
  room_code TEXT NOT NULL,
  reader_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- STEP 3: Create indexes
CREATE INDEX IF NOT EXISTS idx_message_reads_message_id ON message_reads(message_id);
CREATE INDEX IF NOT EXISTS idx_message_reads_room_code ON message_reads(room_code);

-- STEP 4: Enable realtime for message_reads
ALTER PUBLICATION supabase_realtime ADD TABLE message_reads;
