import React, { useState, useEffect, useCallback } from 'react';
import { Send, FileText, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import type { Note } from '../../types';

interface NotesListProps {
  contactId?: string;
  conversationId?: string;
  dealId?: string;
}

export const NotesList: React.FC<NotesListProps> = ({ contactId, conversationId, dealId }) => {
  const { currentCompany } = useTenant();
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchNotes = useCallback(async () => {
    if (!currentCompany) return;
    setLoading(true);

    let query = supabase
      .from('notes')
      .select('*, author:author_id(full_name)')
      .eq('company_id', currentCompany.id)
      .order('created_at', { ascending: false });

    if (conversationId) query = query.eq('conversation_id', conversationId);
    else if (contactId) query = query.eq('contact_id', contactId);
    else if (dealId) query = query.eq('deal_id', dealId);

    const { data } = await query;
    if (data) {
      setNotes(
        data.map((n) => ({
          id: n.id,
          company_id: n.company_id,
          author_id: n.author_id,
          author_name: (n.author as any)?.full_name || 'Usuário',
          body: n.body,
          contact_id: n.contact_id,
          conversation_id: n.conversation_id,
          deal_id: n.deal_id,
          created_at: n.created_at,
        }))
      );
    }
    setLoading(false);
  }, [currentCompany, contactId, conversationId, dealId]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const handleAddNote = async () => {
    if (!body.trim() || !user || !currentCompany) return;
    setSaving(true);

    const { error } = await supabase.from('notes').insert({
      company_id: currentCompany.id,
      author_id: user.id,
      body: body.trim(),
      contact_id: contactId || null,
      conversation_id: conversationId || null,
      deal_id: dealId || null,
    });

    if (!error) {
      setBody('');
      fetchNotes();
    }
    setSaving(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleAddNote();
    }
  };

  const formatTime = (iso: string) => {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'agora';
    if (diffMins < 60) return `${diffMins}min`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h`;
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  };

  return (
    <div>
      {/* Notes list */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-14 bg-background rounded-lg animate-pulse" />
          ))}
        </div>
      ) : notes.length === 0 ? (
        <div className="text-center py-4">
          <FileText size={18} className="text-stone-600 mx-auto mb-2" />
          <p className="text-xs text-text-muted">Sem notas ainda</p>
        </div>
      ) : (
        <div className="space-y-2 mb-3">
          {notes.map((note) => (
            <div
              key={note.id}
              className="bg-background rounded-lg p-3 border border-border"
            >
              <p className="text-xs text-primary leading-relaxed whitespace-pre-wrap">
                {note.body}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[10px] font-medium text-text-muted">
                  {note.author_name.split(' ')[0]}
                </span>
                <span className="text-[10px] text-stone-600">·</span>
                <span className="text-[10px] text-stone-600 font-mono">
                  {formatTime(note.created_at)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Composer */}
      <div className="mt-3">
        <div className="relative">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Adicionar nota..."
            rows={2}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-primary placeholder-stone-600 outline-none focus:border-primary/40 resize-none pr-10 transition-colors"
          />
          <button
            onClick={handleAddNote}
            disabled={!body.trim() || saving}
            className="absolute right-2 bottom-2 p-1.5 text-stone-500 hover:text-primary disabled:opacity-30 transition-colors"
            title="Salvar nota"
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
          </button>
        </div>
        <p className="text-[10px] text-stone-600 mt-1">⌘ + Enter para salvar</p>
      </div>
    </div>
  );
};
