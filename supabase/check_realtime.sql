-- Check if message_reads is in the publication
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
