import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Plus, CalendarDays, X, Loader2, ChevronDown, ChevronLeft, ChevronRight,
  Search, Clock, User, AlertCircle, Settings, Check, List as ListIcon, Tag,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTenant } from '../contexts/TenantContext';

// ── Types ──────────────────────────────────────────────────────────────────────
export type AppointmentStatus = 'scheduled' | 'cancelled' | 'rescheduled' | 'completed';
type ViewMode = 'list' | 'week' | 'month';
interface Contact { id: string; full_name: string; }
interface ServiceType { id: string; name: string; duration_minutes: number; }
interface Appointment {
  id: string; company_id: string; contact_id: string;
  contact?: { full_name: string } | null;
  service_type_id: string;
  service_type?: { name: string; duration_minutes: number } | null;
  scheduled_at: string; ends_at: string; status: AppointmentStatus;
  notes?: string | null; cancellation_reason?: string | null;
  rescheduled_from_id?: string | null; created_at: string;
}
interface Slot { slot_start: string; slot_end: string; }
interface ToastState { message: string; type: 'success' | 'error'; }

// ── Constants ──────────────────────────────────────────────────────────────────
const STATUS_LABEL: Record<AppointmentStatus, string> = { scheduled: 'Agendado', cancelled: 'Cancelado', rescheduled: 'Remarcado', completed: 'Concluído' };
const STATUS_CLS: Record<AppointmentStatus, string> = {
  scheduled: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  cancelled: 'bg-red-500/15 text-red-400 border-red-500/30',
  rescheduled: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  completed: 'bg-green-500/15 text-green-400 border-green-500/30',
};
const ALL_ST: AppointmentStatus[] = ['scheduled', 'completed', 'rescheduled', 'cancelled'];
const WEEK_SHORT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const GRID_H = 700; const DAY_S = 7; const DAY_E = 21; const PPM = GRID_H / ((DAY_E - DAY_S) * 60);

