import React from 'react';
import { Outlet } from 'react-router-dom';
import { AdminSidebar } from './AdminSidebar';
import { AdminTopbar } from './AdminTopbar';

export const AdminShell: React.FC = () => {
  return (
    <div className="flex h-screen bg-background overflow-hidden selection:bg-amber-500/30 selection:text-amber-200">
      <AdminSidebar />
      <div className="flex-1 flex flex-col min-w-0 border-l border-amber-500/10">
        <AdminTopbar />
        {/* Subtle top glare indicating admin boundary */}
        <div className="h-1 w-full bg-gradient-to-r from-background via-amber-500/20 to-background opacity-50 block" />
        
        <main className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
