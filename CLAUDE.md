# CLAUDE.md

ไฟล์นี้ให้คำแนะนำแก่ Claude Code (claude.ai/code) สำหรับการทำงานใน repository นี้

## ภาพรวมโปรเจกต์

แอปพลิเคชันแชทสดแบบไม่ระบุตัวตนด้วยรหัสห้อง ผู้ใช้สามารถสร้างห้องแชทใหม่ หรือเข้าร่วมห้องที่มีอยู่ ผู้ใช้หลายคนที่ใช้รหัสห้องเดียวกันสามารถแชทร่วมกันได้实时 หน้าจอเป็นภาษาไทย

**ข้อจำกัด:** รหัสห้องต้องเป็นภาษาอังกฤษและตัวเลขเท่านั้น (A-Z, 0-9) เพื่อป้องกันปัญหา Supabase Storage ที่ไม่รองรับภาษาไทยใน path

## คำสั่ง

```bash
npm run dev          # เริ่ม dev server ที่ http://localhost:3000
npm run build        # Production build
npm run start        # Run production server
npm run lint         # Run ESLint
```

## ฟีเจอร์หลัก

### 1. สร้าง/เข้าห้องแชท
- **สร้างห้อง (✨)**: สร้างรหัสสุ่ม 6 ตัวอักษร (A-Z, 0-9) + insert ข้อความ system เพื่อ mark ว่าห้องถูกสร้างแล้ว
- **เข้าห้อง (🔑)**: กรอกรหัสห้องที่มีอยู่จริงเพื่อเข้าร่วม
- ต้องสร้างห้องก่อน ถึงจะสามารถเข้าได้

### 2. ระบบข้อความ
- **ข้อความ SYSTEM**: แสดงตรงกลาง สีเทาจาง รูปแบบ pill (เช่น "created at 17/5/2569 03:03:23")
- **Optimistic UI**: แสดงข้อความทันทีด้วย temp ID แทนที่ด้วยข้อความจริงเมื่อ realtime ยืนยัน
- **New Messages Indicator**: ปุ่ม "ข้อความใหม่ ↓" เมื่อมีข้อความใหม่และไม่ได้อยู่ด้านล่าง

### 3. Read Receipts (การยืนยันการอ่าน)
- Broadcast ผ่าน `channel.send({ type: 'broadcast', event: 'message-read' })`
- บันทึกลงตาราง `message_reads`
- Mark ว่าอ่านแล้วเมื่อเลื่อนมาที่ด้านล่าง (threshold 100px)
- แสดง ✓ (ส่งแล้ว) และ ✓✓ (อ่านแล้ว) สำหรับข้อความของตัวเอง

### 4. Image Uploads (การอัปโหลดรูป)
- เก็บใน Supabase Storage bucket `attachments`
- ขนาดสูงสุด 5MB, เฉพาะไฟล์รูปภาพ
- รูปแบบ path: `{roomCode}/{timestamp}_{random}.{ext}`
- แสดง preview ก่อนส่ง, คลิกเพื่อดูขนาดเต็ม (modal)
- Lazy-loaded ในห้องแชท

### 5. Emoji Picker
- แสดงเมื่อกดปุ่ม + แล้วเลือก emoji
- 48 emoji ให้เลือก (grid 8x6)
- Click เพื่อ insert ลงในช่องพิมพ์

### 6. Sound Effect
- เล่นเสียง "bloop" แบบ LINE เมื่อกดส่งข้อความ
- ใช้ Web Audio API (ไม่ต้องใช้ไฟล์เสียงภายนอก)
- รองรับทั้ง desktop และ mobile (resume AudioContext อัตโนมัติ)

### 7. UI Components
- **Send Button**: อยู่ด้านในช่องพิมพ์ด้านขวา (Instagram-style), ใช้ไอคอนจาก `/icon/send.png`
- **Menu Button**: ปุ่ม + เปิดเมนู (📷 อัปโหลดรูป, 😊 emoji)
- **Full Image Modal**: คลิกรูปเพื่อดูขนาดเต็ม

## การตั้งค่า Database (ครั้งแรก)

### 1. สร้างตาราง message_reads

ไปที่ Supabase Dashboard → SQL Editor รัน:

```sql
CREATE TABLE IF NOT EXISTS message_reads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id TEXT NOT NULL,
  room_code TEXT NOT NULL,
  reader_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_message_reads_message_id ON message_reads(message_id);
CREATE INDEX IF NOT EXISTS idx_message_reads_room_code ON message_reads(room_code);
```