// ── Helpers ────────────────────────────────────────────────────────────────────
const todayStr = () => new Date().toISOString().split('T')[0];
const isToday = (d: Date) => { const n = new Date(); return d.getDate()===n.getDate()&&d.getMonth()===n.getMonth()&&d.getFullYear()===n.getFullYear(); };
const isSameDay = (a: Date, b: Date) => a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();
const fmtDT = (dt: string) => new Date(dt).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
const fmtDate = (dt: string) => new Date(dt).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'});
const fmtTime = (dt: string) => new Date(dt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
const getWeekStart = (d: Date) => { const r=new Date(d); r.setDate(r.getDate()-r.getDay()); r.setHours(0,0,0,0); return r; };
const getWeekDates = (ws: Date) => Array.from({length:7},(_,i)=>{ const d=new Date(ws); d.setDate(d.getDate()+i); return d; });
const fmtWeekRange = (ws: Date) => { const we=new Date(ws); we.setDate(we.getDate()+6); return ws.getMonth()===we.getMonth()?`${ws.getDate()} – ${we.getDate()} ${MONTHS_PT[ws.getMonth()]} ${ws.getFullYear()}`:``; };
const getMonthGrid = (y:number,m:number)=>{const fd=new Date(y,m,1),dm=new Date(y,m+1,0).getDate(),sd=fd.getDay(),tc=Math.ceil((sd+dm)/7)*7;return Array.from({length:tc},(_,i)=>{const n=i-sd+1;return(n<1||n>dm)?null:new Date(y,m,n);});};
const avatarBg = (name:string) => { const cs=['bg-blue-500','bg-emerald-500','bg-violet-500','bg-amber-500','bg-rose-500','bg-cyan-500']; let h=0; for(let i=0;i<name.length;i++)h=name.charCodeAt(i)+((h<<5)-h); return cs[Math.abs(h)%cs.length]; };
const topPx = (dt:string) => Math.max(0,(new Date(dt).getHours()*60+new Date(dt).getMinutes()-DAY_S*60)*PPM);
const hPx = (s:string,e:string) => Math.max(28,(new Date(e).getTime()-new Date(s).getTime())/60000*PPM);

// ── Toast ──────────────────────────────────────────────────────────────────────
const Toast:React.FC<ToastState&{onDone:()=>void}>=({message,type,onDone})=>{
  useEffect(()=>{const t=setTimeout(onDone,3500);return()=>clearTimeout(t);},[onDone]);
  return <div className={`fixed bottom-6 right-6 z-[500] flex items-center gap-2.5 px-4 py-3 rounded-lg shadow-2xl border text-sm font-medium ${type==='success'?'bg-emerald-950 border-emerald-700/50 text-emerald-300':'bg-red-950 border-red-700/50 text-red-300'}`}>{type==='error'&&<AlertCircle size={15}/>}{message}</div>;
};

// ── Avatar ─────────────────────────────────────────────────────────────────────
const Av:React.FC<{name:string;size?:'sm'|'md'}>=({name,size='sm'})=>(
  <div className={`${size==='sm'?'w-6 h-6 text-[10px]':'w-9 h-9 text-sm'} ${avatarBg(name??'?')} rounded-full flex items-center justify-center font-semibold text-white shrink-0`}>{(name?.[0]??'?').toUpperCase()}</div>
);

// ── SlotsPicker ────────────────────────────────────────────────────────────────
const SlotsPicker:React.FC<{companyId:string;serviceTypeId:string;date:string;selected:string|null;onSelect:(s:string)=>void}>=({companyId,serviceTypeId,date,selected,onSelect})=>{
  const [slots,setSlots]=useState<Slot[]>([]);const [loading,setLoading]=useState(false);
  useEffect(()=>{if(!serviceTypeId||!date){setSlots([]);return;}setLoading(true);setSlots([]);
    supabase.rpc('rpc_get_available_slots',{p_company_id:companyId,p_service_type_id:serviceTypeId,p_date:date}).then(({data})=>{const r=data as {success:boolean;slots?:Slot[]}|null;setSlots(r?.slots??[]);setLoading(false);});
  },[companyId,serviceTypeId,date]);
  if(loading)return<div className="flex gap-2 flex-wrap mt-1">{[1,2,3,4].map(i=><div key={i} className="h-8 w-20 bg-surface rounded animate-pulse"/>)}</div>;
  if(!slots.length)return<p className="text-xs text-stone-500 mt-1">Nenhum horário disponível nesta data.</p>;
  return<div className="flex gap-2 flex-wrap mt-1">{slots.map(s=><button key={s.slot_start} type="button" onClick={()=>onSelect(s.slot_start)} className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-all ${selected===s.slot_start?'bg-primary text-background border-primary':'border-border text-text-muted hover:border-primary/50 hover:text-primary'}`}>{fmtTime(s.slot_start)}</button>)}</div>;
};

// ── ContactSearch ──────────────────────────────────────────────────────────────
const ContactSearch:React.FC<{companyId:string;value:Contact|null;onChange:(c:Contact|null)=>void}>=({companyId,value,onChange})=>{
  const [q,setQ]=useState('');const [res,setRes]=useState<Contact[]>([]);const [open,setOpen]=useState(false);const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{const h=(e:MouseEvent)=>{if(ref.current&&!ref.current.contains(e.target as Node))setOpen(false);};document.addEventListener('mousedown',h);return()=>document.removeEventListener('mousedown',h);},[]);
  useEffect(()=>{if(q.length<2){setRes([]);return;}const t=setTimeout(async()=>{const{data}=await supabase.from('contacts').select('id,full_name').eq('company_id',companyId).ilike('full_name',`%${q}%`).limit(8);setRes((data as Contact[])??[]);setOpen(true);},300);return()=>clearTimeout(t);},[q,companyId]);
  if(value)return<div className="flex items-center justify-between bg-background border border-border rounded-md px-3 py-2.5"><span className="text-sm text-primary flex items-center gap-2"><User size={13} className="text-stone-500"/>{value.full_name}</span><button type="button" onClick={()=>{onChange(null);setQ('');}} className="text-stone-500 hover:text-primary"><X size={14}/></button></div>;
  return<div ref={ref} className="relative"><div className="relative"><Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500"/><input type="text" value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar por nome..." className="w-full bg-background border border-border rounded-md pl-8 pr-3 py-2.5 text-sm text-primary placeholder-stone-600 outline-none focus:border-primary/40 transition-colors"/></div>{open&&res.length>0&&<div className="absolute top-full left-0 right-0 z-50 mt-1 bg-surface border border-border rounded-lg shadow-2xl py-1 max-h-52 overflow-y-auto">{res.map(c=><button key={c.id} type="button" onClick={()=>{onChange(c);setOpen(false);}} className="w-full text-left px-3 py-2 text-sm text-text-muted hover:text-primary hover:bg-surface-hover transition-colors">{c.full_name}</button>)}</div>}</div>;
};

// ── ModalBase ──────────────────────────────────────────────────────────────────
const MB:React.FC<{title:string;onClose:()=>void;children:React.ReactNode}>=({title,onClose,children})=>(
  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
    <div className="bg-surface border border-border rounded-xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between px-6 py-5 border-b border-border sticky top-0 bg-surface z-10"><h2 className="text-base font-semibold text-primary">{title}</h2><button onClick={onClose} className="text-stone-400 hover:text-primary"><X size={20}/></button></div>
      {children}
    </div>
  </div>
);

// ── NewAppointmentModal ────────────────────────────────────────────────────────
interface NMProps { companyId:string; serviceTypes:ServiceType[]; onClose:()=>void; onCreated:()=>void; initialContact?:Contact|null; initialServiceTypeId?:string; initialDate?:string; }
const NewAppointmentModal:React.FC<NMProps>=({companyId,serviceTypes,onClose,onCreated,initialContact,initialServiceTypeId='',initialDate=''})=>{
  const [contact,setContact]=useState<Contact|null>(initialContact??null);
  const [stId,setStId]=useState(initialServiceTypeId);
  const [date,setDate]=useState(initialDate);
  const [slot,setSlot]=useState<string|null>(null);
  const [notes,setNotes]=useState('');const [saving,setSaving]=useState(false);const [err,setErr]=useState('');
  useEffect(()=>{setSlot(null);},[stId,date]);
  const create=async()=>{if(!contact||!stId||!slot)return;setSaving(true);setErr('');
    const{data}=await supabase.rpc('rpc_create_appointment',{p_company_id:companyId,p_contact_id:contact.id,p_conversation_id:null,p_service_type_id:stId,p_scheduled_at:slot,p_notes:notes||null});
    const r=data as{success:boolean;error?:string}|null;
    if(r?.success){onCreated();onClose();}else{setErr(r?.error??'Erro ao criar.');}setSaving(false);};
  return<MB title="Novo Agendamento" onClose={onClose}>
    <div className="px-6 py-5 space-y-4">
      <div><label className="block text-xs font-medium text-text-muted mb-1.5 uppercase tracking-wider">Contato *</label><ContactSearch companyId={companyId} value={contact} onChange={setContact}/></div>
      <div><label className="block text-xs font-medium text-text-muted mb-1.5 uppercase tracking-wider">Tipo de Serviço *</label><select value={stId} onChange={e=>setStId(e.target.value)} className="w-full bg-background border border-border rounded-md px-3 py-2.5 text-sm text-primary outline-none focus:border-primary/40 cursor-pointer"><option value="">Selecione...</option>{serviceTypes.map(s=><option key={s.id} value={s.id}>{s.name} ({s.duration_minutes} min)</option>)}</select></div>
      <div><label className="block text-xs font-medium text-text-muted mb-1.5 uppercase tracking-wider">Data *</label><input type="date" value={date} min={todayStr()} onChange={e=>setDate(e.target.value)} className="w-full bg-background border border-border rounded-md px-3 py-2.5 text-sm text-primary outline-none focus:border-primary/40"/></div>
      {stId&&date&&<div><label className="block text-xs font-medium text-text-muted mb-1.5 uppercase tracking-wider">Horário *</label><SlotsPicker companyId={companyId} serviceTypeId={stId} date={date} selected={slot} onSelect={setSlot}/></div>}
      <div><label className="block text-xs font-medium text-text-muted mb-1.5 uppercase tracking-wider">Observações</label><textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} placeholder="Informações adicionais..." className="w-full bg-background border border-border rounded-md px-3 py-2.5 text-sm text-primary placeholder-stone-600 outline-none focus:border-primary/40 resize-none"/></div>
      {err&&<div className="flex gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-md"><AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5"/><p className="text-xs text-red-400">{err}</p></div>}
    </div>
    <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
      <button onClick={onClose} className="px-4 py-2 text-sm text-text-muted hover:text-primary">Cancelar</button>
      <button onClick={create} disabled={!contact||!stId||!slot||saving} className="flex items-center gap-2 px-4 py-2 bg-primary text-background text-sm font-medium rounded-md hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed">{saving&&<Loader2 size={14} className="animate-spin"/>}Confirmar</button>
    </div>
  </MB>;
};

// ── RescheduleModal ────────────────────────────────────────────────────────────
const RescheduleModal:React.FC<{companyId:string;appointment:Appointment;onClose:()=>void;onDone:()=>void}>=({companyId,appointment,onClose,onDone})=>{
  const [date,setDate]=useState('');const [slot,setSlot]=useState<string|null>(null);const [notes,setNotes]=useState(appointment.notes??'');const [saving,setSaving]=useState(false);const [err,setErr]=useState('');
  useEffect(()=>{setSlot(null);},[date]);
  const go=async()=>{if(!slot)return;setSaving(true);setErr('');
    const{data}=await supabase.rpc('rpc_reschedule_appointment',{p_company_id:companyId,p_appointment_id:appointment.id,p_new_scheduled_at:slot,p_notes:notes||null});
    const r=data as{success:boolean;error?:string}|null;if(r?.success){onDone();onClose();}else{setErr(r?.error??'Erro ao remarcar.');}setSaving(false);};
  return<MB title="Remarcar Agendamento" onClose={onClose}>
    <div className="px-6 py-5 space-y-4">
      <div className="p-3 bg-surface-hover rounded-lg text-xs text-text-muted space-y-0.5"><p><span className="text-primary font-medium">Contato:</span> {appointment.contact?.full_name}</p><p><span className="text-primary font-medium">Serviço:</span> {appointment.service_type?.name}</p><p><span className="text-primary font-medium">Atual:</span> {fmtDT(appointment.scheduled_at)}</p></div>
      <div><label className="block text-xs font-medium text-text-muted mb-1.5 uppercase tracking-wider">Nova Data *</label><input type="date" value={date} min={todayStr()} onChange={e=>setDate(e.target.value)} className="w-full bg-background border border-border rounded-md px-3 py-2.5 text-sm text-primary outline-none focus:border-primary/40"/></div>
      {date&&<div><label className="block text-xs font-medium text-text-muted mb-1.5 uppercase tracking-wider">Novo Horário *</label><SlotsPicker companyId={companyId} serviceTypeId={appointment.service_type_id} date={date} selected={slot} onSelect={setSlot}/></div>}
      <div><textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} className="w-full bg-background border border-border rounded-md px-3 py-2.5 text-sm text-primary outline-none focus:border-primary/40 resize-none"/></div>
      {err&&<div className="flex gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-md"><AlertCircle size={14} className="text-red-400 shrink-0"/><p className="text-xs text-red-400">{err}</p></div>}
    </div>
    <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
      <button onClick={onClose} className="px-4 py-2 text-sm text-text-muted hover:text-primary">Cancelar</button>
      <button onClick={go} disabled={!slot||saving} className="flex items-center gap-2 px-4 py-2 bg-primary text-background text-sm font-medium rounded-md hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed">{saving&&<Loader2 size={14} className="animate-spin"/>}Confirmar Remarcação</button>
    </div>
  </MB>;
};

// ── CancelModal ────────────────────────────────────────────────────────────────
const CancelModal:React.FC<{companyId:string;appointment:Appointment;onClose:()=>void;onDone:()=>void}>=({companyId,appointment,onClose,onDone})=>{
  const [reason,setReason]=useState('');const [saving,setSaving]=useState(false);const [err,setErr]=useState('');
  const go=async()=>{setSaving(true);setErr('');
    const{data}=await supabase.rpc('rpc_cancel_appointment',{p_company_id:companyId,p_appointment_id:appointment.id,p_reason:reason||null});
    const r=data as{success:boolean;error?:string}|null;if(r?.success){onDone();onClose();}else{setErr(r?.error??'Erro ao cancelar.');}setSaving(false);};
  return<MB title="Cancelar Agendamento" onClose={onClose}>
    <div className="px-6 py-5 space-y-4">
      <p className="text-sm text-text-muted">Deseja cancelar o agendamento abaixo?</p>
      <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-lg text-xs space-y-0.5"><p><b className="text-primary">Contato:</b> {appointment.contact?.full_name}</p><p><b className="text-primary">Serviço:</b> {appointment.service_type?.name}</p><p><b className="text-primary">Data/Hora:</b> {fmtDT(appointment.scheduled_at)}</p></div>
      <div><label className="block text-xs font-medium text-text-muted mb-1.5 uppercase tracking-wider">Motivo (opcional)</label><textarea value={reason} onChange={e=>setReason(e.target.value)} rows={3} placeholder="Informe o motivo..." className="w-full bg-background border border-border rounded-md px-3 py-2.5 text-sm text-primary placeholder-stone-600 outline-none focus:border-primary/40 resize-none"/></div>
      {err&&<div className="flex gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-md"><AlertCircle size={14} className="text-red-400 shrink-0"/><p className="text-xs text-red-400">{err}</p></div>}
    </div>
    <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
      <button onClick={onClose} className="px-4 py-2 text-sm text-text-muted hover:text-primary">Manter Agendamento</button>
      <button onClick={go} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-500 disabled:opacity-40">{saving&&<Loader2 size={14} className="animate-spin"/>}Confirmar Cancelamento</button>
    </div>
  </MB>;
};

// ── ActionsMenu (portal-based) ─────────────────────────────────────────────────
interface AMProps { appointment:Appointment; companyId:string; onReschedule:()=>void; onCancel:()=>void; onReagenda:()=>void; onComplete:()=>void; }
const ActionsMenu:React.FC<AMProps>=({appointment,onReschedule,onCancel,onReagenda,onComplete})=>{
  const [open,setOpen]=useState(false);const [pos,setPos]=useState<{top:number;right:number}|null>(null);const btnRef=useRef<HTMLButtonElement>(null);
  const toggle=()=>{if(!open&&btnRef.current){const r=btnRef.current.getBoundingClientRect();setPos({top:r.bottom+4,right:window.innerWidth-r.right});}setOpen(v=>!v);};
  const close=()=>setOpen(false);
  const scheduled=appointment.status==='scheduled';
  return(
    <>
      <button ref={btnRef} onClick={toggle} className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-text-muted border border-border rounded-md hover:text-primary hover:border-primary/30 transition-colors">Ações<ChevronDown size={11}/></button>
      {open&&pos&&createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={close}/>
          <div className="fixed z-[9999] w-44 bg-zinc-900 border border-white/10 rounded-lg shadow-xl py-1.5" style={{top:pos.top,right:pos.right}}>
            {scheduled&&<><button onClick={()=>{onReschedule();close();}} className="w-full text-left px-3 py-2 text-xs text-text-muted hover:text-primary hover:bg-white/5 transition-colors">Remarcar</button>
            <button onClick={()=>{onComplete();close();}} className="w-full text-left px-3 py-2 text-xs text-emerald-400 hover:bg-white/5 transition-colors">Marcar como Concluído</button>
            <div className="h-px bg-white/5 my-1"/>
            <button onClick={()=>{onCancel();close();}} className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors">Cancelar</button></>}
            {!scheduled&&<button onClick={()=>{onReagenda();close();}} className="w-full text-left px-3 py-2 text-xs text-text-muted hover:text-primary hover:bg-white/5 transition-colors">Reagendar</button>}
          </div>
        </>,document.body
      )}
    </>
  );
};

// ── StatusBadge (interactive) ──────────────────────────────────────────────────
interface SBProps { appointment:Appointment; companyId:string; onCancel:()=>void; onReschedule:()=>void; onChanged:(newStatus:AppointmentStatus)=>void; setToast:(t:ToastState)=>void; }
const StatusBadge:React.FC<SBProps>=({appointment,companyId,onCancel,onReschedule,onChanged,setToast})=>{
  const [open,setOpen]=useState(false);const [pos,setPos]=useState<{top:number;left:number}|null>(null);const ref=useRef<HTMLButtonElement>(null);
  const toggle=()=>{if(!open&&ref.current){const r=ref.current.getBoundingClientRect();setPos({top:r.bottom+4,left:r.left});}setOpen(v=>!v);};
  const close=()=>setOpen(false);
  const pick=async(s:AppointmentStatus)=>{
    close();
    if(s===appointment.status)return;
    if(s==='cancelled'){onCancel();return;}
    if(s==='rescheduled'){onReschedule();return;}
    const{data}=await supabase.rpc('rpc_update_appointment_status',{p_company_id:companyId,p_appointment_id:appointment.id,p_new_status:s,p_reason:null});
    const r=data as{success:boolean;error?:string}|null;
    if(r?.success){onChanged(s);setToast({message:`Status atualizado para "${STATUS_LABEL[s]}".`,type:'success'});}
    else{setToast({message:r?.error??'Erro ao atualizar status.',type:'error'});}
  };
  return(
    <>
      <button ref={ref} onClick={toggle} title="Clique para alterar status"
        className={`text-[10px] px-2 py-0.5 rounded border font-medium uppercase tracking-wide cursor-pointer hover:opacity-80 transition-opacity ${STATUS_CLS[appointment.status]}`}>
        {appointment.status==='scheduled'&&<span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse mr-1"/>}
        {STATUS_LABEL[appointment.status]}
      </button>
      {open&&pos&&createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={close}/>
          <div className="fixed z-[9999] bg-zinc-900 border border-white/10 rounded-lg shadow-xl py-1.5 w-44" style={{top:pos.top,left:pos.left}}>
            {ALL_ST.map(s=><button key={s} onClick={()=>pick(s)} className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5 transition-colors">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s==='scheduled'?'bg-blue-400':s==='cancelled'?'bg-red-400':s==='rescheduled'?'bg-yellow-400':'bg-green-400'}`}/>
              <span className={s===appointment.status?'text-primary font-medium':'text-text-muted'}>{STATUS_LABEL[s]}</span>
              {s===appointment.status&&<Check size={11} className="text-primary ml-auto"/>}
            </button>)}
          </div>
        </>,document.body
      )}
    </>
  );
};

