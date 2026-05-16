# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Real-time anonymous chat application with room codes. Users enter their name and a room code to join/create chat rooms. Multiple users with the same room code can chat in real-time.

## Commands

```bash
npm run dev          # Start dev server at http://localhost:3000
npm run build        # Production build
npm run start        # Run production server
npm run lint         # Run ESLint
```

## Architecture

### Supabase Setup
- Client configured in `utils/supabase.ts`
- Environment variables in `.env.local`:
  - `NEXT_PUBLIC_SUPABASE_URL` (base URL, no `/rest/v2/` suffix)
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (anon key)

### Database Table
- `messages` - Chat messages with room_code, sender_name, message, created_at

**Realtime Setup** (required for chat):
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
```

### App Structure
```
app/
├── page.tsx              # Root page (redirects to /chat)
├── chat/page.tsx         # Login page (name + room code)
└── chat/[roomCode]/      # Real-time chat room
```

### Key Patterns

**Optimistic UI**: When user sends a message, it appears immediately with a temp ID. When database confirms via realtime, the temp message is replaced with the real one to prevent duplicates.

**Real-time Subscription**: Uses Supabase Realtime with `postgres_changes` event filter for `room_code=eq.{roomCode}`.