### 2. เปิดใช้งาน Realtime

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE message_reads;
```

ตรวจสอบได้ด้วย:
```sql
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
```

### 3. ตั้งค่า RLS Policies (สำคัญ!)

สำหรับ message_reads:
```sql
ALTER TABLE message_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public insert"
ON message_reads FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "Allow public select"
ON message_reads FOR SELECT
TO public
USING (true);
```

### 4. สร้าง Storage Bucket

**วิธีที่ 1: ผ่าน Dashboard**
1. ไปที่ Storage → "Create a new bucket"
2. ชื่อ: `attachments`
3. เปิด "Public bucket"

**วิธีที่ 2: ผ่าน SQL**
```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', true)
ON CONFLICT (id) DO NOTHING;
```

### 5. ตั้งค่า Storage Policies

```sql
-- อนุญาตให้อ่านรูปได้
CREATE POLICY "Public Read"
ON storage.objects FOR SELECT
TO public
USING ( bucket_id = 'attachments' );

-- อนุญาตให้อัปโหลดได้
CREATE POLICY "Public Upload"
ON storage.objects FOR INSERT
TO public
WITH CHECK ( bucket_id = 'attachments' );
```

---

## สถาปัตยกรรม

### การตั้งค่า Supabase
- Client: `utils/supabase.ts`
- Environment variables ใน `.env.local`:
  - `NEXT_PUBLIC_SUPABASE_URL` (base URL)
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (anon key)

### โครงสร้าง Database
- **messages** - ข้อความแชท (id, room_code, sender_name, message, image_url, created_at)
- **message_reads** - บันทึกการอ่านข้อความ (id, message_id, room_code, reader_name, created_at)
- **storage.buckets** - bucket `attachments` สำหรับเก็บรูปที่อัปโหลด

### โครงสร้าง App
```
app/
├── page.tsx              # Root page (redirect ไป /chat)
├── chat/page.tsx         # หน้า login (สร้าง/เข้าห้อง, รหัส A-Z, 0-9)
└── chat/[roomCode]/page.tsx  # ห้องแชท实时
lib/
├── types.ts              # TypeScript interfaces (Message, MessageRead)
└── hash.ts               # การ encode/decode รหัสห้อง
public/
└── icon/
    └── send.png          # ไอคอนปุ่มส่ง
```

### รูปแบบสำคัญ

**การเข้ารหัสรหัสห้อง**: รหัสห้องถูก encode ด้วย base64 ใน URL (`lib/hash.ts`) นี่เป็นการปกปิดรหัสใน URL แต่ **ไม่ใช่** เรื่องความปลอดภัย - เพียงทำให้ URL ดูยากขึ้นเล็กน้อย

**Room Code Restrictions**: รหัสห้องต้องเป็นภาษาอังกฤษและตัวเลขเท่านั้น (A-Z, 0-9) และถูกแปลงเป็นตัวพิมพ์ใหญ่อัตโนมัติ เพื่อป้องกันปัญหา Supabase Storage ที่ไม่รองรับภาษาไทยใน path

**Optimistic UI**: เมื่อผู้ใช้ส่งข้อความ จะแสดงทันทีด้วย temp ID (`temp-${timestamp}`) เมื่อ database ยืนยันผ่าน realtime ข้อความชั่วคราวจะถูกแทนที่ด้วยข้อความจริง เพื่อป้องกันข้อความซ้ำ

**Real-time Subscriptions**: ใช้ 2 channels ต่อหนึ่งห้อง:
1. `postgres_changes` - ฟัง INSERT บนตาราง messages กรองด้วย `room_code=eq.{roomCode}`
2. `broadcast` - สำหรับ read receipts ผ่าน event 'message-read'

**SYSTEM Messages**: ข้อความจาก `sender_name='SYSTEM'` แสดงตรงกลาง สไตล์พิเศษ (สีเทาจาง, pill-shaped) ไม่แสดงชื่อผู้ส่ง/เวลา

## ไฟล์ SQL อ้างอิง

ไฟล์ใน `supabase/` directory:
- `message_reads.sql` - สร้างตาราง message_reads
- `setup_message_reads.sql` - สร้างตาราง (fallback ถ้า message_reads.sql ใช้ไม่ได้)
- `create_storage.sql` - สร้าง storage bucket (ชื่อ chat-images - ต้องเปลี่ยนเป็น attachments)
- `check_realtime.sql` - ตรวจสอบ realtime publication

**หมายเหตุ:** `create_storage.sql` สร้าง bucket ชื่อ `chat-images` แต่โค้ดใช้ `attachments` - ต้องสร้าง bucket ชื่อ `attachments` แทน
