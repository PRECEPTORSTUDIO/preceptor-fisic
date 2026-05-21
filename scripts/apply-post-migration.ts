/**
 * Aplica SQL pós-migration (RLS policies + FK pra auth.users) no BR.
 * Idempotente — pode rodar várias vezes.
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const BR = process.env.DATABASE_URL_DIRECT;
if (!BR) {
	console.error('❌ DATABASE_URL_DIRECT faltando');
	process.exit(1);
}

const sql = postgres(BR, { prepare: false });
const dir = join(process.cwd(), 'drizzle', 'post-migration');

const files = [
	'0001-rls.sql',
	'0002-auth-fk.sql',
	'0003-rls-perf.sql',
	'0004-exercise-catalog.sql'
];
try {
	for (const f of files) {
		console.log(`▸ aplicando ${f}…`);
		const raw = readFileSync(join(dir, f), 'utf-8');
		const content = raw.replace(/^﻿/, ''); // strip BOM
		await sql.unsafe(content);
		console.log(`  ✓ ok`);
	}
	console.log('\n✅ post-migration aplicado.');
} finally {
	await sql.end();
}
