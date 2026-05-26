import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './components/shared/Toast';
import { AppProvider, useApp } from './contexts/AppContext';
import { MainLayout } from './components/Layout/MainLayout';
import { AuthShell } from './components/Auth/AuthShell';
import { ChatPage } from './pages/ChatPage';
import { ContactsPage } from './pages/ContactsPage';
import { AddFriendPage } from './pages/AddFriendPage';
import { ProfilePage } from './pages/ProfilePage';
import { AccountSettingsPage } from './pages/AccountSettingsPage';
import { ThemeSettingsPage } from './pages/ThemeSettingsPage';

function ProtectedRoute() {
  const { token } = useApp();
  return token ? <Outlet /> : <Navigate to="/login" replace />;
}

function PublicRoute() {
  const { token } = useApp();
  return token ? <Navigate to="/chat" replace /> : <Outlet />;
}

function LoginPage() {
  const { login } = useApp();
  return <AuthShell onLoginSuccess={login} />;
}


export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <ToastProvider>
          <AppProvider>
            <Routes>
              <Route element={<PublicRoute />}>
                <Route path="/login" element={<LoginPage />} />
              </Route>
              <Route element={<ProtectedRoute />}>
                <Route element={<MainLayout />}>
                  <Route index element={<Navigate to="/chat" replace />} />
                  <Route path="/chat" element={<ChatPage />} />
                  <Route path="/contacts" element={<ContactsPage />} />
                  <Route path="/add-friend" element={<AddFriendPage />} />
                  <Route path="/profile" element={<ProfilePage />} />
                  <Route path="/profile/account" element={<AccountSettingsPage />} />
                  <Route path="/profile/theme" element={<ThemeSettingsPage />} />
                </Route>
              </Route>
              <Route path="*" element={<Navigate to="/chat" replace />} />
            </Routes>
          </AppProvider>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
