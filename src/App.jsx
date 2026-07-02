import React, { useState, useEffect, useMemo, useRef } from "react";
import { supabase, supabaseConfigured } from "./supabase";
import {
  LayoutDashboard, Package, MapPin, ArrowDownToLine, ArrowUpFromLine,
  ArrowLeftRight, ClipboardList, Activity, Plus, Search, X, Pencil, Trash2,
  Eye, ImagePlus, AlertTriangle, CheckCircle2, Download, SlidersHorizontal,
  ChevronDown, Warehouse, Boxes, Loader2, ChevronLeft, ChevronRight,
  ArrowRight
} from "lucide-react";
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

/* ----------------------------- design tokens ----------------------------- */
const C = {
  bg: "#F5F6FA",
  surface: "#FFFFFF",
  ink: "#12172B",
  muted: "#6B7280",
  mutedSoft: "#9CA3AF",
  border: "#E4E6EE",
  borderSoft: "#EDEEF4",
  primary: "#3046E0",
  primarySoft: "#EEF0FE",
  primaryDark: "#202FAE",
  success: "#1B9E6B",
  successSoft: "#E7F7F0",
  danger: "#D8432B",
  dangerSoft: "#FBEAE7",
  warn: "#E8862C",
  warnSoft: "#FDF1E5",
  violet: "#7C3AED",
  violetSoft: "#F1ECFE",
  headerBg: "#10172A",
  headerBg2: "#161F3A",
  led: "#FFB454",
  ledDim: "#8A6A3F",
};
const LOCATION_COLORS = ["#3046E0", "#1B9E6B", "#E8862C", "#D8432B", "#7C3AED", "#0EA5A4", "#C2410C", "#475569", "#BE185D", "#4D7C0F"];
const UNIT_PRESETS = ["ชิ้น", "กล่อง", "แพ็ค", "ลัง", "กิโลกรัม", "กรัม", "ลิตร", "มิลลิลิตร", "เมตร", "ม้วน", "ขวด", "ถุง", "คู่", "ชุด"];
const FONT_DISPLAY = "'Space Grotesk', 'Inter', sans-serif";
const FONT_BODY = "'Inter', sans-serif";
const FONT_MONO = "'JetBrains Mono', monospace";

const TYPE_META = {
  IN: { label: "รับเข้า", color: C.success, bg: C.successSoft, icon: ArrowDownToLine },
  OUT: { label: "จ่ายออก", color: C.danger, bg: C.dangerSoft, icon: ArrowUpFromLine },
  TRANSFER_OUT: { label: "โอนออก", color: C.violet, bg: C.violetSoft, icon: ArrowLeftRight },
  TRANSFER_IN: { label: "โอนเข้า", color: C.violet, bg: C.violetSoft, icon: ArrowLeftRight },
  ADJUST: { label: "ปรับปรุงยอด", color: C.warn, bg: C.warnSoft, icon: SlidersHorizontal },
};

/* --------------------------------- utils --------------------------------- */
function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function cn(...a) { return a.filter(Boolean).join(" "); }
function fmtNum(n) {
  const v = Number(n) || 0;
  return new Intl.NumberFormat("en-US").format(v);
}
function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}
function fmtDateDisplay(iso) {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}
function fmtDateTimeShort(ts) {
  const d = new Date(ts);
  return d.toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/* ── data layer is Supabase – see src/supabase.js ── */

function computeStock(movements) {
  const map = {};
  for (const mv of movements) {
    if (!mv || !mv.productId || !mv.locationId) continue;
    if (!map[mv.productId]) map[mv.productId] = {};
    const cur = map[mv.productId][mv.locationId] || 0;
    let delta = 0;
    const qty = Number(mv.qty) || 0;
    if (mv.type === "IN" || mv.type === "TRANSFER_IN") delta = qty;
    else if (mv.type === "OUT" || mv.type === "TRANSFER_OUT") delta = -qty;
    else if (mv.type === "ADJUST") delta = qty;
    map[mv.productId][mv.locationId] = cur + delta;
  }
  return map;
}

function resizeImage(file, maxDim = 160, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("image decode failed"));
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) { height = Math.round((height * maxDim) / width); width = maxDim; }
        else if (height > maxDim) { width = Math.round((width * maxDim) / height); height = maxDim; }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function downloadCSV(filename, headers, rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.map(esc).join(",")];
  for (const r of rows) lines.push(r.map(esc).join(","));
  const csv = "\uFEFF" + lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ------------------------------ small UI bits ------------------------------ */
function Toast({ toast }) {
  if (!toast) return null;
  const isErr = toast.type === "error";
  return (
    <div
      className="fixed bottom-5 right-5 z-[100] flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg border animate-[fadeIn_.2s_ease]"
      style={{ background: isErr ? C.dangerSoft : C.successSoft, borderColor: isErr ? "#F0B6A9" : "#A9DEC6", color: isErr ? C.danger : C.success, fontFamily: FONT_BODY, maxWidth: 360 }}
    >
      {isErr ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
      <span className="text-sm font-medium">{toast.message}</span>
    </div>
  );
}

function Modal({ title, subtitle, onClose, children, wide, footer }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto" style={{ background: "rgba(15,18,35,0.55)" }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={cn("w-full rounded-2xl shadow-2xl my-6", wide ? "max-w-3xl" : "max-w-lg")} style={{ background: C.surface, fontFamily: FONT_BODY }}>
        <div className="flex items-start justify-between px-6 py-5 border-b" style={{ borderColor: C.borderSoft }}>
          <div>
            <h3 className="text-lg font-semibold" style={{ color: C.ink, fontFamily: FONT_DISPLAY }}>{title}</h3>
            {subtitle && <p className="text-sm mt-0.5" style={{ color: C.muted }}>{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition" style={{ color: C.muted }}><X size={20} /></button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && <div className="px-6 py-4 border-t flex justify-end gap-2" style={{ borderColor: C.borderSoft }}>{footer}</div>}
      </div>
    </div>
  );
}

function Badge({ children, color, bg }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold" style={{ color, background: bg, fontFamily: FONT_BODY }}>
      {children}
    </span>
  );
}

function LocationChip({ location, size = "sm" }) {
  if (!location) return <span style={{ color: C.mutedSoft }}>-</span>;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md font-medium", size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm")} style={{ background: C.bg, color: C.ink, fontFamily: FONT_BODY, border: `1px solid ${C.border}` }}>
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: location.color || "#999" }} />
      {location.code}
    </span>
  );
}

function Field({ label, required, children, hint }) {
  return (
    <label className="block mb-4">
      <span className="block text-sm font-medium mb-1.5" style={{ color: C.ink }}>{label}{required && <span style={{ color: C.danger }}> *</span>}</span>
      {children}
      {hint && <span className="block text-xs mt-1" style={{ color: C.mutedSoft }}>{hint}</span>}
    </label>
  );
}

const inputStyle = { fontFamily: FONT_BODY, color: C.ink, borderColor: C.border };
function TextInput(props) {
  return <input {...props} className={cn("w-full px-3 py-2 rounded-lg border text-sm outline-none transition focus:ring-2", props.className)} style={{ ...inputStyle, ...(props.style || {}) }} onFocus={(e) => (e.target.style.borderColor = C.primary)} onBlur={(e) => (e.target.style.borderColor = C.border)} />;
}
function MonoInput(props) {
  return <TextInput {...props} style={{ fontFamily: FONT_MONO, ...(props.style || {}) }} />;
}
function TextArea(props) {
  return <textarea {...props} className={cn("w-full px-3 py-2 rounded-lg border text-sm outline-none transition", props.className)} style={inputStyle} onFocus={(e) => (e.target.style.borderColor = C.primary)} onBlur={(e) => (e.target.style.borderColor = C.border)} />;
}
function Select({ children, ...props }) {
  return (
    <div className="relative">
      <select {...props} className={cn("w-full appearance-none px-3 py-2 pr-9 rounded-lg border text-sm outline-none transition bg-white", props.className)} style={inputStyle} onFocus={(e) => (e.target.style.borderColor = C.primary)} onBlur={(e) => (e.target.style.borderColor = C.border)}>
        {children}
      </select>
      <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: C.mutedSoft }} />
    </div>
  );
}

function PrimaryButton({ children, icon: Icon, style, ...props }) {
  return (
    <button {...props} className={cn("inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed", props.className)} style={{ background: C.primary, fontFamily: FONT_BODY, ...style }} onMouseEnter={(e) => !props.disabled && (e.currentTarget.style.background = C.primaryDark)} onMouseLeave={(e) => (e.currentTarget.style.background = (style && style.background) || C.primary)}>
      {Icon && <Icon size={16} />}{children}
    </button>
  );
}
function GhostButton({ children, icon: Icon, style, ...props }) {
  return (
    <button {...props} className={cn("inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border transition active:scale-[0.98] disabled:opacity-50", props.className)} style={{ borderColor: C.border, color: C.ink, fontFamily: FONT_BODY, background: C.surface, ...style }}>
      {Icon && <Icon size={16} />}{children}
    </button>
  );
}
function IconButton({ icon: Icon, title, danger, style, ...props }) {
  return (
    <button {...props} title={title} className="p-2 rounded-lg transition hover:bg-gray-100 disabled:opacity-40" style={{ color: danger ? C.danger : C.muted, ...style }}>
      <Icon size={16} />
    </button>
  );
}

function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 rounded-2xl border-2 border-dashed" style={{ borderColor: C.border }}>
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: C.primarySoft, color: C.primary }}>
        <Icon size={26} />
      </div>
      <h3 className="text-base font-semibold mb-1" style={{ color: C.ink, fontFamily: FONT_DISPLAY }}>{title}</h3>
      <p className="text-sm max-w-sm mb-5" style={{ color: C.muted }}>{description}</p>
      {action}
    </div>
  );
}

