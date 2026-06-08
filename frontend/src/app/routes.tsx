import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Shell } from '@/components/layout';

import DashboardPage from '@/pages/dashboard';
import LoginPage from '@/pages/login';
import ReportGroupsPage from '@/pages/report/groups';
import ReportConfigsPage from '@/pages/report/configs';
import ReportSchedulesPage from '@/pages/report/schedules';
import ReceiptSchedulesPage from '@/pages/report/receipt-schedules';
import ReceiptRecipientsPage from '@/pages/report/receipt-recipients';
import ReportRecipientsPage from '@/pages/report/recipients';
import NocDashboardPage from '@/pages/noc/dashboard';
import NocHistoryPage from '@/pages/noc/history';
import NocTvDashboardPage from '@/pages/noc/tv';
import PublicReceiptReportViewPage from '@/pages/public/receipt-report-view';
import MonitoringRecipientsPage from '@/pages/monitoring/recipients';
import PingMonitorsPage from '@/pages/monitoring/ping-monitors';
import PingRecipientsPage from '@/pages/monitoring/ping-recipients';
import PrtgSettingPage from '@/pages/settings/prtg-setting';
import WhatsappPage from '@/pages/settings/whatsapp';
import AccountPage from '@/pages/settings/account';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  // TV Dashboard — standalone, no shell/sidebar (full-screen for TV browser)
  {
    path: '/tv',
    element: <NocTvDashboardPage />,
  },
  // Public Web View for Receipt Report
  {
    path: '/public/report/:id',
    element: <PublicReceiptReportViewPage />,
  },
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <DashboardPage /> },
      // Report section
      { path: 'report/groups', element: <ReportGroupsPage /> },
      { path: 'report/configs', element: <ReportConfigsPage /> },
      { path: 'report/schedules', element: <ReportSchedulesPage /> },
      { path: 'report/receipt-schedules', element: <ReceiptSchedulesPage /> },
      { path: 'report/receipt-recipients', element: <ReceiptRecipientsPage /> },
      { path: 'report/recipients', element: <ReportRecipientsPage /> },
      // NOC section
      { path: 'noc/dashboard', element: <NocDashboardPage /> },
      { path: 'noc/history', element: <NocHistoryPage /> },
      // Monitoring section
      { path: 'monitoring/recipients', element: <MonitoringRecipientsPage /> },
      { path: 'monitoring/ping', element: <PingMonitorsPage /> },
      { path: 'monitoring/ping-recipients', element: <PingRecipientsPage /> },
      // Settings section
      { path: 'settings/prtg', element: <PrtgSettingPage /> },
      { path: 'settings/whatsapp', element: <WhatsappPage /> },
      { path: 'settings/account', element: <AccountPage /> },
      // Catch-all redirect
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
