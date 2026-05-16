-- ============================================================
-- ตั้งค่า Database สำหรับแอปพลิเคชันแชท (ครบถ้วน)
-- รันไฟล์นี้ที่ Supabase Dashboard → SQL Editor
-- ============================================================

-- ------------------------------------------------------------
-- ขั้นตอนที่ 1: ตั้งค่าตาราง MESSAGES (ถ้ายังไม่มี)
-- ------------------------------------------------------------
-- หมายเหตุ: ถ้ามีตาราง messages อยู่แล้ว จะเพิ่มคอลัมน์ที่ยังไม่มีให้

-- เช็คและเพิ่มคอลัมน์ที่ยังไม่มี
DO $$
BEGIN
    -- เพิ่มคอลัมน์ image_url ถ้ายังไม่มี
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'messages' AND column_name = 'image_url'
    ) THEN
        ALTER TABLE messages ADD COLUMN image_url TEXT;
    END IF;
END $$;

-- ------------------------------------------------------------
-- ขั้นตอนที่ 2: สร้างตาราง MESSAGE_READS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS message_reads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id TEXT NOT NULL,
  room_code TEXT NOT NULL,
  reader_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- สร้าง index เพื่อให้ค้นข้อมูลเร็วขึ้น
CREATE INDEX IF NOT EXISTS idx_message_reads_message_id ON message_reads(message_id);
CREATE INDEX IF NOT EXISTS idx_message_reads_room_code ON message_reads(room_code);

-- ------------------------------------------------------------
-- ขั้นตอนที่ 3: เปิดใช้งาน Row Level Security (RLS)
-- ------------------------------------------------------------
ALTER TABLE message_reads ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- ขั้นตอนที่ 4: สร้าง RLS Policies สำหรับ MESSAGE_READS
-- ------------------------------------------------------------
-- อนุญาตให้ใครก็ได้ insert ข้อมูลการอ่าน
CREATE POLICY "Allow public insert"
ON message_reads FOR INSERT
TO public
WITH CHECK (true);

-- อนุญาตให้ใครก็ได้ select ข้อมูลการอ่าน
CREATE POLICY "Allow public select"
ON message_reads FOR SELECT
TO public
USING (true);

-- ------------------------------------------------------------
-- ขั้นตอนที่ 5: เปิดใช้งาน Realtime สำหรับ MESSAGES
-- ------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- ------------------------------------------------------------
-- ขั้นตอนที่ 6: เปิดใช้งาน Realtime สำหรับ MESSAGE_READS
-- ------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE message_reads;

-- ------------------------------------------------------------
-- ขั้นตอนที่ 7: สร้าง Storage Bucket สำหรับอัปโหลดรูป
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', true)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- ขั้นตอนที่ 8: สร้าง Storage Policies
-- ------------------------------------------------------------
-- อนุญาตให้ประชาชนอ่านไฟล์ได้
CREATE POLICY "Public Read"
ON storage.objects FOR SELECT
TO public
USING ( bucket_id = 'attachments' );

-- อนุญาตให้ประชาชนอัปโหลดไฟล์ได้
CREATE POLICY "Public Upload"
ON storage.objects FOR INSERT
TO public
WITH CHECK ( bucket_id = 'attachments' );

-- ------------------------------------------------------------
-- ตรวจสอบการตั้งค่า
-- ------------------------------------------------------------
-- ตรวจสอบตารางที่เปิดใช้งาน Realtime
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

-- ตรวจสอบ Storage Bucket
SELECT * FROM storage.buckets WHERE id = 'attachments';

-- ตรวจสอบ Policies
SELECT * FROM pg_policies WHERE tablename IN ('message_reads');