function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight" style={{ color: C.ink, fontFamily: FONT_DISPLAY }}>{title}</h2>
        {subtitle && <p className="text-sm mt-1" style={{ color: C.muted }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function StatusBadge({ qty, reorderPoint }) {
  if (reorderPoint > 0 && qty <= reorderPoint) {
    return <Badge color={C.warn} bg={C.warnSoft}><AlertTriangle size={11} /> ต่ำกว่าจุดสั่งซื้อ</Badge>;
  }
  if (qty <= 0) return <Badge color={C.mutedSoft} bg={C.bg}>หมดสต็อก</Badge>;
  return <Badge color={C.success} bg={C.successSoft}><CheckCircle2 size={11} /> ปกติ</Badge>;
}

/* ------------------------------- form modals ------------------------------- */
function ProductFormModal({ initial, categories, units, onClose, onSave }) {
  const [form, setForm] = useState(() => initial || { name: "", sku: "", barcode: "", category: "", unit: "ชิ้น", costPrice: "", sellPrice: "", supplier: "", reorderPoint: "", note: "", image: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef(null);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function handleImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await resizeImage(file, 200, 0.72);
      set("image", dataUrl);
    } catch (e) { setErr("ไม่สามารถอัปโหลดรูปภาพได้"); }
  }

  async function submit() {
    if (!form.name.trim()) { setErr("กรุณากรอกชื่อสินค้า"); return; }
    if (!form.sku.trim()) { setErr("กรุณากรอกรหัสสินค้า (SKU)"); return; }
    setErr(""); setSaving(true);
    await onSave({
      ...form,
      sku: form.sku.trim(),
      name: form.name.trim(),
      reorderPoint: Number(form.reorderPoint) || 0,
      costPrice: form.costPrice === "" ? 0 : Number(form.costPrice),
      sellPrice: form.sellPrice === "" ? 0 : Number(form.sellPrice),
    });
    setSaving(false);
  }

  return (
    <Modal title={initial ? "แก้ไขสินค้า" : "เพิ่มสินค้าใหม่"} subtitle={initial ? initial.sku : "กรอกข้อมูลสินค้าเพื่อเริ่มติดตามสต็อก"} onClose={onClose} wide
      footer={<>
        <GhostButton onClick={onClose}>ยกเลิก</GhostButton>
        <PrimaryButton onClick={submit} disabled={saving} icon={saving ? Loader2 : CheckCircle2}>{saving ? "กำลังบันทึก..." : "บันทึกสินค้า"}</PrimaryButton>
      </>}>
      {err && <div className="mb-4 px-3 py-2 rounded-lg text-sm" style={{ background: C.dangerSoft, color: C.danger }}>{err}</div>}
      <div className="grid sm:grid-cols-[120px_1fr] gap-5">
        <div>
          <span className="block text-sm font-medium mb-1.5" style={{ color: C.ink }}>รูปภาพ</span>
          <button onClick={() => fileRef.current?.click()} className="w-28 h-28 rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden" style={{ borderColor: C.border, background: C.bg }}>
            {form.image ? <img src={form.image} alt="" className="w-full h-full object-cover" /> : <ImagePlus size={22} style={{ color: C.mutedSoft }} />}
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleImage} className="hidden" />
        </div>
        <div className="grid sm:grid-cols-2 gap-x-4">
          <Field label="ชื่อสินค้า" required><TextInput value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="เช่น เก้าอี้สำนักงาน" /></Field>
          <Field label="รหัสสินค้า (SKU)" required><MonoInput value={form.sku} onChange={(e) => set("sku", e.target.value)} placeholder="SKU-0001" /></Field>
          <Field label="บาร์โค้ด"><MonoInput value={form.barcode} onChange={(e) => set("barcode", e.target.value)} placeholder="8850000000000" /></Field>
          <Field label="หมวดหมู่">
            <TextInput list="category-list" value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="เลือกหรือพิมพ์หมวดหมู่ใหม่" />
            <datalist id="category-list">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field label="หน่วยนับ">
            <TextInput list="unit-list" value={form.unit} onChange={(e) => set("unit", e.target.value)} placeholder="ชิ้น" />
            <datalist id="unit-list">{units.map((u) => <option key={u} value={u} />)}</datalist>
          </Field>
          <Field label="Supplier / ผู้จำหน่าย"><TextInput value={form.supplier} onChange={(e) => set("supplier", e.target.value)} placeholder="ชื่อผู้จำหน่าย" /></Field>
          <Field label="จุดสั่งซื้อขั้นต่ำ (Reorder point)" hint="ระบบจะแจ้งเตือนเมื่อยอดรวมต่ำกว่าค่านี้"><MonoInput type="number" min="0" value={form.reorderPoint} onChange={(e) => set("reorderPoint", e.target.value)} placeholder="0" /></Field>
          <Field label="ราคาทุน"><MonoInput type="number" min="0" value={form.costPrice} onChange={(e) => set("costPrice", e.target.value)} placeholder="0.00" /></Field>
          <Field label="ราคาขาย"><MonoInput type="number" min="0" value={form.sellPrice} onChange={(e) => set("sellPrice", e.target.value)} placeholder="0.00" /></Field>
          <div className="sm:col-span-2">
            <Field label="หมายเหตุ"><TextArea rows={2} value={form.note} onChange={(e) => set("note", e.target.value)} placeholder="รายละเอียดเพิ่มเติม..." /></Field>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function LocationFormModal({ initial, nextColor, onClose, onSave }) {
  const [form, setForm] = useState(() => initial || { code: "", name: "", description: "", color: nextColor });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }
  async function submit() {
    if (!form.code.trim()) { setErr("กรุณากรอกรหัส Location"); return; }
    if (!form.name.trim()) { setErr("กรุณากรอกชื่อ Location"); return; }
    setErr(""); setSaving(true);
    await onSave({ ...form, code: form.code.trim(), name: form.name.trim() });
    setSaving(false);
  }
  return (
    <Modal title={initial ? "แก้ไข Location" : "เพิ่ม Location ใหม่"} subtitle="คลัง / โซน / ชั้นวาง สำหรับติดตามสต็อกแยกตามจุดจัดเก็บ" onClose={onClose}
      footer={<><GhostButton onClick={onClose}>ยกเลิก</GhostButton><PrimaryButton onClick={submit} disabled={saving} icon={saving ? Loader2 : CheckCircle2}>{saving ? "กำลังบันทึก..." : "บันทึก"}</PrimaryButton></>}>
      {err && <div className="mb-4 px-3 py-2 rounded-lg text-sm" style={{ background: C.dangerSoft, color: C.danger }}>{err}</div>}
      <Field label="รหัส Location" required hint="เช่น WH-A, RACK-01"><MonoInput value={form.code} onChange={(e) => set("code", e.target.value)} placeholder="WH-A" /></Field>
      <Field label="ชื่อ Location" required><TextInput value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="คลังสินค้า A" /></Field>
      <Field label="คำอธิบาย"><TextArea rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="รายละเอียดตำแหน่งที่ตั้ง..." /></Field>
      <Field label="สีประจำ Location">
        <div className="flex flex-wrap gap-2">
          {LOCATION_COLORS.map((c) => (
            <button key={c} onClick={() => set("color", c)} className="w-8 h-8 rounded-full flex items-center justify-center transition" style={{ background: c, outline: form.color === c ? `2px solid ${C.ink}` : "none", outlineOffset: 2 }}>
              {form.color === c && <CheckCircle2 size={15} color="#fff" />}
            </button>
          ))}
        </div>
      </Field>
    </Modal>
  );
}

function AdjustModal({ product, location, currentQty, onClose, onSave }) {
  const [actual, setActual] = useState(currentQty);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const delta = (Number(actual) || 0) - currentQty;
  async function submit() {
    setSaving(true);
    await onSave({ delta, note });
    setSaving(false);
  }
  return (
    <Modal title="ปรับปรุงยอดสต็อก" subtitle={`${product.name} (${product.sku})`} onClose={onClose}
      footer={<><GhostButton onClick={onClose}>ยกเลิก</GhostButton><PrimaryButton onClick={submit} disabled={saving || delta === 0} icon={saving ? Loader2 : SlidersHorizontal}>{saving ? "กำลังบันทึก..." : "บันทึกการปรับยอด"}</PrimaryButton></>}>
      <div className="flex items-center gap-2 mb-4"><LocationChip location={location} size="md" /></div>
      <Field label="ยอดคงเหลือในระบบปัจจุบัน"><div className="px-3 py-2 rounded-lg text-sm font-semibold" style={{ background: C.bg, fontFamily: FONT_MONO, color: C.ink }}>{fmtNum(currentQty)} {product.unit}</div></Field>
      <Field label="จำนวนที่นับได้จริง" required><MonoInput type="number" value={actual} onChange={(e) => setActual(e.target.value)} /></Field>
      <div className="mb-4 px-3 py-2 rounded-lg text-sm flex items-center justify-between" style={{ background: delta === 0 ? C.bg : delta > 0 ? C.successSoft : C.dangerSoft, color: delta === 0 ? C.muted : delta > 0 ? C.success : C.danger }}>
        <span>ส่วนต่างที่จะบันทึก</span>
        <span style={{ fontFamily: FONT_MONO }} className="font-semibold">{delta > 0 ? "+" : ""}{fmtNum(delta)}</span>
      </div>
      <Field label="หมายเหตุ (สาเหตุการปรับยอด)"><TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น นับสต็อกประจำเดือน, สินค้าชำรุด" /></Field>
    </Modal>
  );
}

/* ------------------------------ detail drawers ------------------------------ */
function ProductDetailModal({ product, locations, movements, stockMap, onClose, onEdit, onDelete, onAdjust }) {
  const rows = locations.map((l) => ({ location: l, qty: stockMap[product.id]?.[l.id] || 0 })).filter((r) => r.qty !== 0);
  const total = rows.reduce((a, r) => a + r.qty, 0);
  const history = movements.filter((m) => m.productId === product.id).sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.createdAt - a.createdAt).slice(0, 30);
  const locById = Object.fromEntries(locations.map((l) => [l.id, l]));
  return (
    <Modal title={product.name} subtitle={`SKU: ${product.sku}${product.barcode ? " · บาร์โค้ด: " + product.barcode : ""}`} onClose={onClose} wide
      footer={<>
        <GhostButton icon={Trash2} onClick={() => onDelete(product)} style={{ color: C.danger, borderColor: "#F0B6A9" }}>ลบสินค้า</GhostButton>
        <PrimaryButton icon={Pencil} onClick={() => onEdit(product)}>แก้ไขข้อมูล</PrimaryButton>
      </>}>
      <div className="flex gap-4 mb-5">
        <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 border" style={{ borderColor: C.border, background: C.bg }}>
          {product.image ? <img src={product.image} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full flex items-center justify-center"><Package size={26} style={{ color: C.mutedSoft }} /></div>}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm flex-1">
          <div><span style={{ color: C.muted }}>หมวดหมู่: </span><span style={{ color: C.ink }}>{product.category || "-"}</span></div>
          <div><span style={{ color: C.muted }}>หน่วยนับ: </span><span style={{ color: C.ink }}>{product.unit}</span></div>
          <div><span style={{ color: C.muted }}>Supplier: </span><span style={{ color: C.ink }}>{product.supplier || "-"}</span></div>
          <div><span style={{ color: C.muted }}>จุดสั่งซื้อ: </span><span style={{ color: C.ink, fontFamily: FONT_MONO }}>{fmtNum(product.reorderPoint)}</span></div>
          <div><span style={{ color: C.muted }}>ราคาทุน: </span><span style={{ color: C.ink, fontFamily: FONT_MONO }}>{fmtNum(product.costPrice)}</span></div>
          <div><span style={{ color: C.muted }}>ราคาขาย: </span><span style={{ color: C.ink, fontFamily: FONT_MONO }}>{fmtNum(product.sellPrice)}</span></div>
        </div>
      </div>
      {product.note && <div className="mb-5 px-3 py-2 rounded-lg text-sm" style={{ background: C.bg, color: C.muted }}>{product.note}</div>}

      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold" style={{ color: C.ink }}>สต็อกแยกตาม Location</h4>
          <span className="text-sm font-bold" style={{ fontFamily: FONT_MONO, color: C.primary }}>รวม {fmtNum(total)} {product.unit}</span>
        </div>
        {rows.length === 0 ? <p className="text-sm py-3" style={{ color: C.mutedSoft }}>ยังไม่มีสต็อกของสินค้านี้ใน Location ใด</p> : (
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.borderSoft }}>
            {rows.sort((a, b) => b.qty - a.qty).map((r, i) => (
              <div key={r.location.id} className={cn("flex items-center justify-between px-3 py-2 text-sm", i !== 0 && "border-t")} style={{ borderColor: C.borderSoft }}>
                <LocationChip location={r.location} />
                <div className="flex items-center gap-3">
                  <span style={{ fontFamily: FONT_MONO, color: C.ink }} className="font-semibold">{fmtNum(r.qty)}</span>
                  <IconButton icon={SlidersHorizontal} title="ปรับยอด" onClick={() => onAdjust(product, r.location, r.qty)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h4 className="text-sm font-semibold mb-2" style={{ color: C.ink }}>ประวัติความเคลื่อนไหวล่าสุด</h4>
        {history.length === 0 ? <p className="text-sm py-3" style={{ color: C.mutedSoft }}>ยังไม่มีความเคลื่อนไหว</p> : (
          <div className="max-h-64 overflow-y-auto rounded-xl border" style={{ borderColor: C.borderSoft }}>
            <table className="w-full text-sm">
              <tbody>
                {history.map((m, i) => {
                  const meta = TYPE_META[m.type];
                  const Icon = meta.icon;
                  return (
                    <tr key={m.id} className={i !== 0 ? "border-t" : ""} style={{ borderColor: C.borderSoft }}>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ fontFamily: FONT_MONO, color: C.muted }}>{fmtDateDisplay(m.date)}</td>
                      <td className="px-3 py-2"><Badge color={meta.color} bg={meta.bg}><Icon size={11} />{meta.label}</Badge></td>
                      <td className="px-3 py-2"><LocationChip location={locById[m.locationId]} /></td>
                      <td className="px-3 py-2 text-right font-semibold whitespace-nowrap" style={{ fontFamily: FONT_MONO, color: isNegMv(m) ? C.danger : C.success }}>
                        {mvSign(m)}{fmtNum(Math.abs(m.qty))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}

function LocationDetailModal({ location, products, movements, stockMap, onClose, onEdit, onDelete }) {
  const rows = products.map((p) => ({ product: p, qty: stockMap[p.id]?.[location.id] || 0 })).filter((r) => r.qty !== 0).sort((a, b) => b.qty - a.qty);
  const total = rows.reduce((a, r) => a + r.qty, 0);
  const history = movements.filter((m) => m.locationId === location.id).sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.createdAt - a.createdAt).slice(0, 20);
  const prodById = Object.fromEntries(products.map((p) => [p.id, p]));
  return (
    <Modal title={location.name} subtitle={`รหัส: ${location.code}`} onClose={onClose} wide
      footer={<>
        <GhostButton icon={Trash2} onClick={() => onDelete(location)} style={{ color: C.danger, borderColor: "#F0B6A9" }}>ลบ Location</GhostButton>
        <PrimaryButton icon={Pencil} onClick={() => onEdit(location)}>แก้ไขข้อมูล</PrimaryButton>
      </>}>
      {location.description && <p className="text-sm mb-4" style={{ color: C.muted }}>{location.description}</p>}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="rounded-xl px-4 py-3" style={{ background: C.bg }}>
          <p className="text-xs mb-1" style={{ color: C.muted }}>จำนวน SKU</p>
          <p className="text-xl font-bold" style={{ fontFamily: FONT_MONO, color: C.ink }}>{rows.length}</p>
        </div>
        <div className="rounded-xl px-4 py-3" style={{ background: C.bg }}>
          <p className="text-xs mb-1" style={{ color: C.muted }}>จำนวนรวมทั้งหมด</p>
          <p className="text-xl font-bold" style={{ fontFamily: FONT_MONO, color: C.primary }}>{fmtNum(total)}</p>
        </div>
      </div>
      <h4 className="text-sm font-semibold mb-2" style={{ color: C.ink }}>สินค้าใน Location นี้</h4>
      {rows.length === 0 ? <p className="text-sm py-3 mb-4" style={{ color: C.mutedSoft }}>ยังไม่มีสินค้าใน Location นี้</p> : (
        <div className="max-h-56 overflow-y-auto rounded-xl border mb-5" style={{ borderColor: C.borderSoft }}>
          {rows.map((r, i) => (
            <div key={r.product.id} className={cn("flex items-center justify-between px-3 py-2 text-sm", i !== 0 && "border-t")} style={{ borderColor: C.borderSoft }}>
              <div><span style={{ color: C.ink }}>{r.product.name}</span> <span style={{ fontFamily: FONT_MONO, color: C.mutedSoft }} className="text-xs">{r.product.sku}</span></div>
              <span style={{ fontFamily: FONT_MONO, color: C.ink }} className="font-semibold">{fmtNum(r.qty)} {r.product.unit}</span>
            </div>
          ))}
        </div>
      )}
      <h4 className="text-sm font-semibold mb-2" style={{ color: C.ink }}>ความเคลื่อนไหวล่าสุด</h4>
      {history.length === 0 ? <p className="text-sm py-3" style={{ color: C.mutedSoft }}>ยังไม่มีความเคลื่อนไหว</p> : (
        <div className="max-h-56 overflow-y-auto rounded-xl border" style={{ borderColor: C.borderSoft }}>
          <table className="w-full text-sm"><tbody>
            {history.map((m, i) => {
              const meta = TYPE_META[m.type]; const Icon = meta.icon;
              return (
                <tr key={m.id} className={i !== 0 ? "border-t" : ""} style={{ borderColor: C.borderSoft }}>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ fontFamily: FONT_MONO, color: C.muted }}>{fmtDateDisplay(m.date)}</td>
                  <td className="px-3 py-2"><Badge color={meta.color} bg={meta.bg}><Icon size={11} />{meta.label}</Badge></td>
                  <td className="px-3 py-2">{prodById[m.productId]?.name || "-"}</td>
                  <td className="px-3 py-2 text-right font-semibold whitespace-nowrap" style={{ fontFamily: FONT_MONO, color: isNegMv(m) ? C.danger : C.success }}>
                    {mvSign(m)}{fmtNum(Math.abs(m.qty))}
                  </td>
                </tr>
              );
            })}
          </tbody></table>
        </div>
      )}
    </Modal>
  );
}

function isNegMv(m) { return m.type === "OUT" || m.type === "TRANSFER_OUT" || (m.type === "ADJUST" && m.qty < 0); }
function mvSign(m) { return isNegMv(m) ? "-" : "+"; }

/* --------------------------------- pages --------------------------------- */
function DashboardPage({ products, locations, movements, stockMap, productTotal, lowStock, setTab }) {
  const recent = [...movements].sort((a, b) => b.createdAt - a.createdAt).slice(0, 8);
  const prodById = Object.fromEntries(products.map((p) => [p.id, p]));
  const locById = Object.fromEntries(locations.map((l) => [l.id, l]));
  const chartData = locations.map((l) => {
    let qty = 0; products.forEach((p) => { qty += stockMap[p.id]?.[l.id] || 0; });
    return { name: l.code, qty, color: l.color };
  });

  if (products.length === 0 && locations.length === 0) {
    return (
      <EmptyState icon={Boxes} title="เริ่มต้นใช้งานระบบคลังสินค้า" description="เพิ่ม Location สำหรับจัดเก็บสินค้า และเพิ่มรายการสินค้าเพื่อเริ่มติดตามสต็อกแบบเรียลไทม์"
        action={<div className="flex gap-2"><PrimaryButton icon={Plus} onClick={() => setTab("locations")}>เพิ่ม Location</PrimaryButton><GhostButton icon={Plus} onClick={() => setTab("products")}>เพิ่มสินค้า</GhostButton></div>} />
    );
  }

  return (
    <div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-2 gap-5 mb-6">
        <div className="rounded-2xl border p-5" style={{ borderColor: C.borderSoft, background: C.surface }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-1.5" style={{ color: C.ink }}><AlertTriangle size={15} style={{ color: C.warn }} /> สินค้าใกล้หมด / ต่ำกว่าจุดสั่งซื้อ</h3>
            {lowStock.length > 0 && <Badge color={C.warn} bg={C.warnSoft}>{lowStock.length} รายการ</Badge>}
          </div>
          {lowStock.length === 0 ? (
            <p className="text-sm py-6 text-center" style={{ color: C.mutedSoft }}>ไม่มีสินค้าต่ำกว่าจุดสั่งซื้อ</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {lowStock.slice(0, 8).map((p) => (
                <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: C.warnSoft }}>
                  <div className="min-w-0"><p className="text-sm font-medium truncate" style={{ color: C.ink }}>{p.name}</p><p className="text-xs" style={{ fontFamily: FONT_MONO, color: C.mutedSoft }}>{p.sku}</p></div>
                  <p className="text-sm font-bold flex-shrink-0" style={{ fontFamily: FONT_MONO, color: C.warn }}>{fmtNum(productTotal(p.id))}/{fmtNum(p.reorderPoint)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border p-5" style={{ borderColor: C.borderSoft, background: C.surface }}>
          <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-3" style={{ color: C.ink }}><Activity size={15} style={{ color: C.primary }} /> ความเคลื่อนไหวล่าสุด</h3>
          {recent.length === 0 ? <p className="text-sm py-6 text-center" style={{ color: C.mutedSoft }}>ยังไม่มีความเคลื่อนไหว</p> : (
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {recent.map((m) => {
                const meta = TYPE_META[m.type]; const Icon = meta.icon; const p = prodById[m.productId];
                return (
                  <div key={m.id} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: meta.bg, color: meta.color }}><Icon size={14} /></div>
                    <div className="min-w-0 flex-1"><p className="text-sm truncate" style={{ color: C.ink }}>{p?.name || "สินค้าถูกลบแล้ว"}</p><p className="text-xs" style={{ color: C.mutedSoft }}>{meta.label} · <LocationChip location={locById[m.locationId]} /></p></div>
                    <span className="text-sm font-semibold flex-shrink-0" style={{ fontFamily: FONT_MONO, color: meta.color }}>{mvSign(m)}{fmtNum(Math.abs(m.qty))}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {locations.length > 0 && (
        <div className="rounded-2xl border p-5" style={{ borderColor: C.borderSoft, background: C.surface }}>
          <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-4" style={{ color: C.ink }}><Warehouse size={15} style={{ color: C.primary }} /> สต็อกรวมแยกตาม Location</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.borderSoft} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fontFamily: FONT_MONO, fill: C.muted }} axisLine={{ stroke: C.border }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fontFamily: FONT_MONO, fill: C.muted }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 10, border: `1px solid ${C.border}`, fontFamily: FONT_BODY, fontSize: 13 }} formatter={(v) => fmtNum(v)} />
              <Bar dataKey="qty" radius={[6, 6, 0, 0]}>
                {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function ProductsPage({ products, stockMap, productTotal, onAdd, onView }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const categories = useMemo(() => [...new Set(products.map((p) => p.category).filter(Boolean))], [products]);
  const filtered = products.filter((p) => {
    if (cat && p.category !== cat) return false;
    if (!q) return true;
    const s = q.toLowerCase();
    return p.name.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s) || (p.barcode || "").toLowerCase().includes(s);
  });

  return (
    <div>
      <PageHeader title="สินค้า" subtitle={`ทั้งหมด ${products.length} รายการ`} action={<PrimaryButton icon={Plus} onClick={onAdd}>เพิ่มสินค้า</PrimaryButton>} />
      {products.length === 0 ? (
        <EmptyState icon={Package} title="ยังไม่มีสินค้าในระบบ" description="เพิ่มสินค้าชิ้นแรกเพื่อเริ่มบันทึกการรับเข้า-จ่ายออก และติดตามสต็อก" action={<PrimaryButton icon={Plus} onClick={onAdd}>เพิ่มสินค้าแรก</PrimaryButton>} />
      ) : (
        <>
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.mutedSoft }} />
              <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ, SKU, บาร์โค้ด..." className="pl-9" />
            </div>
            {categories.length > 0 && (
              <div className="w-48"><Select value={cat} onChange={(e) => setCat(e.target.value)}><option value="">ทุกหมวดหมู่</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}</Select></div>
            )}
          </div>
          <div className="rounded-2xl border overflow-hidden overflow-x-auto" style={{ borderColor: C.borderSoft }}>
            <table className="w-full text-sm min-w-[760px]">
              <thead><tr style={{ background: C.bg }}>
                <th className="text-left font-semibold px-4 py-3" style={{ color: C.muted }}></th>
                <th className="text-left font-semibold px-2 py-3" style={{ color: C.muted }}>สินค้า</th>
                <th className="text-left font-semibold px-3 py-3" style={{ color: C.muted }}>หมวดหมู่</th>
                <th className="text-left font-semibold px-3 py-3" style={{ color: C.muted }}>Supplier</th>
                <th className="text-right font-semibold px-3 py-3" style={{ color: C.muted }}>คงเหลือรวม</th>
                <th className="text-left font-semibold px-3 py-3" style={{ color: C.muted }}>สถานะ</th>
                <th className="px-3 py-3"></th>
              </tr></thead>
              <tbody>
                {filtered.map((p, i) => {
                  const total = productTotal(p.id);
                  return (
                    <tr key={p.id} className="cursor-pointer hover:bg-gray-50 transition" style={{ borderTop: i !== 0 ? `1px solid ${C.borderSoft}` : "none" }} onClick={() => onView(p)}>
                      <td className="px-4 py-2.5">
                        <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 border" style={{ borderColor: C.border, background: C.bg }}>
                          {p.image ? <img src={p.image} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full flex items-center justify-center"><Package size={16} style={{ color: C.mutedSoft }} /></div>}
                        </div>
                      </td>
                      <td className="px-2 py-2.5"><p className="font-medium" style={{ color: C.ink }}>{p.name}</p><p className="text-xs" style={{ fontFamily: FONT_MONO, color: C.mutedSoft }}>{p.sku}</p></td>
                      <td className="px-3 py-2.5" style={{ color: C.muted }}>{p.category || "-"}</td>
                      <td className="px-3 py-2.5" style={{ color: C.muted }}>{p.supplier || "-"}</td>
                      <td className="px-3 py-2.5 text-right font-semibold" style={{ fontFamily: FONT_MONO, color: C.ink }}>{fmtNum(total)} <span className="text-xs font-normal" style={{ color: C.mutedSoft }}>{p.unit}</span></td>
                      <td className="px-3 py-2.5"><StatusBadge qty={total} reorderPoint={p.reorderPoint} /></td>
                      <td className="px-3 py-2.5 text-right"><IconButton icon={Eye} title="ดูรายละเอียด" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && <p className="text-sm py-10 text-center" style={{ color: C.mutedSoft }}>ไม่พบสินค้าที่ค้นหา</p>}
          </div>
        </>
      )}
    </div>
  );
}

function LocationsPage({ locations, products, stockMap, onAdd, onView }) {
  function totals(lid) {
    let qty = 0, skus = 0;
    products.forEach((p) => { const q = stockMap[p.id]?.[lid] || 0; if (q !== 0) { qty += q; skus++; } });
    return { qty, skus };
  }
  return (
    <div>
      <PageHeader title="Location" subtitle={`ทั้งหมด ${locations.length} จุดจัดเก็บ`} action={<PrimaryButton icon={Plus} onClick={onAdd}>เพิ่ม Location</PrimaryButton>} />
      {locations.length === 0 ? (
        <EmptyState icon={MapPin} title="ยังไม่มี Location" description="เพิ่มคลัง โซน หรือชั้นวาง เพื่อเริ่มติดตามสต็อกแยกตามจุดจัดเก็บโดยอัตโนมัติ" action={<PrimaryButton icon={Plus} onClick={onAdd}>เพิ่ม Location แรก</PrimaryButton>} />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {locations.map((l) => {
            const t = totals(l.id);
            return (
              <button key={l.id} onClick={() => onView(l)} className="text-left rounded-2xl border p-4 transition hover:shadow-md" style={{ borderColor: C.borderSoft, background: C.surface }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ background: l.color }} /><span className="font-mono text-xs font-semibold px-1.5 py-0.5 rounded" style={{ background: C.bg, color: C.ink, fontFamily: FONT_MONO }}>{l.code}</span></div>
                </div>
                <h3 className="font-semibold mb-1" style={{ color: C.ink, fontFamily: FONT_DISPLAY }}>{l.name}</h3>
                {l.description && <p className="text-xs mb-3 line-clamp-2" style={{ color: C.mutedSoft }}>{l.description}</p>}
                <div className="flex items-center gap-4 pt-3 border-t" style={{ borderColor: C.borderSoft }}>
                  <div><p className="text-xs" style={{ color: C.muted }}>SKU</p><p className="font-bold" style={{ fontFamily: FONT_MONO, color: C.ink }}>{t.skus}</p></div>
                  <div><p className="text-xs" style={{ color: C.muted }}>จำนวนรวม</p><p className="font-bold" style={{ fontFamily: FONT_MONO, color: C.primary }}>{fmtNum(t.qty)}</p></div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TxProductLocationForm({ products, locations, stockMap, mode, onSubmit, recent, locById, prodById }) {
  const [productId, setProductId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [qty, setQty] = useState("");
  const [date, setDate] = useState(todayISO());
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const isOut = mode === "OUT";
  const available = productId && locationId ? (stockMap[productId]?.[locationId] || 0) : null;
  const eligibleLocations = isOut && productId ? locations.filter((l) => (stockMap[productId]?.[l.id] || 0) > 0) : locations;

  async function submit() {
    if (!productId) { setErr("กรุณาเลือกสินค้า"); return; }
    if (!locationId) { setErr("กรุณาเลือก Location"); return; }
    const q = Number(qty);
    if (!q || q <= 0) { setErr("กรุณากรอกจำนวนให้ถูกต้อง"); return; }
    if (isOut && q > available) { setErr(`จำนวนคงเหลือไม่พอ (มีอยู่ ${fmtNum(available)})`); return; }
    setErr(""); setSaving(true);
    await onSubmit({ productId, locationId, qty: q, date, reference, note });
    setSaving(false);
    setProductId(""); setLocationId(""); setQty(""); setReference(""); setNote("");
  }

  const meta = TYPE_META[mode];
  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-5">
      <div className="rounded-2xl border p-5" style={{ borderColor: C.borderSoft, background: C.surface }}>
        {err && <div className="mb-4 px-3 py-2 rounded-lg text-sm" style={{ background: C.dangerSoft, color: C.danger }}>{err}</div>}
        <div className="grid sm:grid-cols-2 gap-x-4">
          <Field label="สินค้า" required>
            <Select value={productId} onChange={(e) => { setProductId(e.target.value); setLocationId(""); }}>
              <option value="">เลือกสินค้า</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
            </Select>
          </Field>
          <Field label="Location" required>
            <Select value={locationId} onChange={(e) => setLocationId(e.target.value)} disabled={!productId && isOut}>
              <option value="">เลือก Location</option>
              {eligibleLocations.map((l) => <option key={l.id} value={l.id}>{l.code} · {l.name}{isOut ? ` (มี ${fmtNum(stockMap[productId]?.[l.id] || 0)})` : ""}</option>)}
            </Select>
            {isOut && productId && eligibleLocations.length === 0 && <span className="block text-xs mt-1" style={{ color: C.warn }}>ไม่มีสต็อกของสินค้านี้ใน Location ใดเลย</span>}
          </Field>
          <Field label="จำนวน" required hint={available !== null ? `คงเหลือที่ Location นี้: ${fmtNum(available)}` : undefined}>
            <MonoInput type="number" min="0" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" />
          </Field>
          <Field label="วันที่" required><TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ fontFamily: FONT_MONO }} /></Field>
          <Field label="เลขที่เอกสารอ้างอิง"><TextInput value={reference} onChange={(e) => setReference(e.target.value)} placeholder={isOut ? "เลขที่ใบเบิก" : "เลขที่ PO / ใบนำเข้า"} /></Field>
          <Field label="หมายเหตุ"><TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="หมายเหตุเพิ่มเติม" /></Field>
        </div>
        <PrimaryButton onClick={submit} disabled={saving || products.length === 0 || locations.length === 0} icon={saving ? Loader2 : meta.icon} className="mt-1">
          {saving ? "กำลังบันทึก..." : `บันทึก${meta.label}`}
        </PrimaryButton>
      </div>
      <div className="rounded-2xl border p-5" style={{ borderColor: C.borderSoft, background: C.surface }}>
        <h3 className="text-sm font-semibold mb-3" style={{ color: C.ink }}>รายการล่าสุด</h3>
        {recent.length === 0 ? <p className="text-sm py-6 text-center" style={{ color: C.mutedSoft }}>ยังไม่มีรายการ</p> : (
          <div className="space-y-2 max-h-[420px] overflow-y-auto">
            {recent.map((m) => (
              <div key={m.id} className="px-3 py-2 rounded-lg" style={{ background: C.bg }}>
                <div className="flex justify-between items-start mb-0.5"><p className="text-sm font-medium" style={{ color: C.ink }}>{prodById[m.productId]?.name || "-"}</p><span className="text-sm font-bold flex-shrink-0" style={{ fontFamily: FONT_MONO, color: meta.color }}>{fmtNum(m.qty)}</span></div>
                <div className="flex items-center justify-between text-xs" style={{ color: C.mutedSoft }}><LocationChip location={locById[m.locationId]} /><span style={{ fontFamily: FONT_MONO }}>{fmtDateDisplay(m.date)}</span></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ReceivePage({ products, locations, movements, stockMap, addMovement }) {
  const prodById = Object.fromEntries(products.map((p) => [p.id, p]));
  const locById = Object.fromEntries(locations.map((l) => [l.id, l]));
  const recent = movements.filter((m) => m.type === "IN").sort((a, b) => b.createdAt - a.createdAt).slice(0, 10);
  return (
    <div>
      <PageHeader title="รับเข้า" subtitle="บันทึกสินค้าที่รับเข้าคลัง สต็อกในแต่ละ Location จะอัปเดตอัตโนมัติ" />
      {products.length === 0 || locations.length === 0 ? (
        <EmptyState icon={ArrowDownToLine} title="ต้องเพิ่มสินค้าและ Location ก่อน" description="กรุณาเพิ่มข้อมูลสินค้าและ Location อย่างน้อย 1 รายการก่อนเริ่มบันทึกการรับเข้า" />
      ) : (
        <TxProductLocationForm products={products} locations={locations} stockMap={stockMap} mode="IN" onSubmit={(d) => addMovement("IN", d)} recent={recent} locById={locById} prodById={prodById} />
      )}
    </div>
  );
}

function IssuePage({ products, locations, movements, stockMap, addMovement }) {
  const prodById = Object.fromEntries(products.map((p) => [p.id, p]));
  const locById = Object.fromEntries(locations.map((l) => [l.id, l]));
  const recent = movements.filter((m) => m.type === "OUT").sort((a, b) => b.createdAt - a.createdAt).slice(0, 10);
  return (
    <div>
      <PageHeader title="จ่ายออก" subtitle="บันทึกสินค้าที่เบิกจ่ายออกจากคลัง ระบบจะตรวจสอบยอดคงเหลือให้อัตโนมัติ" />
      {products.length === 0 || locations.length === 0 ? (
        <EmptyState icon={ArrowUpFromLine} title="ต้องเพิ่มสินค้าและ Location ก่อน" description="กรุณาเพิ่มข้อมูลสินค้าและ Location อย่างน้อย 1 รายการก่อนเริ่มบันทึกการจ่ายออก" />
      ) : (
        <TxProductLocationForm products={products} locations={locations} stockMap={stockMap} mode="OUT" onSubmit={(d) => addMovement("OUT", d)} recent={recent} locById={locById} prodById={prodById} />
      )}
    </div>
  );
}

function TransferPage({ products, locations, movements, stockMap, addTransfer }) {
  const [productId, setProductId] = useState("");
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [qty, setQty] = useState("");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const prodById = Object.fromEntries(products.map((p) => [p.id, p]));
  const locById = Object.fromEntries(locations.map((l) => [l.id, l]));
  const fromOptions = productId ? locations.filter((l) => (stockMap[productId]?.[l.id] || 0) > 0) : [];
  const available = productId && fromId ? (stockMap[productId]?.[fromId] || 0) : null;
  const recent = movements.filter((m) => m.type === "TRANSFER_OUT").sort((a, b) => b.createdAt - a.createdAt).slice(0, 10);

  async function submit() {
    if (!productId || !fromId || !toId) { setErr("กรุณาเลือกสินค้าและ Location ให้ครบ"); return; }
    if (fromId === toId) { setErr("Location ต้นทางและปลายทางต้องไม่ใช่จุดเดียวกัน"); return; }
    const q = Number(qty);
    if (!q || q <= 0) { setErr("กรุณากรอกจำนวนให้ถูกต้อง"); return; }
    if (q > available) { setErr(`จำนวนคงเหลือไม่พอ (มีอยู่ ${fmtNum(available)})`); return; }
    setErr(""); setSaving(true);
    await addTransfer({ productId, fromId, toId, qty: q, date, note });
    setSaving(false);
    setProductId(""); setFromId(""); setToId(""); setQty(""); setNote("");
  }

  if (products.length === 0 || locations.length < 2) {
    return (
      <div>
        <PageHeader title="โอนย้าย" subtitle="ย้ายสินค้าระหว่าง Location" />
        <EmptyState icon={ArrowLeftRight} title="ต้องมีอย่างน้อย 2 Location" description="กรุณาเพิ่มสินค้าและ Location อย่างน้อย 2 จุดก่อนเริ่มโอนย้ายสต็อก" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="โอนย้าย" subtitle="ย้ายสินค้าระหว่าง Location ระบบจะตัดยอดต้นทางและเพิ่มยอดปลายทางให้อัตโนมัติ" />
      <div className="grid lg:grid-cols-[1fr_360px] gap-5">
        <div className="rounded-2xl border p-5" style={{ borderColor: C.borderSoft, background: C.surface }}>
          {err && <div className="mb-4 px-3 py-2 rounded-lg text-sm" style={{ background: C.dangerSoft, color: C.danger }}>{err}</div>}
          <Field label="สินค้า" required>
            <Select value={productId} onChange={(e) => { setProductId(e.target.value); setFromId(""); }}>
              <option value="">เลือกสินค้า</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
            </Select>
          </Field>
          <div className="grid sm:grid-cols-[1fr_auto_1fr] gap-x-3 items-start">
            <Field label="จาก Location" required>
              <Select value={fromId} onChange={(e) => setFromId(e.target.value)}>
                <option value="">เลือกต้นทาง</option>
                {fromOptions.map((l) => <option key={l.id} value={l.id}>{l.code} (มี {fmtNum(stockMap[productId]?.[l.id] || 0)})</option>)}
              </Select>
            </Field>
            <div className="hidden sm:flex items-center justify-center pt-9"><ArrowRight size={18} style={{ color: C.mutedSoft }} /></div>
            <Field label="ไปยัง Location" required>
              <Select value={toId} onChange={(e) => setToId(e.target.value)}>
                <option value="">เลือกปลายทาง</option>
                {locations.filter((l) => l.id !== fromId).map((l) => <option key={l.id} value={l.id}>{l.code} · {l.name}</option>)}
              </Select>
            </Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-x-4">
            <Field label="จำนวน" required hint={available !== null ? `คงเหลือที่ต้นทาง: ${fmtNum(available)}` : undefined}><MonoInput type="number" min="0" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" /></Field>
            <Field label="วันที่" required><TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ fontFamily: FONT_MONO }} /></Field>
          </div>
          <Field label="หมายเหตุ"><TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="หมายเหตุเพิ่มเติม" /></Field>
          <PrimaryButton onClick={submit} disabled={saving} icon={saving ? Loader2 : ArrowLeftRight} className="mt-1">{saving ? "กำลังบันทึก..." : "บันทึกการโอนย้าย"}</PrimaryButton>
        </div>
        <div className="rounded-2xl border p-5" style={{ borderColor: C.borderSoft, background: C.surface }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: C.ink }}>รายการโอนล่าสุด</h3>
          {recent.length === 0 ? <p className="text-sm py-6 text-center" style={{ color: C.mutedSoft }}>ยังไม่มีรายการ</p> : (
            <div className="space-y-2 max-h-[420px] overflow-y-auto">
              {recent.map((m) => (
                <div key={m.id} className="px-3 py-2 rounded-lg" style={{ background: C.bg }}>
                  <p className="text-sm font-medium mb-1" style={{ color: C.ink }}>{prodById[m.productId]?.name || "-"}</p>
                  <div className="flex items-center gap-1.5 text-xs mb-1"><LocationChip location={locById[m.locationId]} /><ArrowRight size={12} style={{ color: C.mutedSoft }} /><LocationChip location={locById[m.toLocationId]} /></div>
                  <div className="flex items-center justify-between text-xs" style={{ color: C.mutedSoft }}><span style={{ fontFamily: FONT_MONO }}>{fmtDateDisplay(m.date)}</span><span style={{ fontFamily: FONT_MONO, color: C.violet }} className="font-semibold">{fmtNum(m.qty)}</span></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StockReportPage({ products, locations, stockMap, onAdjust }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const categories = useMemo(() => [...new Set(products.map((p) => p.category).filter(Boolean))], [products]);

  function total(pid) { const m = stockMap[pid]; return m ? Object.values(m).reduce((a, b) => a + b, 0) : 0; }

  const filtered = products.filter((p) => {
    if (cat && p.category !== cat) return false;
    if (lowOnly && !(p.reorderPoint > 0 && total(p.id) <= p.reorderPoint)) return false;
    if (q) { const s = q.toLowerCase(); if (!p.name.toLowerCase().includes(s) && !p.sku.toLowerCase().includes(s)) return false; }
    return true;
  });

  function exportCsv() {
    const headers = ["SKU", "ชื่อสินค้า", "หมวดหมู่", ...locations.map((l) => l.code), "รวม", "จุดสั่งซื้อ", "สถานะ"];
    const rows = filtered.map((p) => {
      const t = total(p.id);
      const status = p.reorderPoint > 0 && t <= p.reorderPoint ? "ต่ำกว่าจุดสั่งซื้อ" : "ปกติ";
      return [p.sku, p.name, p.category || "", ...locations.map((l) => stockMap[p.id]?.[l.id] || 0), t, p.reorderPoint, status];
    });
    downloadCSV(`stock-report-${todayISO()}.csv`, headers, rows);
  }

  return (
    <div>
      <PageHeader title="รายงานสินค้าคงเหลือ" subtitle="ภาพรวมสต็อกแยกตาม Location ของสินค้าทุกรายการ" action={products.length > 0 && <GhostButton icon={Download} onClick={exportCsv}>ส่งออก CSV</GhostButton>} />
      {products.length === 0 || locations.length === 0 ? (
        <EmptyState icon={ClipboardList} title="ยังไม่มีข้อมูลให้แสดงรายงาน" description="เพิ่มสินค้าและ Location เพื่อเริ่มดูรายงานสินค้าคงเหลือ" />
      ) : (
        <>
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px]"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.mutedSoft }} /><TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ, SKU..." className="pl-9" /></div>
            {categories.length > 0 && <div className="w-44"><Select value={cat} onChange={(e) => setCat(e.target.value)}><option value="">ทุกหมวดหมู่</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}</Select></div>}
            <button onClick={() => setLowOnly((v) => !v)} className="px-3 py-2 rounded-lg text-sm font-medium border flex items-center gap-1.5 transition" style={{ borderColor: lowOnly ? C.warn : C.border, background: lowOnly ? C.warnSoft : C.surface, color: lowOnly ? C.warn : C.muted }}>
              <AlertTriangle size={14} /> ต่ำกว่าจุดสั่งซื้อเท่านั้น
            </button>
          </div>
          <div className="rounded-2xl border overflow-hidden overflow-x-auto" style={{ borderColor: C.borderSoft }}>
            <table className="w-full text-sm" style={{ minWidth: 480 + locations.length * 100 }}>
              <thead><tr style={{ background: C.bg }}>
                <th className="text-left font-semibold px-4 py-3 sticky left-0" style={{ color: C.muted, background: C.bg }}>สินค้า</th>
                {locations.map((l) => <th key={l.id} className="text-right font-semibold px-3 py-3 whitespace-nowrap" style={{ color: C.muted }}><LocationChip location={l} /></th>)}
                <th className="text-right font-semibold px-3 py-3" style={{ color: C.muted }}>รวม</th>
                <th className="text-left font-semibold px-3 py-3" style={{ color: C.muted }}>สถานะ</th>
                <th className="px-2 py-3"></th>
              </tr></thead>
              <tbody>
                {filtered.map((p, i) => {
                  const t = total(p.id);
                  return (
                    <tr key={p.id} style={{ borderTop: i !== 0 ? `1px solid ${C.borderSoft}` : "none" }} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 sticky left-0" style={{ background: C.surface }}><p className="font-medium" style={{ color: C.ink }}>{p.name}</p><p className="text-xs" style={{ fontFamily: FONT_MONO, color: C.mutedSoft }}>{p.sku}</p></td>
                      {locations.map((l) => { const v = stockMap[p.id]?.[l.id] || 0; return <td key={l.id} className="px-3 py-2.5 text-right" style={{ fontFamily: FONT_MONO, color: v > 0 ? C.ink : C.mutedSoft }}>{v !== 0 ? fmtNum(v) : "-"}</td>; })}
                      <td className="px-3 py-2.5 text-right font-bold" style={{ fontFamily: FONT_MONO, color: C.primary }}>{fmtNum(t)}</td>
                      <td className="px-3 py-2.5"><StatusBadge qty={t} reorderPoint={p.reorderPoint} /></td>
                      <td className="px-2 py-2.5 text-right"><IconButton icon={SlidersHorizontal} title="ปรับยอด" onClick={() => onAdjust(p)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && <p className="text-sm py-10 text-center" style={{ color: C.mutedSoft }}>ไม่พบข้อมูลตามเงื่อนไขที่เลือก</p>}
          </div>
        </>
      )}
    </div>
  );
}

const PAGE_SIZE = 20;
function MovementReportPage({ products, locations, movements, deleteMovement }) {
  const [type, setType] = useState("");
  const [productId, setProductId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const prodById = Object.fromEntries(products.map((p) => [p.id, p]));
  const locById = Object.fromEntries(locations.map((l) => [l.id, l]));

  const filtered = useMemo(() => {
    return movements.filter((m) => {
      if (type && m.type !== type) return false;
      if (productId && m.productId !== productId) return false;
      if (locationId && m.locationId !== locationId) return false;
      if (from && (m.date || "") < from) return false;
      if (to && (m.date || "") > to) return false;
      return true;
    }).sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.createdAt - a.createdAt);
  }, [movements, type, productId, locationId, from, to]);

  useEffect(() => { setPage(0); }, [type, productId, locationId, from, to]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  function exportCsv() {
    const headers = ["วันที่", "ประเภท", "SKU", "สินค้า", "Location", "จำนวน", "เอกสารอ้างอิง", "หมายเหตุ"];
    const rows = filtered.map((m) => [fmtDateDisplay(m.date), TYPE_META[m.type].label, prodById[m.productId]?.sku || "", prodById[m.productId]?.name || "", locById[m.locationId]?.code || "", (m.type === "OUT" || m.type === "TRANSFER_OUT") ? -Math.abs(m.qty) : m.qty, m.reference || "", m.note || ""]);
    downloadCSV(`movement-report-${todayISO()}.csv`, headers, rows);
  }

  return (
    <div>
      <PageHeader title="รายงานความเคลื่อนไหว" subtitle={`พบ ${filtered.length} รายการ`} action={movements.length > 0 && <GhostButton icon={Download} onClick={exportCsv}>ส่งออก CSV</GhostButton>} />
      {movements.length === 0 ? (
        <EmptyState icon={Activity} title="ยังไม่มีความเคลื่อนไหว" description="เมื่อมีการรับเข้า จ่ายออก หรือโอนย้ายสินค้า รายการจะปรากฏที่นี่" />
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
            <Select value={type} onChange={(e) => setType(e.target.value)}><option value="">ทุกประเภท</option>{Object.entries(TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
            <Select value={productId} onChange={(e) => setProductId(e.target.value)}><option value="">ทุกสินค้า</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
            <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}><option value="">ทุก Location</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.code} · {l.name}</option>)}</Select>
            <TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ fontFamily: FONT_MONO }} />
            <TextInput type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ fontFamily: FONT_MONO }} />
          </div>
          <div className="rounded-2xl border overflow-hidden overflow-x-auto" style={{ borderColor: C.borderSoft }}>
            <table className="w-full text-sm min-w-[760px]">
              <thead><tr style={{ background: C.bg }}>
                <th className="text-left font-semibold px-4 py-3" style={{ color: C.muted }}>วันที่</th>
                <th className="text-left font-semibold px-3 py-3" style={{ color: C.muted }}>ประเภท</th>
                <th className="text-left font-semibold px-3 py-3" style={{ color: C.muted }}>สินค้า</th>
                <th className="text-left font-semibold px-3 py-3" style={{ color: C.muted }}>Location</th>
                <th className="text-right font-semibold px-3 py-3" style={{ color: C.muted }}>จำนวน</th>
                <th className="text-left font-semibold px-3 py-3" style={{ color: C.muted }}>อ้างอิง / หมายเหตุ</th>
                <th className="px-2 py-3"></th>
              </tr></thead>
              <tbody>
                {pageItems.map((m, i) => {
                  const meta = TYPE_META[m.type]; const Icon = meta.icon;
                  const isNeg = m.type === "OUT" || m.type === "TRANSFER_OUT" || (m.type === "ADJUST" && m.qty < 0);
                  return (
                    <tr key={m.id} style={{ borderTop: i !== 0 ? `1px solid ${C.borderSoft}` : "none" }} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 whitespace-nowrap" style={{ fontFamily: FONT_MONO, color: C.muted }}>{fmtDateDisplay(m.date)}</td>
                      <td className="px-3 py-2.5"><Badge color={meta.color} bg={meta.bg}><Icon size={11} />{meta.label}</Badge></td>
                      <td className="px-3 py-2.5"><p style={{ color: C.ink }}>{prodById[m.productId]?.name || "(ลบแล้ว)"}</p><p className="text-xs" style={{ fontFamily: FONT_MONO, color: C.mutedSoft }}>{prodById[m.productId]?.sku}</p></td>
                      <td className="px-3 py-2.5"><LocationChip location={locById[m.locationId]} /></td>
                      <td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap" style={{ fontFamily: FONT_MONO, color: isNeg ? C.danger : C.success }}>{isNeg ? "-" : "+"}{fmtNum(Math.abs(m.qty))}</td>
                      <td className="px-3 py-2.5 max-w-[220px]"><p className="truncate" style={{ color: C.muted }}>{m.reference || "-"}</p>{m.note && <p className="text-xs truncate" style={{ color: C.mutedSoft }}>{m.note}</p>}</td>
                      <td className="px-2 py-2.5 text-right"><IconButton icon={Trash2} title="ลบรายการ" danger onClick={() => deleteMovement(m)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pageCount > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm" style={{ color: C.muted }}>หน้า {page + 1} จาก {pageCount}</span>
              <div className="flex gap-2">
                <IconButton icon={ChevronLeft} title="ก่อนหน้า" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} />
                <IconButton icon={ChevronRight} title="ถัดไป" onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------- nav config ------------------------------- */
const NAV = [
  { id: "dashboard", label: "ภาพรวม", icon: LayoutDashboard },
  { id: "products", label: "สินค้า", icon: Package },
  { id: "locations", label: "Location", icon: MapPin },
  { id: "receive", label: "รับเข้า", icon: ArrowDownToLine },
  { id: "issue", label: "จ่ายออก", icon: ArrowUpFromLine },
  { id: "transfer", label: "โอนย้าย", icon: ArrowLeftRight },
  { id: "stockReport", label: "รายงานคงเหลือ", icon: ClipboardList },
  { id: "movementReport", label: "รายงานเคลื่อนไหว", icon: Activity },
];

/* --------------------------------- app --------------------------------- */
export default function InventoryApp() {
  const [tab, setTab] = useState("dashboard");
  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const [productModal, setProductModal] = useState(null); // 'new' | product
  const [productDetail, setProductDetail] = useState(null);
  const [locationModal, setLocationModal] = useState(null);
  const [locationDetail, setLocationDetail] = useState(null);
  const [adjustTarget, setAdjustTarget] = useState(null); // { product, location, currentQty }

  useEffect(() => {
    if (!supabaseConfigured) { setLoading(false); return; }
    let mounted = true;
    (async () => {
      try {
        const [{ data: p, error: e1 }, { data: l, error: e2 }, { data: m, error: e3 }] = await Promise.all([
          supabase.from("products").select("*").order("createdAt", { ascending: true }),
          supabase.from("locations").select("*").order("createdAt", { ascending: true }),
          supabase.from("movements").select("*").order("createdAt", { ascending: true }),
        ]);
        if (e1 || e2 || e3) throw new Error("fetch failed");
        if (mounted) { setProducts(p || []); setLocations(l || []); setMovements(m || []); }
      } catch (e) {
        if (mounted) notify("โหลดข้อมูลไม่สำเร็จ กรุณารีเฟรชหน้าเว็บ", "error");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 2800); return () => clearTimeout(t); } }, [toast]);
  function notify(message, type = "success") { setToast({ message, type }); }

  const stockMap = useMemo(() => computeStock(movements), [movements]);
  function productTotal(pid) { const m = stockMap[pid]; return m ? Object.values(m).reduce((a, b) => a + b, 0) : 0; }
  const lowStock = useMemo(() => products.filter((p) => p.reorderPoint > 0 && productTotal(p.id) <= p.reorderPoint), [products, stockMap]);
  const categories = useMemo(() => [...new Set(products.map((p) => p.category).filter(Boolean))], [products]);

  async function saveProduct(data) {
    if (data.id) {
      const { error } = await supabase.from("products").update(data).eq("id", data.id);
      if (error) { notify("บันทึกข้อมูลสินค้าไม่สำเร็จ", "error"); return; }
      setProducts((prev) => prev.map((p) => (p.id === data.id ? { ...p, ...data } : p)));
    } else {
      const product = { ...data, id: uid("prod"), createdAt: Date.now() };
      const { error } = await supabase.from("products").insert([product]);
      if (error) { notify("บันทึกข้อมูลสินค้าไม่สำเร็จ", "error"); return; }
      setProducts((prev) => [...prev, product]);
    }
    setProductModal(null);
    notify(data.id ? "แก้ไขข้อมูลสินค้าเรียบร้อย" : "เพิ่มสินค้าใหม่เรียบร้อย");
  }
  async function deleteProduct(p) {
    if (!window.confirm(`ยืนยันการลบ "${p.name}"? ประวัติความเคลื่อนไหวที่เกี่ยวข้องจะยังคงอยู่ในรายงาน`)) return;
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    if (error) { notify("ลบสินค้าไม่สำเร็จ", "error"); return; }
    setProducts((prev) => prev.filter((x) => x.id !== p.id));
    setProductDetail(null);
    notify("ลบสินค้าเรียบร้อย");
  }

  async function saveLocation(data) {
    if (data.id) {
      const { error } = await supabase.from("locations").update(data).eq("id", data.id);
      if (error) { notify("บันทึก Location ไม่สำเร็จ", "error"); return; }
      setLocations((prev) => prev.map((l) => (l.id === data.id ? { ...l, ...data } : l)));
    } else {
      const location = { ...data, id: uid("loc"), createdAt: Date.now() };
      const { error } = await supabase.from("locations").insert([location]);
      if (error) { notify("บันทึก Location ไม่สำเร็จ", "error"); return; }
      setLocations((prev) => [...prev, location]);
    }
    setLocationModal(null);
    notify(data.id ? "แก้ไขข้อมูล Location เรียบร้อย" : "เพิ่ม Location ใหม่เรียบร้อย");
  }
  async function deleteLocation(l) {
    if (!window.confirm(`ยืนยันการลบ Location "${l.name}"? ประวัติความเคลื่อนไหวที่เกี่ยวข้องจะยังคงอยู่ในรายงาน`)) return;
    const { error } = await supabase.from("locations").delete().eq("id", l.id);
    if (error) { notify("ลบ Location ไม่สำเร็จ", "error"); return; }
    setLocations((prev) => prev.filter((x) => x.id !== l.id));
    setLocationDetail(null);
    notify("ลบ Location เรียบร้อย");
  }

  async function addMovement(type, data) {
    const mv = { id: uid("mv"), type, productId: data.productId, locationId: data.locationId, qty: Number(data.qty), date: data.date, reference: data.reference || "", note: data.note || "", createdAt: Date.now() };
    const { error } = await supabase.from("movements").insert([mv]);
    if (error) { notify("บันทึกรายการไม่สำเร็จ", "error"); return; }
    setMovements((prev) => [...prev, mv]);
    notify(type === "IN" ? "บันทึกรับเข้าเรียบร้อย" : "บันทึกจ่ายออกเรียบร้อย");
  }
  async function addTransfer(data) {
    const transferId = uid("tr");
    const toLoc = locations.find((l) => l.id === data.toId);
    const fromLoc = locations.find((l) => l.id === data.fromId);
    const out = { id: uid("mv"), type: "TRANSFER_OUT", productId: data.productId, locationId: data.fromId, toLocationId: data.toId, qty: Number(data.qty), date: data.date, reference: transferId, note: data.note ? `${data.note} (ไป ${toLoc?.code || ""})` : `โอนไปยัง ${toLoc?.code || ""}`, createdAt: Date.now(), transferId };
    const inn = { id: uid("mv"), type: "TRANSFER_IN", productId: data.productId, locationId: data.toId, toLocationId: data.fromId, qty: Number(data.qty), date: data.date, reference: transferId, note: data.note ? `${data.note} (จาก ${fromLoc?.code || ""})` : `โอนจาก ${fromLoc?.code || ""}`, createdAt: Date.now() + 1, transferId };
    const { error } = await supabase.from("movements").insert([out, inn]);
    if (error) { notify("บันทึกการโอนย้ายไม่สำเร็จ", "error"); return; }
    setMovements((prev) => [...prev, out, inn]);
    notify("บันทึกการโอนย้ายเรียบร้อย");
  }
  async function addAdjust({ product, location, delta, note }) {
    const mv = { id: uid("mv"), type: "ADJUST", productId: product.id, locationId: location.id, qty: delta, date: todayISO(), reference: "", note: note || "ปรับปรุงยอดสต็อก", createdAt: Date.now() };
    const { error } = await supabase.from("movements").insert([mv]);
    if (error) { notify("บันทึกการปรับยอดไม่สำเร็จ", "error"); return; }
    setMovements((prev) => [...prev, mv]);
    setAdjustTarget(null);
    notify("บันทึกการปรับยอดเรียบร้อย");
  }
  async function deleteMovement(m) {
    if (!window.confirm("ยืนยันการลบรายการนี้? ยอดสต็อกจะถูกคำนวณใหม่ทันที")) return;
    const { error } = await supabase.from("movements").delete().eq("id", m.id);
    if (error) { notify("ลบรายการไม่สำเร็จ", "error"); return; }
    setMovements((prev) => prev.filter((x) => x.id !== m.id));
    notify("ลบรายการเรียบร้อย");
  }

  function openAdjustFromProduct(product, location, currentQty) { setAdjustTarget({ product, location, currentQty }); }
  function openAdjustFromReport(product) {
    const locsWithStock = locations.filter((l) => (stockMap[product.id]?.[l.id] || 0) !== 0);
    const loc = locsWithStock[0] || locations[0];
    if (!loc) { notify("ยังไม่มี Location ในระบบ", "error"); return; }
    setAdjustTarget({ product, location: loc, currentQty: stockMap[product.id]?.[loc.id] || 0 });
  }

  const totalQty = useMemo(() => products.reduce((a, p) => a + productTotal(p.id), 0), [products, stockMap]);

  if (!supabaseConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: C.bg, fontFamily: FONT_BODY }}>
        <div className="w-full max-w-lg rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: C.borderSoft, background: C.surface }}>
          <div className="px-6 py-5" style={{ background: `linear-gradient(135deg, ${C.headerBg}, ${C.headerBg2})` }}>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.08)" }}><Warehouse size={20} color={C.led} /></div>
              <h1 className="text-lg font-bold" style={{ fontFamily: FONT_DISPLAY, color: "#fff" }}>STOCKLINE</h1>
            </div>
          </div>
          <div className="px-6 py-6">
            <div className="flex items-start gap-3 mb-5 px-4 py-3 rounded-xl" style={{ background: C.dangerSoft }}>
              <AlertTriangle size={18} style={{ color: C.danger, flexShrink: 0, marginTop: 2 }} />
              <div>
                <p className="text-sm font-semibold mb-1" style={{ color: C.danger }}>ยังไม่ได้ตั้งค่า Supabase</p>
                <p className="text-sm" style={{ color: C.danger }}>ไม่พบ Environment Variables <code style={{ fontFamily: FONT_MONO, fontSize: 11 }}>VITE_SUPABASE_URL</code> และ <code style={{ fontFamily: FONT_MONO, fontSize: 11 }}>VITE_SUPABASE_ANON_KEY</code></p>
              </div>
            </div>
            <h3 className="text-sm font-semibold mb-3" style={{ color: C.ink }}>วิธีแก้ไข (3 ขั้นตอน)</h3>
            {[
              { step: "1", title: "ไปที่ Vercel Dashboard", desc: "เปิด vercel.com → คลิกที่ project นี้" },
              { step: "2", title: "Settings → Environment Variables", desc: "เพิ่ม 2 ค่า: VITE_SUPABASE_URL และ VITE_SUPABASE_ANON_KEY (ค่าจาก Supabase > Settings > API)" },
              { step: "3", title: "Redeploy", desc: "ไปที่ Deployments → คลิก ⋯ ที่ deployment ล่าสุด → Redeploy" },
            ].map((s) => (
              <div key={s.step} className="flex gap-3 mb-3">
                <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-white" style={{ background: C.primary, marginTop: 1 }}>{s.step}</div>
                <div><p className="text-sm font-medium" style={{ color: C.ink }}>{s.title}</p><p className="text-xs mt-0.5" style={{ color: C.muted }}>{s.desc}</p></div>
              </div>
            ))}
            <div className="mt-4 px-4 py-3 rounded-xl text-xs" style={{ background: C.bg, color: C.muted, fontFamily: FONT_MONO }}>
              <p>VITE_SUPABASE_URL = https://xxxx.supabase.co</p>
              <p>VITE_SUPABASE_ANON_KEY = eyJhbGci...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]" style={{ background: C.bg, fontFamily: FONT_BODY }}>
        <div className="flex flex-col items-center gap-3"><Loader2 size={28} className="animate-spin" style={{ color: C.primary }} /><p className="text-sm" style={{ color: C.muted }}>กำลังโหลดข้อมูลคลังสินค้า...</p></div>
      </div>
    );
  }

  return (
    <div style={{ background: C.bg, fontFamily: FONT_BODY, minHeight: "100%" }}>

      {/* header band */}
      <div style={{ background: `linear-gradient(135deg, ${C.headerBg}, ${C.headerBg2})` }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.08)" }}><Warehouse size={20} color={C.led} /></div>
              <div>
                <h1 className="text-lg font-bold tracking-tight" style={{ fontFamily: FONT_DISPLAY, color: "#fff" }}>STOCKLINE</h1>
                <p className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>ระบบจัดการสต็อกสินค้า</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {[["SKU", products.length], ["จำนวนรวม", fmtNum(totalQty)], ["LOCATION", locations.length], ["ใกล้หมด", lowStock.length]].map(([label, val], i) => (
                <div key={i} className="text-right">
                  <p className="text-[10px] tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.35)", fontFamily: FONT_MONO }}>{label}</p>
                  <p className="text-xl font-bold leading-tight" style={{ fontFamily: FONT_MONO, color: label === "ใกล้หมด" && lowStock.length > 0 ? C.led : "#fff", textShadow: label === "ใกล้หมด" && lowStock.length > 0 ? `0 0 14px ${C.ledDim}` : "none" }}>{val}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* tab nav */}
      <div className="sticky top-0 z-30 border-b" style={{ background: C.surface, borderColor: C.borderSoft }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 overflow-x-auto">
          <div className="flex gap-1 min-w-max">
            {NAV.map((n) => {
              const active = tab === n.id;
              const Icon = n.icon;
              return (
                <button key={n.id} onClick={() => setTab(n.id)} className="flex items-center gap-1.5 px-3.5 py-3.5 text-sm font-medium border-b-2 transition whitespace-nowrap" style={{ borderColor: active ? C.primary : "transparent", color: active ? C.primary : C.muted }}>
                  <Icon size={15} />{n.label}
                  {n.id === "movementReport" && lowStock.length === 0 ? null : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {tab === "dashboard" && <DashboardPage products={products} locations={locations} movements={movements} stockMap={stockMap} productTotal={productTotal} lowStock={lowStock} setTab={setTab} />}
        {tab === "products" && <ProductsPage products={products} stockMap={stockMap} productTotal={productTotal} onAdd={() => setProductModal("new")} onView={(p) => setProductDetail(p)} />}
        {tab === "locations" && <LocationsPage locations={locations} products={products} stockMap={stockMap} onAdd={() => setLocationModal("new")} onView={(l) => setLocationDetail(l)} />}
        {tab === "receive" && <ReceivePage products={products} locations={locations} movements={movements} stockMap={stockMap} addMovement={addMovement} />}
        {tab === "issue" && <IssuePage products={products} locations={locations} movements={movements} stockMap={stockMap} addMovement={addMovement} />}
        {tab === "transfer" && <TransferPage products={products} locations={locations} movements={movements} stockMap={stockMap} addTransfer={addTransfer} />}
        {tab === "stockReport" && <StockReportPage products={products} locations={locations} stockMap={stockMap} onAdjust={openAdjustFromReport} />}
        {tab === "movementReport" && <MovementReportPage products={products} locations={locations} movements={movements} deleteMovement={deleteMovement} />}
      </div>

      {productModal && (
        <ProductFormModal
          initial={productModal === "new" ? null : productModal}
          categories={categories}
          units={UNIT_PRESETS}
          onClose={() => setProductModal(null)}
          onSave={saveProduct}
        />
      )}
      {productDetail && (
        <ProductDetailModal
          product={products.find((p) => p.id === productDetail.id) || productDetail}
          locations={locations}
          movements={movements}
          stockMap={stockMap}
          onClose={() => setProductDetail(null)}
          onEdit={(p) => { setProductDetail(null); setProductModal(p); }}
          onDelete={deleteProduct}
          onAdjust={openAdjustFromProduct}
        />
      )}
      {locationModal && (
        <LocationFormModal
          initial={locationModal === "new" ? null : locationModal}
          nextColor={LOCATION_COLORS[locations.length % LOCATION_COLORS.length]}
          onClose={() => setLocationModal(null)}
          onSave={saveLocation}
        />
      )}
      {locationDetail && (
        <LocationDetailModal
          location={locations.find((l) => l.id === locationDetail.id) || locationDetail}
          products={products}
          movements={movements}
          stockMap={stockMap}
          onClose={() => setLocationDetail(null)}
          onEdit={(l) => { setLocationDetail(null); setLocationModal(l); }}
          onDelete={deleteLocation}
        />
      )}
      {adjustTarget && (
        <AdjustModal
          product={adjustTarget.product}
          location={adjustTarget.location}
          currentQty={adjustTarget.currentQty}
          onClose={() => setAdjustTarget(null)}
          onSave={(d) => addAdjust({ product: adjustTarget.product, location: adjustTarget.location, ...d })}
        />
      )}

      <Toast toast={toast} />
    </div>
  );
}
