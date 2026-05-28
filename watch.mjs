import 'dotenv/config'; import { config } from 'dotenv'; config({ path: '.env.local' });
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL);
const sid = '0b780963-a89d-4ea1-a57e-30346a5ea0bd';
for (let i = 0; i < 8; i++) {
  const [p] = await sql`SELECT status, progress_pct, progress_phase, error_message, length(stream_text) AS slen, jsonb_array_length(COALESCE(plan_data->'weekly_sessions','[]'::jsonb)) AS sessions FROM training_plans WHERE student_id=${sid} ORDER BY created_at DESC LIMIT 1`;
  const t = new Date().toISOString().slice(11,19);
  console.log(`[${t}] ${p ? `status=${p.status} prog=${p.progress_pct}% fase=${p.progress_phase} stream=${p.slen||0}ch sessions=${p.sessions} err=${p.error_message||'-'}` : 'SEM PLANO AINDA'}`);
  if (p && (p.status === 'generated' || p.status === 'published' || p.status === 'failed')) break;
  await new Promise(r => setTimeout(r, 6000));
}
await sql.end();
