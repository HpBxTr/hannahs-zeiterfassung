import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hannahs Zeiterfassung',
  description: 'Arbeitszeiten pro Mandant erfassen und abrechnen.',
};

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="de"><body>{children}</body></html>;
}
