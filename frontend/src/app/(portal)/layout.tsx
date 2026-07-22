import { Toaster } from 'react-hot-toast';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      {children}
      <Toaster position="top-center" toastOptions={{ duration: 4000 }} />
    </div>
  );
}
