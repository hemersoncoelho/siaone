import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Save, X, Loader2, AlertCircle,
  Pencil, ToggleLeft, ToggleRight, Wrench,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTenant } from '../contexts/TenantContext';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ScheduleRow {
  weekday: number;
  opens_at: string;
  closes_at: string;
  is_active: boolean;
}

interface ServiceType {
  id: string;
  name: string;
  duration_minutes: number;
  description?: string | null;
  is_active: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const WEEKDAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const DEFAULT_SCHEDULES: ScheduleRow[] = WEEKDAY_NAMES.map((_, i) => ({
  weekday: i,
  opens_at: '08:00',
  closes_at: '18:00',
  is_active: i >= 1 && i <= 5, // Mon–Fri active by default
}));

// ── Toast ──────────────────────────────────────────────────────────────────────

interface ToastState { message: string; type: 'success' | 'error' }

const Toast: React.FC<ToastState & { onDone: () => void }> = ({ message, type, onDone }) => {
  useEffect(() => { const t = setTimeout(onDone, 3500); return () => clearTimeout(t); }, [onDone]);
  return (
    <div className={`fixed bottom-6 right-6 z-[200] flex items-center gap-2.5 px-4 py-3 rounded-lg shadow-2xl border text-sm font-medium ${
      type === 'success'
        ? 'bg-emerald-950 border-emerald-700/50 text-emerald-300'
        : 'bg-red-950 border-red-700/50 text-red-300'
    }`}>
      {type === 'error' && <AlertCircle size={15} />}
      {message}
    </div>
  );
};

// ── Modal base ─────────────────────────────────────────────────────────────────

const ModalBase: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({
  title, onClose, children,
}) => (
  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div className="bg-surface border border-border rounded-xl w-full max-w-md shadow-2xl">
      <div className="flex items-center justify-between px-6 py-5 border-b border-border">
        <h2 className="text-base font-semibold text-primary">{title}</h2>
        <button onClick={onClose} className="text-stone-400 hover:text-primary transition-colors">
          <X size={20} />
        </button>
      </div>
      {children}
    </div>
  </div>
);

// ── Service Type Modal ─────────────────────────────────────────────────────────

interface ServiceTypeModalProps {
  companyId: string;
  service?: ServiceType | null;
  onClose: () => void;
  onSaved: () => void;
}

const ServiceTypeModal: React.FC<ServiceTypeModalProps> = ({ companyId, service, onClose, onSaved }) => {
  const isEdit = !!service;
  const [name, setName] = useState(service?.name ?? '');
  const [duration, setDuration] = useState(service?.duration_minutes?.toString() ?? '');
  const [description, setDescription] = useState(service?.description ?? '');
  const [isActive, setIsActive] = useState(service?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!name.trim()) { setError('O nome é obrigatório.'); return; }
    const dur = parseInt(duration);
    if (!dur || dur < 15) { setError('A duração mínima é de 15 minutos.'); return; }

    setSaving(true); setError('');

    if (isEdit && service) {
      const { error: err } = await supabase
        .from('service_types')
        .update({
          name: name.trim(),
          duration_minutes: dur,
          description: description.trim() || null,
          is_active: isActive,
        })
        .eq('id', service.id)
        .eq('company_id', companyId);
      if (err) { setError('Erro ao atualizar serviço.'); setSaving(false); return; }
    } else {
      const { error: err } = await supabase
        .from('service_types')
        .insert({
          company_id: companyId,
          name: name.trim(),
          duration_minutes: dur,
          description: description.trim() || null,
          is_active: isActive,
        });
      if (err) { setError('Erro ao criar serviço.'); setSaving(false); return; }
    }

    onSaved();
    onClose();
    setSaving(false);
  };

  return (
    <ModalBase title={isEdit ? 'Editar Serviço' : 'Novo Serviço'} onClose={onClose}>
      <div className="px-6 py-5 space-y-4">
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1.5 uppercase tracking-wider">Nome *</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ex: Consulta Inicial"
            autoFocus
            className="w-full bg-background border border-border rounded-md px-3 py-2.5 text-sm text-primary placeholder-stone-600 outline-none focus:border-primary/40 transition-colors"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1.5 uppercase tracking-wider">Duração (minutos) *</label>
          <input
            type="number"
            value={duration}
            onChange={e => setDuration(e.target.value)}
            min={15}
            step={15}
            placeholder="60"
            className="w-full bg-background border border-border rounded-md px-3 py-2.5 text-sm text-primary placeholder-stone-600 outline-none focus:border-primary/40 transition-colors"
          />
          <p className="text-xs text-stone-600 mt-1">Mínimo: 15 minutos</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-text-muted mb-1.5 uppercase tracking-wider">Descrição</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            placeholder="Descrição opcional..."
            className="w-full bg-background border border-border rounded-md px-3 py-2.5 text-sm text-primary placeholder-stone-600 outline-none focus:border-primary/40 transition-colors resize-none"
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Serviço Ativo</span>
          <button type="button" onClick={() => setIsActive(v => !v)} className="transition-colors">
            {isActive
              ? <ToggleRight size={26} className="text-emerald-400" />
              : <ToggleLeft size={26} className="text-stone-600" />
            }
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-md">
            <AlertCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}
      </div>
      <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
        <button onClick={onClose} className="px-4 py-2 text-sm text-text-muted hover:text-primary transition-colors">Cancelar</button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-background text-sm font-medium rounded-md hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          {isEdit ? 'Salvar Alterações' : 'Criar Serviço'}
        </button>
      </div>
    </ModalBase>
  );
};

