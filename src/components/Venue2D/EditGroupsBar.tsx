// Was im Plan greifbar ist (#169): jede Gruppe ein Schalter direkt am Plan,
// ohne Umweg ueber das Bearbeiten-Menue. Aus = gesperrt, man kann nicht
// versehentlich die Buehne verschieben, waehrend man Kameras setzt.
import type { ReactNode } from 'react';
import { FiCamera, FiGrid, FiLock, FiMap, FiSquare, FiUser } from 'react-icons/fi';
import { useStore } from '../../store/useStore';
import { useTranslation } from '../../i18n';
import type { EditGroup } from '../../types';

export default function EditGroupsBar() {
  const { t } = useTranslation();
  const editGroups = useStore((s) => s.editGroups);
  const toggle = useStore((s) => s.toggleEditGroup);

  const gruppen: { id: EditGroup; icon: ReactNode; label: string; title: string }[] = [
    { id: 'floorplan', icon: <FiMap size={13} />, label: t('venue.groups.floorplan', 'Floor plan'), title: t('venue.groups.floorplan.title', 'Floor plan and walls') },
    { id: 'stage', icon: <FiSquare size={13} />, label: t('venue.groups.stage', 'Stage'), title: t('venue.groups.stage.title', 'Stages') },
    { id: 'room', icon: <FiGrid size={13} />, label: t('venue.groups.room', 'Room'), title: t('venue.groups.room.title', 'Audience areas and video walls') },
    { id: 'objects', icon: <FiUser size={13} />, label: t('venue.groups.objects', 'Objects'), title: t('venue.groups.objects.title', 'Persons and stage objects') },
    { id: 'cameras', icon: <FiCamera size={13} />, label: t('venue.groups.cameras', 'Cameras'), title: t('venue.groups.cameras.title', 'Cameras') },
  ];

  return (
    <div
      role="group"
      aria-label={t('venue.groups', 'Editable in the plan')}
      className="absolute left-2 top-2 z-10 flex max-w-[calc(100%-80px)] flex-wrap items-center gap-1 rounded-bc-control border border-bc-border bg-bc-panel/85 p-1 shadow-bc-1 backdrop-blur"
    >
      {gruppen.map((g) => {
        const an = editGroups.includes(g.id);
        return (
          <button
            key={g.id}
            type="button"
            aria-pressed={an}
            onClick={() => toggle(g.id)}
            title={`${g.title} — ${an ? t('venue.groups.on', 'editable, click to lock') : t('venue.groups.off', 'locked, click to edit')}`}
            className={`flex min-h-8 items-center gap-1 rounded-bc-chip px-2 text-xs font-medium transition-colors [@media(pointer:coarse)]:min-h-11 ${
              an
                ? 'bg-bc-accent/15 text-bc-accent hover:bg-bc-accent/25'
                : 'text-bc-muted hover:bg-bc-panel-raised hover:text-bc-text'
            }`}
          >
            {an ? g.icon : <FiLock size={13} />}
            <span className="hidden sm:inline">{g.label}</span>
          </button>
        );
      })}
    </div>
  );
}