// ── AppointmentDrawer ──────────────────────────────────────────────────────────
interface DRProps { appointment:Appointment|null; companyId:string; onClose:()=>void; onReschedule:(a:Appointment)=>void; onCancel:(a:Appointment)=>void; onChanged:(id:string,s:AppointmentStatus)=>void; setToast:(t:ToastState)=>void; }
const AppointmentDrawer:React.FC<DRProps>=({appointment,companyId,onClose,onReschedule,onCancel,onChanged,setToast})=>{
  const bg=appointment?.contact?.full_name?avatarBg(appointment.contact.full_name):'bg-stone-600';
  return(<>
    {appointment&&<div className="fixed inset-0 z-[70] bg-black/40" onClick={onClose}/>}
    <div className={`fixed right-0 top-0 h-full w-80 bg-surface border-l border-border z-[71] flex flex-col shadow-2xl transition-transform duration-300 ${appointment?'translate-x-0':'translate-x-full'}`}>
      {appointment&&<>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <span className="text-sm font-semibold text-primary">Detalhes do Agendamento</span>
          <button onClick={onClose} className="text-stone-400 hover:text-primary"><X size={18}/></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 ${bg} rounded-full flex items-center justify-center text-white font-semibold`}>{(appointment.contact?.full_name?.[0]??'?').toUpperCase()}</div>
            <div><p className="text-sm font-semibold text-primary">{appointment.contact?.full_name??'—'}</p><p className="text-xs text-text-muted">Contato</p></div>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex gap-2"><Tag size={13} className="text-stone-500 shrink-0 mt-0.5"/><div><span className="text-text-muted">Serviço</span><p className="text-primary font-medium">{appointment.service_type?.name??'—'} · {appointment.service_type?.duration_minutes} min</p></div></div>
            <div className="flex gap-2"><Clock size={13} className="text-stone-500 shrink-0 mt-0.5"/><div><span className="text-text-muted">Data e Hora</span><p className="text-primary font-medium">{fmtDT(appointment.scheduled_at)}</p></div></div>
          </div>
          <div><p className="text-xs text-text-muted mb-1.5">Status</p>
            <StatusBadge appointment={appointment} companyId={companyId} onCancel={()=>onCancel(appointment)} onReschedule={()=>onReschedule(appointment)} onChanged={s=>onChanged(appointment.id,s)} setToast={setToast}/>
          </div>
          {appointment.notes&&<div><p className="text-xs text-text-muted mb-1">Observações</p><p className="text-xs text-primary bg-surface-hover p-2.5 rounded-lg">{appointment.notes}</p></div>}
          {appointment.cancellation_reason&&<div><p className="text-xs text-text-muted mb-1">Motivo do Cancelamento</p><p className="text-xs text-red-400 bg-red-500/10 p-2.5 rounded-lg">{appointment.cancellation_reason}</p></div>}
        </div>
        {appointment.status==='scheduled'&&<div className="p-5 border-t border-border space-y-2 shrink-0">
          <button onClick={()=>onReschedule(appointment)} className="w-full px-3 py-2 text-sm border border-border rounded-md text-text-muted hover:text-primary hover:border-primary/30 transition-colors">Remarcar</button>
          <button onClick={()=>onCancel(appointment)} className="w-full px-3 py-2 text-sm border border-red-500/30 rounded-md text-red-400 hover:bg-red-500/10 transition-colors">Cancelar Agendamento</button>
        </div>}
      </>}
    </div>
  </>);
};

// ── WeekView ───────────────────────────────────────────────────────────────────
const WeekView:React.FC<{appointments:Appointment[];weekStart:Date;onApptClick:(a:Appointment)=>void;onEmptyDayClick:(d:Date)=>void}>=({appointments,weekStart,onApptClick,onEmptyDayClick})=>{
  const days=getWeekDates(weekStart);
  const hours=Array.from({length:DAY_E-DAY_S+1},(_,i)=>DAY_S+i);
  return(
    <div className="flex overflow-x-auto" style={{minHeight:GRID_H+40}}>
      {/* hour labels */}
      <div className="w-12 shrink-0 relative" style={{height:GRID_H+8,marginTop:40}}>
        {hours.map(h=><div key={h} className="absolute left-0 text-[10px] text-stone-600 leading-none" style={{top:(h-DAY_S)*(GRID_H/(DAY_E-DAY_S))-6}}>{h.toString().padStart(2,'0')}:00</div>)}
      </div>
      {/* day columns */}
      {days.map(day=>{
        const dayAppts=appointments.filter(a=>isSameDay(new Date(a.scheduled_at),day));
        const today=isToday(day);
        return(
          <div key={day.toISOString()} className="flex-1 min-w-[100px] border-l border-border/40">
            {/* header */}
            <div className={`h-10 flex flex-col items-center justify-center text-xs border-b border-border/40 ${today?'bg-blue-500/10':''}`}>
              <span className="text-text-muted">{WEEK_SHORT[day.getDay()]}</span>
              <span className={`font-semibold ${today?'text-blue-400':'text-primary'}`}>{day.getDate()}</span>
            </div>
            {/* events */}
            <div className="relative" style={{height:GRID_H}} onClick={()=>dayAppts.length===0&&onEmptyDayClick(day)}>
              {/* hour lines */}
              {hours.map(h=><div key={h} className="absolute left-0 right-0 border-t border-border/20" style={{top:(h-DAY_S)*(GRID_H/(DAY_E-DAY_S))}}/>)}
              {dayAppts.map(a=>(
                <button key={a.id} onClick={e=>{e.stopPropagation();onApptClick(a);}}
                  className={`absolute left-1 right-1 rounded text-[10px] text-left px-1.5 py-1 overflow-hidden border-l-2 ${a.status==='scheduled'?'bg-blue-500/15 border-blue-400':a.status==='completed'?'bg-green-500/15 border-green-400':a.status==='cancelled'?'bg-red-500/15 border-red-400':'bg-yellow-500/15 border-yellow-400'}`}
                  style={{top:topPx(a.scheduled_at),height:hPx(a.scheduled_at,a.ends_at)}}>
                  <p className="font-medium text-primary truncate">{fmtTime(a.scheduled_at)}</p>
                  <p className="text-text-muted truncate">{a.contact?.full_name}</p>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── MonthView ──────────────────────────────────────────────────────────────────
const MonthView:React.FC<{appointments:Appointment[];monthDate:Date;onApptClick:(a:Appointment)=>void;onEmptyDayClick:(d:Date)=>void}>=({appointments,monthDate,onApptClick,onEmptyDayClick})=>{
  const [expandDay,setExpandDay]=useState<string|null>(null);
  const grid=getMonthGrid(monthDate.getFullYear(),monthDate.getMonth());
  return(
    <div>
      <div className="grid grid-cols-7 mb-1">
        {WEEK_SHORT.map(d=><div key={d} className="text-center text-[10px] font-medium text-text-muted py-2">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-px bg-border">
        {grid.map((day,i)=>{
          if(!day)return<div key={i} className="bg-background min-h-[100px] opacity-30"/>;
          const key=day.toDateString();
          const da=appointments.filter(a=>isSameDay(new Date(a.scheduled_at),day));
          const shown=da.slice(0,3); const extra=da.length-3;
          const today=isToday(day);
          return(
            <div key={i} className={`bg-background min-h-[100px] p-1.5 cursor-pointer hover:bg-surface-hover transition-colors ${today?'ring-1 ring-inset ring-blue-500/30':''}`} onClick={()=>{if(da.length===0)onEmptyDayClick(day);}}>
              <p className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${today?'bg-blue-500 text-white':'text-text-muted'}`}>{day.getDate()}</p>
              {shown.map(a=><button key={a.id} onClick={e=>{e.stopPropagation();onApptClick(a);}} className={`w-full text-[10px] text-left px-1.5 py-0.5 rounded mb-0.5 truncate font-medium ${a.status==='scheduled'?'bg-blue-500/20 text-blue-300':a.status==='completed'?'bg-green-500/20 text-green-300':a.status==='cancelled'?'bg-red-500/20 text-red-300':'bg-yellow-500/20 text-yellow-300'}`}>{fmtTime(a.scheduled_at)} {a.contact?.full_name}</button>)}
              {extra>0&&<button onClick={e=>{e.stopPropagation();setExpandDay(expandDay===key?null:key);}} className="text-[10px] text-text-muted hover:text-primary">+{extra} mais</button>}
              {expandDay===key&&da.slice(3).map(a=><button key={a.id} onClick={e=>{e.stopPropagation();onApptClick(a);}} className={`w-full text-[10px] text-left px-1.5 py-0.5 rounded mb-0.5 truncate font-medium ${a.status==='scheduled'?'bg-blue-500/20 text-blue-300':a.status==='completed'?'bg-green-500/20 text-green-300':a.status==='cancelled'?'bg-red-500/20 text-red-300':'bg-yellow-500/20 text-yellow-300'}`}>{fmtTime(a.scheduled_at)} {a.contact?.full_name}</button>)}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── AgendaPage ─────────────────────────────────────────────────────────────────
type FilterStatus = AppointmentStatus | 'all';

export const AgendaPage:React.FC=()=>{
  const {currentCompany}=useTenant();const navigate=useNavigate();
  const [view,setView]=useState<ViewMode>('list');
  const [weekStart,setWeekStart]=useState<Date>(()=>getWeekStart(new Date()));
  const [monthDate,setMonthDate]=useState<Date>(()=>new Date(new Date().getFullYear(),new Date().getMonth(),1));
  const [appts,setAppts]=useState<Appointment[]>([]);
  const [calAppts,setCalAppts]=useState<Appointment[]>([]);
  const [svcTypes,setSvcTypes]=useState<ServiceType[]>([]);
  const [loading,setLoading]=useState(true);
  const [statusFilter,setStatusFilter]=useState<FilterStatus>('all');
  const [dateFilter,setDateFilter]=useState('');
  const [showNew,setShowNew]=useState(false);
  const [reTarget,setReTarget]=useState<Appointment|null>(null); // reschedule
  const [caTarget,setCaTarget]=useState<Appointment|null>(null); // cancel
  const [reagenda,setReagenda]=useState<Appointment|null>(null); // re-schedule non-scheduled
  const [drawer,setDrawer]=useState<Appointment|null>(null);
  const [toast,setToast]=useState<ToastState|null>(null);
  const [newDate,setNewDate]=useState(''); // pre-fill date for calendar click

  const fetchList=useCallback(async()=>{
    if(!currentCompany)return;setLoading(true);
    let q=supabase.from('appointments').select('*,contact:contact_id(full_name),service_type:service_type_id(name,duration_minutes)').eq('company_id',currentCompany.id).order('scheduled_at',{ascending:false});
    if(statusFilter!=='all')q=q.eq('status',statusFilter);
    if(dateFilter){const s=new Date(dateFilter);s.setHours(0,0,0,0);const e=new Date(dateFilter);e.setHours(23,59,59,999);q=q.gte('scheduled_at',s.toISOString()).lte('scheduled_at',e.toISOString());}
    const{data}=await q;setAppts((data as Appointment[])??[]);setLoading(false);
  },[currentCompany,statusFilter,dateFilter]);

  const fetchCal=useCallback(async(start:Date,end:Date)=>{
    if(!currentCompany)return;
    const{data}=await supabase.from('appointments').select('*,contact:contact_id(full_name),service_type:service_type_id(name,duration_minutes)').eq('company_id',currentCompany.id).gte('scheduled_at',start.toISOString()).lte('scheduled_at',end.toISOString()).order('scheduled_at');
    setCalAppts((data as Appointment[])??[]);
  },[currentCompany]);

  const fetchSvc=useCallback(async()=>{
    if(!currentCompany)return;
    const{data}=await supabase.from('service_types').select('id,name,duration_minutes').eq('company_id',currentCompany.id).eq('is_active',true).order('name');
    setSvcTypes((data as ServiceType[])??[]);
  },[currentCompany]);

  useEffect(()=>{if(view==='list')fetchList();},[view,fetchList]);
  useEffect(()=>{
    if(view==='week'){const e=new Date(weekStart);e.setDate(e.getDate()+6);e.setHours(23,59,59);fetchCal(weekStart,e);}
    if(view==='month'){const s=new Date(monthDate.getFullYear(),monthDate.getMonth(),1);const e=new Date(monthDate.getFullYear(),monthDate.getMonth()+1,0);e.setHours(23,59,59);fetchCal(s,e);}
  },[view,weekStart,monthDate,fetchCal]);
  useEffect(()=>{fetchSvc();},[fetchSvc]);

  const refresh=()=>{if(view==='list')fetchList();else{const e=view==='week'?new Date(weekStart):new Date(monthDate.getFullYear(),monthDate.getMonth()+1,0);fetchCal(view==='week'?weekStart:new Date(monthDate.getFullYear(),monthDate.getMonth(),1),e);}};
  const ok=(msg:string)=>{setToast({message:msg,type:'success'});refresh();};
  const patchOptimistic=(id:string,s:AppointmentStatus)=>{setAppts(p=>p.map(a=>a.id===id?{...a,status:s}:a));setCalAppts(p=>p.map(a=>a.id===id?{...a,status:s}:a));if(drawer?.id===id)setDrawer(p=>p?{...p,status:s}:p);};

  const filterTabs:FilterStatus[]=['all','scheduled','cancelled','rescheduled','completed'];
  const tabLabel:Record<FilterStatus,string>={all:'Todos',...STATUS_LABEL};
  const tabDot:Record<FilterStatus,string>={all:'',scheduled:'bg-blue-400',cancelled:'bg-red-400',rescheduled:'bg-yellow-400',completed:'bg-green-400'};

  const prevWeek=()=>{const d=new Date(weekStart);d.setDate(d.getDate()-7);setWeekStart(d);};
  const nextWeek=()=>{const d=new Date(weekStart);d.setDate(d.getDate()+7);setWeekStart(d);};
  const prevMonth=()=>setMonthDate(new Date(monthDate.getFullYear(),monthDate.getMonth()-1,1));
  const nextMonth=()=>setMonthDate(new Date(monthDate.getFullYear(),monthDate.getMonth()+1,1));

  return(
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-8 py-5 border-b border-border flex items-center justify-between shrink-0">
        <div><h1 className="text-xl font-semibold text-primary">Agenda</h1><p className="text-sm text-text-muted mt-0.5">Gerencie os agendamentos da sua empresa</p></div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex p-0.5 bg-stone-900 border border-stone-800 rounded-lg">
            {([['list','Lista',ListIcon],['week','Semana',CalendarDays],['month','Mês',CalendarDays]] as [ViewMode,string,React.ElementType][]).map(([v,label,Icon])=>(
              <button key={v} onClick={()=>setView(v)} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${view===v?'bg-white text-stone-900 shadow-sm':'text-stone-400 hover:text-stone-200'}`}><Icon size={13}/>{label}</button>
            ))}
          </div>
          <button onClick={()=>navigate('/agenda/configuracoes')} className="flex items-center gap-1.5 px-3 py-2 text-sm text-text-muted border border-border rounded-md hover:text-primary hover:border-primary/30 transition-colors"><Settings size={15}/>Config</button>
          <button onClick={()=>{setNewDate('');setShowNew(true);}} className="flex items-center gap-2 px-4 py-2 bg-primary text-background text-sm font-medium rounded-md hover:bg-primary/90 transition-colors"><Plus size={16}/>Novo Agendamento</button>
        </div>
      </div>

      {/* List filters (only for list view) */}
      {view==='list'&&<div className="px-8 py-3 border-b border-border flex items-center gap-4 shrink-0 flex-wrap bg-surface/40">
        <div className="flex items-center gap-1 p-1 bg-stone-900 border border-stone-800 rounded-lg flex-wrap">
          {filterTabs.map(s=><button key={s} onClick={()=>setStatusFilter(s)} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap ${statusFilter===s?'bg-white text-stone-900 shadow-sm':'text-stone-400 hover:text-stone-200 hover:bg-stone-800'}`}>{s!=='all'&&<span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tabDot[s]}`}/>}{tabLabel[s]}</button>)}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <input type="date" value={dateFilter} onChange={e=>setDateFilter(e.target.value)} className="bg-stone-900 border border-stone-700 text-sm text-stone-200 rounded-md px-3 py-1.5 outline-none focus:border-stone-500"/>
          {dateFilter&&<button onClick={()=>setDateFilter('')} className="text-stone-500 hover:text-primary"><X size={14}/></button>}
        </div>
      </div>}

      {/* Calendar nav (week/month) */}
      {view!=='list'&&<div className="px-8 py-3 border-b border-border flex items-center gap-3 shrink-0 bg-surface/40">
        <button onClick={view==='week'?prevWeek:prevMonth} className="p-1.5 hover:bg-surface-hover rounded-md text-text-muted hover:text-primary transition-colors"><ChevronLeft size={16}/></button>
        <span className="text-sm font-medium text-primary min-w-[200px] text-center">
          {view==='week'?fmtWeekRange(weekStart)||`Semana de ${weekStart.getDate()}/${String(weekStart.getMonth()+1).padStart(2,'0')}/${weekStart.getFullYear()}`:`${MONTHS_PT[monthDate.getMonth()]} ${monthDate.getFullYear()}`}
        </span>
        <button onClick={view==='week'?nextWeek:nextMonth} className="p-1.5 hover:bg-surface-hover rounded-md text-text-muted hover:text-primary transition-colors"><ChevronRight size={16}/></button>
        <button onClick={()=>{if(view==='week')setWeekStart(getWeekStart(new Date()));else setMonthDate(new Date(new Date().getFullYear(),new Date().getMonth(),1));}} className="ml-2 px-3 py-1 text-xs border border-border rounded-md text-text-muted hover:text-primary hover:border-primary/30 transition-colors">Hoje</button>
      </div>}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {view==='list'&&(
          loading?(
            <div className="space-y-3">{[1,2,3,4,5].map(i=><div key={i} className="h-14 bg-surface rounded-lg animate-pulse"/>)}</div>
          ):appts.length===0?(
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <CalendarDays size={40} className="text-stone-700 mb-4"/>
              <p className="text-primary font-medium">Nenhum agendamento encontrado</p>
              <p className="text-sm text-text-muted mt-1 mb-4">{statusFilter!=='all'?`Nenhum agendamento com status "${tabLabel[statusFilter]}"`:dateFilter?'Nenhum agendamento nesta data':'Crie o primeiro agendamento'}</p>
              <button onClick={()=>setShowNew(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-background text-sm font-medium rounded-md hover:bg-primary/90"><Plus size={15}/>Novo Agendamento</button>
            </div>
          ):(
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border">{['Data/Hora','Contato','Serviço','Duração','Status','Ações'].map(h=><th key={h} className="text-left pb-3 pr-4 text-xs font-medium text-text-muted uppercase tracking-wider">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-border">
                  {appts.map(a=>(
                    <tr key={a.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3.5 pr-4">
                        <p className="text-xs font-medium text-primary">{fmtDate(a.scheduled_at)}</p>
                        <p className="text-xs text-stone-500">{fmtTime(a.scheduled_at)}</p>
                      </td>
                      <td className="py-3.5 pr-4">
                        <div className="flex items-center gap-2"><Av name={a.contact?.full_name??'?'}/><span className="text-xs text-text-muted">{a.contact?.full_name??'—'}</span></div>
                      </td>
                      <td className="py-3.5 pr-4"><div className="flex items-center gap-1.5 text-xs text-text-muted"><Tag size={11} className="text-stone-500 shrink-0"/>{a.service_type?.name??'—'}</div></td>
                      <td className="py-3.5 pr-4"><div className="flex items-center gap-1 text-xs text-text-muted"><Clock size={11} className="text-stone-500"/>{a.service_type?.duration_minutes??'—'} min</div></td>
                      <td className="py-3.5 pr-4">
                        <StatusBadge appointment={a} companyId={currentCompany!.id} onCancel={()=>setCaTarget(a)} onReschedule={()=>setReTarget(a)} onChanged={s=>patchOptimistic(a.id,s)} setToast={setToast}/>
                      </td>
                      <td className="py-3.5">
                        <ActionsMenu appointment={a} companyId={currentCompany!.id} onReschedule={()=>setReTarget(a)} onCancel={()=>setCaTarget(a)} onReagenda={()=>setReagenda(a)} onComplete={async()=>{const{data}=await supabase.rpc('rpc_update_appointment_status',{p_company_id:currentCompany!.id,p_appointment_id:a.id,p_new_status:'completed',p_reason:null});const r=data as{success:boolean}|null;if(r?.success){patchOptimistic(a.id,'completed');setToast({message:'Marcado como concluído.',type:'success'});}}}/>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
        {view==='week'&&<WeekView appointments={calAppts} weekStart={weekStart} onApptClick={setDrawer} onEmptyDayClick={d=>{setNewDate(d.toISOString().split('T')[0]);setShowNew(true);}}/>}
        {view==='month'&&<MonthView appointments={calAppts} monthDate={monthDate} onApptClick={setDrawer} onEmptyDayClick={d=>{setNewDate(d.toISOString().split('T')[0]);setShowNew(true);}}/>}
      </div>

      {/* Modals */}
      {showNew&&currentCompany&&<NewAppointmentModal companyId={currentCompany.id} serviceTypes={svcTypes} onClose={()=>setShowNew(false)} onCreated={()=>ok('Agendamento criado com sucesso!')} initialDate={newDate}/>}
      {reTarget&&currentCompany&&<RescheduleModal companyId={currentCompany.id} appointment={reTarget} onClose={()=>setReTarget(null)} onDone={()=>ok('Agendamento remarcado!')}/>}
      {caTarget&&currentCompany&&<CancelModal companyId={currentCompany.id} appointment={caTarget} onClose={()=>setCaTarget(null)} onDone={()=>ok('Agendamento cancelado.')}/>}
      {reagenda&&currentCompany&&<NewAppointmentModal companyId={currentCompany.id} serviceTypes={svcTypes} onClose={()=>setReagenda(null)} onCreated={()=>ok('Novo agendamento criado!')} initialContact={reagenda.contact?{id:reagenda.contact_id,full_name:reagenda.contact.full_name}:null} initialServiceTypeId={reagenda.service_type_id}/>}
      {/* Drawer */}
      {currentCompany&&<AppointmentDrawer appointment={drawer} companyId={currentCompany.id} onClose={()=>setDrawer(null)} onReschedule={a=>{setDrawer(null);setReTarget(a);}} onCancel={a=>{setDrawer(null);setCaTarget(a);}} onChanged={patchOptimistic} setToast={setToast}/>}
      {toast&&<Toast {...toast} onDone={()=>setToast(null)}/>}
    </div>
  );
};
