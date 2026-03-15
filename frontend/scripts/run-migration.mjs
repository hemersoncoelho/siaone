#!/usr/bin/env node
/**
 * Executa uma migration SQL no Supabase via Management API.
 * Usa SUPABASE_ACCESS_TOKEN e SUPABASE_PROJECT_REF do .env.secrets
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, '..');
const envPath = resolve(frontendRoot, '.env.secrets');

if (!existsSync(envPath)) {
  console.error('Arquivo .env.secrets não encontrado');
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const eq = l.indexOf('=');
      return [l.slice(0, eq).trim(), l.slice(eq + 1).trim()];
    })
);

const token = env.SUPABASE_ACCESS_TOKEN;
const ref = env.SUPABASE_PROJECT_REF;

if (!token || !ref) {
  console.error('SUPABASE_ACCESS_TOKEN e SUPABASE_PROJECT_REF são obrigatórios em .env.secrets');
  process.exit(1);
}

const sqlPath = process.argv[2] || resolve(__dirname, '../supabase-migrations/backend_teams_and_roles.sql');
if (!existsSync(sqlPath)) {
  console.error('Arquivo SQL não encontrado:', sqlPath);
  process.exit(1);
}

const sql = readFileSync(sqlPath, 'utf8');
console.log('Executando migration:', sqlPath);

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: sql }),
});

if (!res.ok) {
  const err = await res.text();
  console.error('Erro:', res.status, err);
  process.exit(1);
}

console.log('Migration executada com sucesso.');
