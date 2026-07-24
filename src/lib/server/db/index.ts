import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '$env/dynamic/private';
import { building } from '$app/environment';
import * as schema from './schema';

// Durante o BUILD (fase analyse do SvelteKit importa todos os chunks do
// servidor) não há env de runtime — sem este guard, qualquer deploy em
// ambiente sem DATABASE_URL (ex: Preview) quebra no npm run build. O
// postgres() só conecta na primeira query, então o placeholder nunca é
// usado de verdade; em runtime o throw continua valendo.
if (!building && !env.DATABASE_URL) {
	throw new Error('DATABASE_URL is required');
}
const DB_URL = env.DATABASE_URL ?? 'postgresql://building:building@localhost:5432/building';

// Pool por instância. Usa o pooler de TRANSAÇÃO do Supabase (pgBouncer,
// porta 6543, prepare:false), que multiplexa milhares de conexões de
// cliente em poucas conexões reais — então um pool de 10 por instância é
// seguro (não estoura o limite do Postgres). ATENÇÃO: pool pequeno demais
// (ex: 3) causa o efeito oposto — com preload disparando vários loads ao
// mesmo tempo, as conexões esgotam e as queries seguintes ficam na FILA
// sem timeout até a função morrer (504 → navegação "trava"). Por isso 10.
// Override por DB_POOL_MAX se precisar.
const POOL_MAX = Number(env.DB_POOL_MAX ?? '') || 10;

const client = postgres(DB_URL, {
	prepare: false,
	max: POOL_MAX,
	idle_timeout: 20,
	// Falha rápido se não conseguir ABRIR conexão (não fica pendurado).
	connect_timeout: 10
});

export const db = drizzle(client, { schema });
export { schema };
