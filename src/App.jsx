import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { LiveProvider } from './context/LiveContext';
import { ThemeProvider } from './context/ThemeContext';
import RequireAuth from './components/RequireAuth';
import RequireOwner from './components/RequireOwner';
import RequireCeo from './components/RequireCeo';
import RequireService from './components/RequireService';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Service from './pages/Service';
import Sales from './pages/Sales';
import Reports from './pages/Reports';
import Liabilities from './pages/Liabilities';
import Workers from './pages/Workers';
import Attendance from './pages/Attendance';
import Billing from './pages/Billing';
import PrinterSetup from './pages/PrinterSetup';
import Settings from './pages/Settings';

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
      <AuthProvider>
      <LiveProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="service" element={<RequireService><Service /></RequireService>} />
            <Route path="sales" element={<Sales />} />
            <Route path="reports" element={<RequireOwner><Reports /></RequireOwner>} />
            <Route path="liabilities" element={<RequireOwner><Liabilities /></RequireOwner>} />
            <Route path="workers" element={<RequireOwner><Workers /></RequireOwner>} />
            <Route path="attendance" element={<Attendance />} />
            <Route path="billing" element={<RequireCeo><Billing /></RequireCeo>} />
            <Route path="printer-setup" element={<PrinterSetup />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </LiveProvider>
      </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}