// ── Main Page ──────────────────────────────────────────────────────────────────

export const AgendaSettings: React.FC = () => {
  const { currentCompany } = useTenant();
  const navigate = useNavigate();

  // ── Schedules ──
  const [schedules, setSchedules] = useState<ScheduleRow[]>(DEFAULT_SCHEDULES);
  const [schedulesLoading, setSchedulesLoading] = useState(true);
  const [schedulesSaving, setSchedulesSaving] = useState(false);

  // ── Service types ──
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [stLoading, setStLoading] = useState(true);
  const [editService, setEditService] = useState<ServiceType | null | undefined>(undefined);
  // undefined = modal closed, null = new, ServiceType = edit

  const [toast, setToast] = useState<ToastState | null>(null);

  // ── Fetch schedules ──
  const fetchSchedules = useCallback(async () => {
    if (!currentCompany) return;
    setSchedulesLoading(true);
    const { data } = await supabase
      .from('schedules')
      .select('weekday, opens_at, closes_at, is_active')
      .eq('company_id', currentCompany.id);

    if (data && data.length > 0) {
      // Merge with defaults so all 7 days are always shown
      const merged = DEFAULT_SCHEDULES.map(def => {
        const found = (data as ScheduleRow[]).find(d => d.weekday === def.weekday);
        return found ? {
          weekday: found.weekday,
          opens_at: found.opens_at.slice(0, 5), // strip seconds
          closes_at: found.closes_at.slice(0, 5),
          is_active: found.is_active,
        } : def;
      });
      setSchedules(merged);
    }
    setSchedulesLoading(false);
  }, [currentCompany]);

  // ── Fetch service types ──
  const fetchServiceTypes = useCallback(async () => {
    if (!currentCompany) return;
    setStLoading(true);
    const { data } = await supabase
      .from('service_types')
      .select('id, name, duration_minutes, description, is_active')
      .eq('company_id', currentCompany.id)
      .order('name');
    setServiceTypes((data as ServiceType[]) ?? []);
    setStLoading(false);
  }, [currentCompany]);

  useEffect(() => { fetchSchedules(); }, [fetchSchedules]);
  useEffect(() => { fetchServiceTypes(); }, [fetchServiceTypes]);

  // ── Save schedules (upsert) ──
  const handleSaveSchedules = async () => {
    if (!currentCompany) return;
    setSchedulesSaving(true);
    const rows = schedules.map(s => ({
      company_id: currentCompany.id,
      weekday: s.weekday,
      opens_at: s.opens_at,
      closes_at: s.closes_at,
      is_active: s.is_active,
    }));

    const { error } = await supabase
      .from('schedules')
      .upsert(rows, { onConflict: 'company_id,weekday' });

    if (error) {
      setToast({ message: 'Erro ao salvar horários. Verifique os campos e tente novamente.', type: 'error' });
    } else {
      setToast({ message: 'Horários salvos com sucesso!', type: 'success' });
    }
    setSchedulesSaving(false);
  };

  const updateSchedule = (weekday: number, field: keyof ScheduleRow, value: string | boolean) => {
    setSchedules(prev => prev.map(s => s.weekday === weekday ? { ...s, [field]: value } : s));
  };

  // ── Toggle service active ──
  const handleToggleService = async (s: ServiceType) => {
    await supabase
      .from('service_types')
      .update({ is_active: !s.is_active })
      .eq('id', s.id)
      .eq('company_id', currentCompany!.id);
    fetchServiceTypes();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-8 py-6 border-b border-border flex items-center gap-4 shrink-0">
        <button
          onClick={() => navigate('/agenda')}
          className="text-stone-400 hover:text-primary transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-primary">Configurações da Agenda</h1>
          <p className="text-sm text-text-muted mt-0.5">Horários de funcionamento e tipos de serviço</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6 max-w-3xl">

        {/* ── Card: Horário de Funcionamento ── */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-primary">Horário de Funcionamento</h2>
              <p className="text-xs text-text-muted mt-0.5">Configure os dias e horários de atendimento</p>
            </div>
          </div>

          {schedulesLoading ? (
            <div className="p-6 space-y-3">
              {[1,2,3,4,5,6,7].map(i => <div key={i} className="h-10 bg-background rounded animate-pulse" />)}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {schedules.map(s => (
                <div key={s.weekday} className={`flex items-center gap-4 px-6 py-3.5 transition-colors ${!s.is_active ? 'opacity-50' : ''}`}>
                  {/* Toggle */}
                  <button
                    type="button"
                    onClick={() => updateSchedule(s.weekday, 'is_active', !s.is_active)}
                    className="shrink-0 transition-colors"
                  >
                    {s.is_active
                      ? <ToggleRight size={22} className="text-emerald-400" />
                      : <ToggleLeft size={22} className="text-stone-600" />
                    }
                  </button>

                  {/* Day name */}
                  <span className="w-20 text-sm font-medium text-primary shrink-0">{WEEKDAY_NAMES[s.weekday]}</span>

                  {/* Time inputs */}
                  {s.is_active ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="time"
                        value={s.opens_at}
                        onChange={e => updateSchedule(s.weekday, 'opens_at', e.target.value)}
                        className="bg-background border border-border rounded-md px-3 py-1.5 text-sm text-primary outline-none focus:border-primary/40 transition-colors"
                      />
                      <span className="text-text-muted text-xs">até</span>
                      <input
                        type="time"
                        value={s.closes_at}
                        onChange={e => updateSchedule(s.weekday, 'closes_at', e.target.value)}
                        className="bg-background border border-border rounded-md px-3 py-1.5 text-sm text-primary outline-none focus:border-primary/40 transition-colors"
                      />
                    </div>
                  ) : (
                    <span className="text-xs text-stone-600">Fechado</span>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="px-6 py-4 border-t border-border flex justify-end">
            <button
              onClick={handleSaveSchedules}
              disabled={schedulesLoading || schedulesSaving}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-background text-sm font-medium rounded-md hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {schedulesSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Salvar Horários
            </button>
          </div>
        </div>

        {/* ── Card: Tipos de Serviço ── */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-primary">Tipos de Serviço</h2>
              <p className="text-xs text-text-muted mt-0.5">Serviços e procedimentos oferecidos pela empresa</p>
            </div>
            <button
              onClick={() => setEditService(null)}
              className="flex items-center gap-2 px-3 py-1.5 bg-primary text-background text-xs font-medium rounded-md hover:bg-primary/90 transition-colors"
            >
              <Plus size={13} />
              Novo Serviço
            </button>
          </div>

          {stLoading ? (
            <div className="p-6 space-y-3">
              {[1,2,3].map(i => <div key={i} className="h-12 bg-background rounded animate-pulse" />)}
            </div>
          ) : serviceTypes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-6">
              <Wrench size={32} className="text-stone-700 mb-3" />
              <p className="text-primary font-medium text-sm">Nenhum serviço cadastrado</p>
              <p className="text-xs text-text-muted mt-1">Crie o primeiro tipo de serviço para começar a agendar</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {['Nome', 'Duração', 'Status', 'Ações'].map(h => (
                    <th key={h} className="text-left px-6 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {serviceTypes.map(s => (
                  <tr key={s.id} className="hover:bg-surface-hover transition-colors">
                    <td className="px-6 py-3.5">
                      <div>
                        <p className="text-sm text-primary font-medium">{s.name}</p>
                        {s.description && <p className="text-xs text-stone-500 mt-0.5">{s.description}</p>}
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-xs text-text-muted">{s.duration_minutes} min</td>
                    <td className="px-6 py-3.5">
                      <span className={`text-[10px] px-2 py-0.5 rounded border font-medium uppercase tracking-wide ${
                        s.is_active
                          ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'
                          : 'text-stone-500 bg-stone-500/10 border-stone-500/20'
                      }`}>
                        {s.is_active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setEditService(s)}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-text-muted border border-border rounded-md hover:text-primary hover:border-primary/30 transition-colors"
                        >
                          <Pencil size={11} />
                          Editar
                        </button>
                        <button
                          onClick={() => handleToggleService(s)}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs border rounded-md transition-colors ${
                            s.is_active
                              ? 'text-stone-500 border-border hover:text-red-400 hover:border-red-400/30'
                              : 'text-stone-500 border-border hover:text-emerald-400 hover:border-emerald-400/30'
                          }`}
                        >
                          {s.is_active ? <ToggleLeft size={11} /> : <ToggleRight size={11} />}
                          {s.is_active ? 'Desativar' : 'Ativar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Service modal */}
      {editService !== undefined && currentCompany && (
        <ServiceTypeModal
          companyId={currentCompany.id}
          service={editService}
          onClose={() => setEditService(undefined)}
          onSaved={() => {
            fetchServiceTypes();
            setToast({ message: editService ? 'Serviço atualizado!' : 'Serviço criado!', type: 'success' });
          }}
        />
      )}

      {toast && <Toast {...toast} onDone={() => setToast(null)} />}
    </div>
  );
};
