import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';

export default async function HomePage(): Promise<never> {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!s.activeCompanyId) redirect('/companies');
  redirect('/timer');
}
