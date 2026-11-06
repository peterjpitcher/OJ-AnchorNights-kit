-- Cash Bingo adds 'pending' in its own migration (an enum value cannot be
-- used in the transaction that adds it).
alter type public.user_role add value if not exists 'pending';
