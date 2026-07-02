-- ============================================================
-- STOCKLINE — Database Schema สำหรับ Supabase
-- วิธีใช้: คัดลอกทั้งหมดวางใน Supabase > SQL Editor แล้วกด Run
-- ============================================================

-- ─── products ──────────────────────────────────────────────
create table if not exists products (
  id           text primary key,
  sku          text not null,
  name         text not null,
  barcode      text    default '',
  category     text    default '',
  unit         text    not null default 'ชิ้น',
  "costPrice"  numeric default 0,
  "sellPrice"  numeric default 0,
  supplier     text    default '',
  "reorderPoint" integer default 0,
  note         text    default '',
  image        text    default '',   -- base64 JPEG (resized ≤200px)
  "createdAt"  bigint                -- Unix ms timestamp
);

-- ─── locations ─────────────────────────────────────────────
create table if not exists locations (
  id           text primary key,
  code         text not null unique,
  name         text not null,
  description  text    default '',
  color        text    default '#3046E0',
  "createdAt"  bigint
);

-- ─── movements ─────────────────────────────────────────────
--  type values: IN | OUT | TRANSFER_IN | TRANSFER_OUT | ADJUST
create table if not exists movements (
  id               text primary key,
  type             text not null,
  "productId"      text references products(id) on delete set null,
  "locationId"     text references locations(id) on delete set null,
  "toLocationId"   text references locations(id) on delete set null,
  qty              numeric not null,
  date             text not null,          -- ISO date YYYY-MM-DD
  reference        text    default '',
  note             text    default '',
  "transferId"     text    default '',     -- links TRANSFER_OUT + TRANSFER_IN pair
  "createdAt"      bigint
);

-- ─── Row Level Security ────────────────────────────────────
-- เปิดให้ anon key เข้าถึงได้ทุก operation (ทีมใช้ร่วมกันไม่มี login)
-- หากต้องการ auth ในอนาคต ให้เปลี่ยน policy ตรงนี้

alter table products  disable row level security;
alter table locations disable row level security;
alter table movements disable row level security;

-- ─── Indexes (optional, ช่วยให้ query movements เร็วขึ้น) ──
create index if not exists idx_movements_product  on movements("productId");
create index if not exists idx_movements_location on movements("locationId");
create index if not exists idx_movements_date     on movements(date);
create index if not exists idx_movements_type     on movements(type);

-- เสร็จแล้ว! กลับไปที่ขั้นตอนถัดไปใน DEPLOY.md
