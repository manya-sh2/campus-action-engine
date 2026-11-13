import { useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { useTasks } from './hooks/useTasks';
import { LoginScreen } from './components/LoginScreen';
import { DashboardPage } from './components/DashboardPage';
import { ProfilePanel } from './components/ProfilePanel';
import { Spinner } from './components/Feedback';

function SignedInApp({ user, logout, updateUserLocal }) {
  const [tab, setTab] = useState('dashboard');
  const [error, setError] = useState('');
  const tasksState = useTasks({ user });
  const signOut = async () => {
    try { await logout(); } catch (err) { setError(err.message); }
  };
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-brand"><span className="app-title">Campus Action Engine</span></div>
        <nav className="app-tabs" aria-label="Main navigation">
          {['dashboard', 'profile'].map(id => <button key={id} className={tab === id ? 'app-tab active' : 'app-tab'} onClick={() => setTab(id)}>
            {id === 'dashboard' ? 'Dashboard' : 'Profile'}
          </button>)}
        </nav>
        <div className="app-header-user"><span className="user-name">{user.name}</span>
          <button className="btn btn-ghost btn-small" onClick={signOut}>Sign out</button>
        </div>
      </header>
      <main className="app-main">
        {error && <div className="banner banner-error" role="alert">{error}</div>}
        {tab === 'dashboard' && <DashboardPage tasksState={tasksState} />}
        {tab === 'profile' && <ProfilePanel user={user} onUpdated={updateUserLocal} />}
      </main>
    </div>
  );
}
export default function App() {
  const auth = useAuth();
  if (auth.loading) return <div className="app-loading"><Spinner label="Checking your session…" /></div>;
  if (!auth.user) return <LoginScreen notice={auth.oauthNotice} onDismissNotice={auth.clearOauthNotice} />;
  return <SignedInApp key={auth.user._id} {...auth} />;
}
