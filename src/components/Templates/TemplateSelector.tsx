import { useState } from 'react';
import { useStore } from '../../store/useStore';
import { TEMPLATES } from '../../data/templates';
import { FiTrash2, FiSave, FiCopy, FiChevronDown, FiRotateCcw } from 'react-icons/fi';
import type { VenueTemplate } from '../../types';
import { useTranslation, format } from '../../i18n';

type TFn = (key: string, en: string) => string;

const getCategories = (t: TFn): { value: VenueTemplate['category']; label: string }[] => [
  { value: 'sport', label: t('header.templates.category.sport', 'Sport') },
  { value: 'concert', label: t('header.templates.category.concert', 'Concert') },
  { value: 'church', label: t('header.templates.category.church', 'Church') },
  { value: 'conference', label: t('header.templates.category.conference', 'Conference') },
  { value: 'custom', label: t('header.templates.category.custom', 'Custom') },
];

export default function TemplateSelector() {
  const { t } = useTranslation();
  const CATEGORIES = getCategories(t);
  const {
    loadTemplate,
    customTemplates,
    hiddenTemplateIds,
    saveAsTemplate,
    deleteTemplate,
    updateTemplate,
    overwriteTemplate,
    restoreBuiltInTemplates,
  } = useStore();
  const [showSave, setShowSave] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<VenueTemplate['category']>('custom');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<VenueTemplate['category']>('custom');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Merge built-ins with custom templates. Custom shadows built-ins with the
  // same id (so an edited built-in shows the user's version). Hidden built-ins
  // (deleted by the user without ever being edited) drop out completely.
  const customIds = new Set(customTemplates.map((t) => t.id));
  const builtInVisible = TEMPLATES.filter(
    (t) => !hiddenTemplateIds.includes(t.id) && !customIds.has(t.id),
  );
  const allTemplates = [...builtInVisible, ...customTemplates];

  const isCustomEntry = (id: string) => customIds.has(id);
  const isBuiltInShadow = (id: string) => customIds.has(id) && TEMPLATES.some((t) => t.id === id);
  const isPureBuiltIn = (id: string) => !customIds.has(id) && TEMPLATES.some((t) => t.id === id);

  // Always show all configured categories so empty ones can still receive new
  // templates via the inline save form.
  const categories = CATEGORIES.map((c) => c.value).filter((cat) => allTemplates.some((t) => t.category === cat));
  const hiddenCount = hiddenTemplateIds.length;

  const handleSave = () => {
    if (!newName.trim()) return;
    saveAsTemplate(newName.trim(), newCategory);
    setNewName('');
    setShowSave(false);
  };

  const handleEdit = (t: VenueTemplate) => {
    setEditingId(t.id);
    setEditName(t.name);
    setEditCategory(t.category);
  };

  const handleEditSave = () => {
    if (!editingId || !editName.trim()) return;
    updateTemplate(editingId, { name: editName.trim(), category: editCategory });
    setEditingId(null);
  };

  const handleLoad = (id: string) => {
    if (confirm(t('header.templates.loadConfirm', 'Load this template? Current project will be replaced.'))) {
      loadTemplate(id);
    }
  };

  return (
    <div className="p-3 flex flex-col h-full overflow-y-auto">
      {/* Save current as template button */}
      <button
        onClick={() => setShowSave(!showSave)}
        className="bc-btn-soft w-full mb-3 py-2 text-sm transition-colors flex items-center gap-2 justify-center"
      >
        <FiSave size={14} />
        {t('header.templates.saveCurrent', 'Save current as template')}
      </button>

      {/* Save form */}
      {showSave && (
        <div className="rounded-bc-m mb-3 p-3 border border-bc-border bg-bc-panel-raised space-y-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t('header.templates.namePlaceholder', 'Template name…')}
            className="w-full px-2 py-1.5 text-sm bg-bc-panel border border-bc-border text-bc-text focus:border-bc-accent outline-none"
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            autoFocus
          />
          <div className="flex gap-2">
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as VenueTemplate['category'])}
              className="flex-1 px-2 py-1.5 text-sm bg-bc-panel border border-bc-border text-bc-text outline-none"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <button
              onClick={handleSave}
              disabled={!newName.trim()}
              className="rounded-bc-full px-3 py-1.5 text-sm bg-bc-accent text-bc-accent-text font-medium disabled:opacity-40 hover:bg-bc-accent/80"
            >
              {t('header.templates.save', 'Save')}
            </button>
            <button
              onClick={() => setShowSave(false)}
              className="px-3 py-1.5 text-sm border border-bc-border bg-bc-panel-raised text-bc-muted hover:text-bc-text"
            >
              {t('header.templates.cancel', 'Cancel')}
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-bc-text-bright">{t('header.templates.heading', 'Venue templates')}</h3>
        {hiddenCount > 0 && (
          <button
            onClick={() => {
              if (confirm(format(t('header.templates.restoreConfirm', 'Restore {count} hidden built-in template(s)?'), { count: hiddenCount }))) restoreBuiltInTemplates();
            }}
            className="flex items-center gap-1 px-2 py-1 text-[10px] text-bc-muted hover:text-bc-accent hover:bg-bc-accent/10"
            title={t('header.templates.restore.title', 'Bring back built-in templates you previously deleted')}
          >
            <FiRotateCcw size={11} /> {format(t('header.templates.restore', 'Restore {count} hidden'), { count: hiddenCount })}
          </button>
        )}
      </div>

      {categories.map((cat) => (
        <div key={cat} className="mb-3">
          <h4 className="text-xs font-semibold text-bc-muted mb-1">{CATEGORIES.find((c) => c.value === cat)?.label ?? cat}</h4>
          <div className="space-y-1">
            {allTemplates.filter((tpl) => tpl.category === cat).map((tpl) => (
              <div key={tpl.id}>
                {editingId === tpl.id ? (
                  /* ── Inline edit form ── */
                  <div className="p-2 bg-bc-dark border border-bc-accent space-y-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full px-2 py-1 text-sm bg-bc-panel border border-bc-border text-bc-text focus:border-bc-accent outline-none"
                      onKeyDown={(e) => e.key === 'Enter' && handleEditSave()}
                      autoFocus
                    />
                    <div className="flex gap-2 items-center">
                      <select
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value as VenueTemplate['category'])}
                        className="flex-1 px-2 py-1 text-xs bg-bc-panel border border-bc-border text-bc-text outline-none"
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                      <button onClick={handleEditSave} className="rounded-bc-full px-2 py-1 text-xs bg-bc-accent text-bc-accent-text">{t('header.templates.save', 'Save')}</button>
                      <button onClick={() => setEditingId(null)} className="px-2 py-1 text-xs text-bc-muted hover:text-bc-text">{t('header.templates.cancel', 'Cancel')}</button>
                    </div>
                  </div>
                ) : (
                  /* ── Template card ── */
                  <div className="group w-full rounded-bc-m text-left px-3 py-2 text-sm text-bc-text bg-bc-panel-raised hover:bg-bc-hover transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        onClick={() => handleLoad(tpl.id)}
                        className="flex-1 text-left"
                      >
                        <div className="font-medium">{tpl.name}</div>
                        <div className="text-xs text-bc-dim">
                          {format(t('header.templates.cameras', '{count} cameras · {w}×{h}m'), { count: tpl.cameras.length, w: tpl.venue.widthM, h: tpl.venue.heightM })}
                          {isPureBuiltIn(tpl.id) && <span className="ml-1 text-bc-faint">{t('header.templates.builtIn', '(built-in)')}</span>}
                          {isBuiltInShadow(tpl.id) && <span className="ml-1 text-bc-yellow">{t('header.templates.modified', '(modified)')}</span>}
                          {isCustomEntry(tpl.id) && !isBuiltInShadow(tpl.id) && <span className="ml-1 text-bc-accent">{t('header.templates.customTag', '(custom)')}</span>}
                        </div>
                      </button>
                      {/* Actions for ALL templates — built-ins get shadowed on
                          first edit/overwrite, hidden on delete. */}
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 pt-0.5">
                        <button
                          onClick={() => overwriteTemplate(tpl.id)}
                          title={t('header.templates.overwrite', 'Overwrite with current project')}
                          className="p-1 text-bc-dim hover:text-bc-accent hover:bg-bc-accent/10"
                        >
                          <FiCopy size={13} />
                        </button>
                        <button
                          onClick={() => handleEdit(tpl)}
                          title={t('header.templates.editNameCategory', 'Edit name / category')}
                          className="p-1 text-bc-dim hover:text-yellow-400 hover:bg-yellow-400/10"
                        >
                          <FiChevronDown size={13} />
                        </button>
                        {confirmDeleteId === tpl.id ? (
                          <button
                            onClick={() => { deleteTemplate(tpl.id); setConfirmDeleteId(null); }}
                            className="px-2 py-0.5 text-xs bg-red-600 text-bc-text-bright"
                          >
                            {t('header.templates.confirm', 'Confirm')}
                          </button>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(tpl.id)}
                            title={isPureBuiltIn(tpl.id) ? t('header.templates.hideBuiltIn', 'Hide built-in template (can be restored)') : t('header.templates.delete', 'Delete template')}
                            className="p-1 text-bc-dim hover:text-red-400 hover:bg-red-400/10"
                          >
                            <FiTrash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
