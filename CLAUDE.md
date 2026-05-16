# CLAUDE.md

ไฟล์นี้ให้คำแนะนำแก่ Claude Code (claude.ai/code) สำหรับการทำงานใน repository นี้

## ภาพรวมโปรเจกต์

แอปพลิเคชันแชทสดแบบไม่ระบุตัวตนด้วยรหัสห้อง ผู้ใช้กรอกชื่อและรหัสห้องเพื่อเข้าร่วม/สร้างห้องแชท ผู้ใช้หลายคนที่ใช้รหัสห้องเดียวกันสามารถแชทร่วมกันได้实时 หน้าจอเป็นภาษาไทย

## คำสั่ง

```bash
npm run dev          # เริ่ม dev server ที่ http://localhost:3000
npm run build        # Production build
npm run start        # Run production server
npm run lint         # Run ESLint
```

## การตั้งค่า Database

เรียกใช้ไฟล์ SQL ในไดเรกทอรี `supabase/` ตามลำดับ:
1. **message_reads.sql** - สร้างตารางสำหรับบันทึกการอ่านข้อความ
2. **create_storage.sql** - สร้าง storage bucket สำหรับอัปโหลดรูปภาพ
3. **check_realtime.sql** - ตรวจสอบว่า realtime เปิดใช้งานแล้ว

**สำคัญ** - เปิดใช้งาน realtime สำหรับแชท:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
```

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
├── chat/page.tsx         # หน้า login (กรอกชื่อ + รหัสห้อง)
└── chat/[roomCode]/page.tsx  # ห้องแชท实时
lib/
├── types.ts              # TypeScript interfaces (Message, MessageRead)
└── hash.ts               # การ encode/decode รหัสห้อง
```

### รูปแบบสำคัญ

**การเข้ารหัสรหัสห้อง**: รหัสห้องถูก encode ด้วย base64 ใน URL (`lib/hash.ts`) นี่เป็นการปกปิดรหัสใน URL แต่ **ไม่ใช่** เรื่องความปลอดภัย - เพียงทำให้ URL ดูยากขึ้นเล็กน้อย

**Optimistic UI**: เมื่อผู้ใช้ส่งข้อความ จะแสดงทันทีด้วย temp ID (`temp-${timestamp}`) เมื่อ database ยืนยันผ่าน realtime ข้อความชั่วคราวจะถูกแทนที่ด้วยข้อความจริง เพื่อป้องกันข้อความซ้ำ

**Real-time Subscriptions**: ใช้ 2 channels ต่อหนึ่งห้อง:
1. `postgres_changes` - ฟัง INSERT บนตาราง messages กรองด้วย `room_code=eq.{roomCode}`
2. `broadcast` - สำหรับ read receipts ผ่าน event 'message-read'

**Read Receipts (การยืนยันการอ่าน)**:
- Broadcast ผ่าน `channel.send({ type: 'broadcast', event: 'message-read' })` แบบ实时
- บันทึกลงตาราง `message_reads` ด้วยสำหรับประวัติ
- ข้อความจะถูก mark ว่าอ่านแล้วเมื่อเลื่อนเข้ามาในมุมมอง (threshold 100px)
- ข้อความของตัวเองไม่เคยถูก mark ว่าอ่านโดยผู้ส่งเอง

**Image Uploads (การอัปโหลดรูป)**:
- เก็บใน Supabase Storage bucket `attachments` (หมายเหตุ: code อ้างอิง 'attachments' แต่ create_storage.sql สร้าง 'chat-images' - มีความไม่ตรงกัน)
- ขนาดสูงสุด 5MB, เฉพาะไฟล์รูปภาพ
- รูปแบบ path: `{roomCode}/{timestamp}_{random}.{ext}`
- Lazy-loaded ในห้องแชท, คลิกเพื่อดูขนาดเต็ม
