# 🚀 STOCKLINE — คู่มือ Deploy (ฟรี 100%)

Stack: **React + Vite → Vercel** (frontend) + **Supabase PostgreSQL** (database)

---

## ⏱ เวลาที่ใช้ทั้งหมด: ประมาณ 15–20 นาที

---

## ขั้นที่ 1 — สร้างฐานข้อมูลบน Supabase (ฟรี)

1. ไปที่ **https://supabase.com** → คลิก **Start your project** → Sign Up ด้วย GitHub หรือ Email
2. คลิก **New Project**
   - Organization: (ใช้ default)
   - Name: `stockline`
   - Database Password: ตั้งรหัสผ่านแข็งแกร่ง (เก็บไว้ ไม่จำเป็นต้องใช้ใน app แต่เก็บไว้ก่อน)
   - Region: **Southeast Asia (Singapore)** ← เลือกอันนี้เพื่อ latency ต่ำสุด
3. รอประมาณ 1–2 นาที ให้ project พร้อมใช้งาน
4. เมื่อ project พร้อมแล้ว ไปที่เมนู **SQL Editor** (ไอคอนรูปฐานข้อมูล ด้านซ้าย)
5. คลิก **New query** → คัดลอกเนื้อหาทั้งหมดจาก `schema.sql` วางลงในช่อง → กด **Run** (Ctrl+Enter)
   - จะเห็นข้อความ "Success. No rows returned" → ✅ สำเร็จ
6. ไปที่ **Settings** (ไอคอนเฟือง) → **API**
   - คัดลอก **Project URL** (รูปแบบ: `https://xxxx.supabase.co`)
   - คัดลอก **anon public** key (รหัสยาวมาก)
   - เก็บทั้งสองค่าไว้ใช้ในขั้นต่อไป

---

## ขั้นที่ 2 — อัปโหลดโค้ดขึ้น GitHub

1. ไปที่ **https://github.com** → สร้าง account (ถ้ายังไม่มี)
2. คลิก **New repository** (ปุ่มสีเขียว)
   - Repository name: `stockline`
   - Visibility: **Private** (แนะนำ เพราะมี env vars)
   - กด **Create repository**
3. อัปโหลดไฟล์โปรเจกต์ทั้งหมด:
   - คลิก **uploading an existing file**
   - ลากโฟลเดอร์ `stockline/` ทั้งหมดมาวาง (ยกเว้น `node_modules/` ถ้ามี)
   - คลิก **Commit changes**

> 💡 ถ้าใช้ Git CLI ได้ ให้รัน:
> ```bash
> cd stockline
> git init
> git add .
> git commit -m "initial commit"
> git remote add origin https://github.com/YOUR_USERNAME/stockline.git
> git push -u origin main
> ```

---

## ขั้นที่ 3 — Deploy บน Vercel (ฟรี)

1. ไปที่ **https://vercel.com** → คลิก **Sign Up** → เลือก **Continue with GitHub**
2. คลิก **Add New Project** → เลือก repo `stockline` → คลิก **Import**
3. ตรวจสอบ Settings:
   - Framework Preset: **Vite** (Vercel จะ detect ให้อัตโนมัติ)
   - Build Command: `npm run build` (default)
   - Output Directory: `dist` (default)
4. เพิ่ม **Environment Variables** (สำคัญมาก!):
   - คลิก **Environment Variables** ด้านล่าง
   - เพิ่ม 2 ค่า:
     ```
     VITE_SUPABASE_URL        =  https://xxxx.supabase.co
     VITE_SUPABASE_ANON_KEY   =  eyJhbGciOi...
     ```
5. คลิก **Deploy** → รอ 1–2 นาที
6. 🎉 ได้ URL แบบ `https://stockline-xxx.vercel.app` → เข้าใช้งานได้ทันที!

---

## ขั้นที่ 4 — แชร์ให้ทีม

- ส่ง URL ที่ได้จาก Vercel ให้ทีมงาน
- ทุกคนเข้าถึงข้อมูลชุดเดียวกัน real-time ผ่านฐานข้อมูล Supabase
- ไม่ต้องติดตั้งอะไรเพิ่ม — เปิด Browser แล้วใช้งานได้เลย

---

## 📊 สรุป Free Tier ที่ได้รับ

| บริการ | Free Tier | เพียงพอสำหรับ |
|--------|-----------|---------------|
| **Supabase** | 500MB storage, 2 projects, 50K rows | สินค้า 50K+ รายการ, ประวัติหลายล้าน records |
| **Vercel** | Unlimited deployments, 100GB bandwidth | ทีม 10+ คน ใช้งานตลอดวัน |

---

## 🔧 การพัฒนาต่อ (optional)

### ใช้งาน local (development)
```bash
cd stockline
npm install
cp .env.example .env
# แก้ไข .env ใส่ค่า Supabase
npm run dev
# เปิด http://localhost:5173
```

### Deploy อัตโนมัติ
เมื่อ push โค้ดใหม่ขึ้น GitHub → Vercel จะ build & deploy ให้อัตโนมัติทุกครั้ง

### เพิ่ม Custom Domain (optional, ฟรีบน Vercel)
Vercel Dashboard → Project → Settings → Domains → Add domain

---

## ❓ แก้ปัญหาเบื้องต้น

**หน้าขาวหลัง deploy** → ตรวจ Environment Variables ใน Vercel ว่าใส่ครบและถูกต้อง

**"Failed to load data"** → ไปที่ Supabase SQL Editor รัน `schema.sql` อีกครั้ง

**ข้อมูลไม่ sync** → Refresh หน้าเว็บ (ระบบโหลดข้อมูลใหม่จาก Supabase ทุกครั้งที่เปิดหน้า)
