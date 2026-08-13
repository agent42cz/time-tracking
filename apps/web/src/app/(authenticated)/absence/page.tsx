import type { ReactElement } from 'react';
import { addDaysToDay, appZoneDay, appZoneWeekStartDay, isDayString } from '@tt/shared';
import { prisma, requireActiveCompany } from '@/lib/session';
import { PageHeader } from '@/components/PageHeader';
import { getWeekOverview, listAbsences, listPastAbsences } from '@/lib/services/absences';
import { AbsenceForm } from './AbsenceForm';
import { AbsenceList } from './AbsenceList';
import { MarkAllSeenButton } from './MarkAllSeenButton';
import { WeekGrid } from './WeekGrid';

export default async function AbsencePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}): Promise<ReactElement> {
  const s = await requireActiveCompany();
  const params = await searchParams;

  const today = appZoneDay();
  const currentWeek = appZoneWeekStartDay();
  const weekStart = params.week && isDayString(params.week) ? params.week : currentWeek;
  const isAdmin = s.activeRole === 'admin';

  const [weekResult, upcomingResult, pastResult] = await Promise.all([
    getWeekOverview(prisma(), s.userId, s.activeCompanyId, weekStart),
    listAbsences(prisma(), s.userId, s.activeCompanyId, { today }),
    listPastAbsences(prisma(), s.userId, s.activeCompanyId, { today, limit: 20 }),
  ]);

  const upcoming = upcomingResult.ok ? upcomingResult.value : [];
  const past = pastResult.ok ? pastResult.value : [];
  // Same predicate as `countUnseenAbsences`, but the rows are already here —
  // `listAbsences` starts at today and carries `seen`, so re-querying the count
  // would be a third round trip for a number we can read off the list.
  const unseen = upcoming.filter((a) => !a.seen && a.userId !== s.userId).length;

  return (
    <div>
      <PageHeader
        title="Nepřítomnost"
        description={
          isAdmin
            ? 'Kdo tu kdy nebude. Nové záznamy jsou označené, dokud je neotevřete.'
            : 'Nahlaste dny, kdy nebudete k dispozici. Nejpozději den předem.'
        }
        actions={isAdmin ? <MarkAllSeenButton count={unseen} /> : undefined}
      />
      <div className="space-y-4 md:space-y-6">
        {weekResult.ok && (
          <WeekGrid
            overview={weekResult.value}
            weekStart={weekStart}
            prevWeek={addDaysToDay(weekStart, -7)}
            nextWeek={addDaysToDay(weekStart, 7)}
            today={today}
            isCurrentWeek={weekStart === currentWeek}
          />
        )}
        <AbsenceForm minDate={addDaysToDay(today, 1)} />
        <AbsenceList
          items={upcoming}
          viewerId={s.userId}
          canAcknowledge={isAdmin}
          title={isAdmin ? 'Nadcházející nepřítomnosti' : 'Moje nadcházející nepřítomnosti'}
          emptyText="Žádná nahlášená nepřítomnost"
        />
        {past.length > 0 && (
          <AbsenceList
            items={past}
            viewerId={s.userId}
            canAcknowledge={false}
            title="Historie"
            emptyText="Zatím nic"
          />
        )}
      </div>
    </div>
  );
}
