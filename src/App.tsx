import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Component, lazy, useEffect, useRef, type ErrorInfo, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ConfirmProvider } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PageSkeleton } from '@/components/ui/misc';
import { ToastProvider } from '@/components/ui/toast';
import { AuthProvider, useAuth } from '@/data/auth';
import { AuthPage, RecoveryPage } from '@/features/auth/AuthPage';
import { QuickProvider } from '@/features/forms/QuickProvider';
import { AppShell } from '@/features/layout/AppShell';

const Dashboard = lazy(() => import('@/features/dashboard/Dashboard'));
const TodayPage = lazy(() => import('@/features/today/TodayPage'));
const FinancePage = lazy(() => import('@/features/finance/FinancePage'));
const DebtsPage = lazy(() => import('@/features/debts/DebtsPage'));
const CarsPage = lazy(() => import('@/features/cars/CarsPage'));
const CarCalcPage = lazy(() => import('@/features/calc/CarCalcPage'));
const WhatIfPage = lazy(() => import('@/features/calc/WhatIfPage'));
const GoalsPage = lazy(() => import('@/features/goals/GoalsPage'));
const TasksPage = lazy(() => import('@/features/tasks/TasksPage'));
const LearningPage = lazy(() => import('@/features/learning/LearningPage'));
const NotesPage = lazy(() => import('@/features/notes/NotesPage'));
const CommandsPage = lazy(() => import('@/features/commands/CommandsPage'));
const SearchPage = lazy(() => import('@/features/search/SearchDialog').then(m => ({ default: m.default })));
const NotificationsPage = lazy(() => import('@/features/notifications/NotificationsPage'));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
  },
});

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error(error, info.componentStack); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="grid min-h-dvh place-items-center px-4 text-center">
        <div><h1 className="text-lg font-semibold">Что-то пошло не так</h1>
          <p className="mt-1 text-sm text-muted">Ваши данные в безопасности. Обновите страницу.</p>
          <Button variant="primary" className="mt-4" onClick={() => window.location.reload()}>Обновить</Button></div>
      </div>
    );
  }
}

function Gate() {
  const { user, loading, recovery, clearRecovery } = useAuth();
  const last = useRef<string | undefined>(undefined);
  useEffect(() => {
    // never leak one account's cached rows into another session
    if (last.current !== undefined && last.current !== (user?.id ?? '')) queryClient.clear();
    last.current = user?.id ?? '';
  }, [user?.id]);

  if (loading) return <div className="p-6"><PageSkeleton /></div>;
  if (recovery && user) return <RecoveryPage onDone={clearRecovery} />;
  if (!user) return <AuthPage />;
  return (
    <QuickProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="today" element={<TodayPage />} />
          <Route path="finance" element={<FinancePage />} />
          <Route path="debts" element={<DebtsPage />} />
          <Route path="cars" element={<CarsPage />} />
          <Route path="calc" element={<CarCalcPage />} />
          <Route path="whatif" element={<WhatIfPage />} />
          <Route path="goals" element={<GoalsPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="learning" element={<LearningPage />} />
          <Route path="notes" element={<NotesPage />} />
          <Route path="commands" element={<CommandsPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </QuickProvider>
  );
}

export function App() {
  return (
    <Boundary>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <ConfirmProvider>
            <AuthProvider>
              <HashRouter>
                <Gate />
              </HashRouter>
            </AuthProvider>
          </ConfirmProvider>
        </ToastProvider>
      </QueryClientProvider>
    </Boundary>
  );
}
