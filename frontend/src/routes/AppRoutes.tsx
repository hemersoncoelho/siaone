import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute, PublicRoute } from './Guards';
import { AppShell } from '../components/Layout/AppShell';

// Operational Pages
import { Login } from '../pages/Login';
import { SelectCompany } from '../pages/SelectCompany';
import { Inbox as InboxPage } from '../pages/Inbox';
import { Deals } from '../pages/Deals';
import { Tasks } from '../pages/Tasks';
import { AiAgents } from '../pages/AiAgents';
import { AiAgentDetail } from '../pages/AiAgentDetail';
import { Contacts } from '../pages/Contacts';
import { CompanySettings } from '../pages/CompanySettings';
import { Dashboard } from '../pages/Dashboard'; // Tela analítica com KPIs e gráficos
import { CompanyHome } from '../pages/company/Home'; // Tela de setup / home da empresa
import { MembersPage } from '../pages/company/Members';
import { TeamsPage } from '../pages/company/Teams';
import { IntegrationsPage } from '../pages/company/Integrations';

// Admin Pages
import { AdminShell } from '../components/admin/AdminShell';
import { CompaniesList } from '../pages/admin/CompaniesList';
import { CompanyDetails } from '../pages/admin/CompanyDetails';
import { UsersList, ModulesList, SupportPanel } from '../pages/admin/OtherAdminPages';
import { Unauthorized } from '../pages/Unauthorized';

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />

      <Route
        path="/select-company"
        element={
          <ProtectedRoute>
            <SelectCompany />
          </ProtectedRoute>
        }
      />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        {/* Redireciona / para /home (empresa) */}
        <Route index element={<Navigate to="home" replace />} />
        <Route path="home" element={<CompanyHome />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="inbox/*" element={<InboxPage />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="contacts" element={<Contacts />} />
        <Route path="companies" element={<div className="text-stone-400 p-8">Companies Module</div>} />
        <Route path="deals" element={<Deals />} />
        <Route path="ai-agents" element={<AiAgents />} />
        <Route path="ai-agents/:agentId" element={<AiAgentDetail />} />
        <Route path="members" element={<MembersPage />} />
        <Route path="teams" element={<TeamsPage />} />
        <Route path="integrations" element={<IntegrationsPage />} />
        <Route path="settings" element={<div className="text-stone-400 p-8">Configurações gerais em breve.</div>} />
        <Route path="settings/team" element={<CompanySettings />} />
      </Route>

      {/* Admin Backoffice */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={['system_admin', 'platform_admin']}>
            <AdminShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="companies" replace />} />
        <Route path="companies" element={<CompaniesList />} />
        <Route path="companies/:id" element={<CompanyDetails />} />
        <Route path="users" element={<UsersList />} />
        <Route path="modules" element={<ModulesList />} />
        <Route path="support" element={<SupportPanel />} />
        <Route path="settings" element={<div className="text-stone-400 p-8">Platform Settings</div>} />
      </Route>

      {/* Access denied */}
      <Route path="/unauthorized" element={<Unauthorized />} />

      {/* Fallback */}
      <Route path="*" element={<div className="flex-center h-screen bg-background text-primary text-xl">404 - Not Found</div>} />
    </Routes>
  );
};
