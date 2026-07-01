const u = process.env.DATABASE_URL ?? '';
console.log('len', u.length, 'supabase', u.includes('supabase'), 'local', u.includes('127.0.0.1'));
