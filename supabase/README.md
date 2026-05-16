# Database Setup

Quick setup for the chat application. Run these in Supabase Dashboard → SQL Editor.

## Quick Setup

**Run `complete_setup.sql`** - One-time setup for everything:

- Messages table (add image_url column if missing)
- Message_reads table with indexes and RLS policies
- Storage bucket `attachments` with public policies
- Realtime enablement for messages and message_reads

## Verification

**Run `check_realtime.sql`** - Check which tables have realtime enabled.

## Expected Schema

### messages table
```
- id: UUID (primary key)
- room_code: TEXT
- sender_name: TEXT
- message: TEXT
- image_url: TEXT (optional, added by setup)
- created_at: TIMESTAMPTZ
```

### message_reads table
```
- id: UUID (primary key)
- message_id: TEXT
- room_code: TEXT
- reader_name: TEXT
- created_at: TIMESTAMPTZ
```

### storage
```
- Bucket: attachments (public)
- Policies: Public Read, Public Upload
```
