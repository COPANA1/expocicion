-- Ejecuta esto en el SQL Editor de Supabase

-- 1. Crear tabla
create table archivos (
  id uuid default gen_random_uuid() primary key,
  titulo text not null,
  descripcion text default '',
  nombre_archivo text not null,
  url text not null,
  tipo text default 'FILE',
  tamano bigint default 0,
  creado_en timestamptz default now()
);

-- 2. Permitir acceso público para leer (la app no usa auth de Supabase)
alter table archivos enable row level security;

create policy "Lectura pública" on archivos
  for select using (true);

create policy "Inserción con service key" on archivos
  for insert with check (true);

create policy "Eliminación con service key" on archivos
  for delete using (true);
