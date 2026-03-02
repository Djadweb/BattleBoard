import '../styles/globals.css';
import { ReactNode } from 'react';

export const metadata = {
  title: 'Project Board',
  description: 'Visual project tracker dashboard'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
