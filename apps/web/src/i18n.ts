import { getRequestConfig } from 'next-intl/server';

const LOCALE = 'cs';

export default getRequestConfig(async () => {
  const messages = (await import(`../messages/${LOCALE}.json`)).default;
  return {
    locale: LOCALE,
    messages,
    timeZone: 'Europe/Prague',
  };
});
