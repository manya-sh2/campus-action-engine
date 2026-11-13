import { authApi } from '../api/endpoints';

export function LoginScreen({ notice, onDismissNotice }) {
  return <div className="login-screen"><div className="login-card">
    <h1>Campus Action Engine</h1>
    <p className="login-subtitle">Organize Gmail and Google Classroom updates into academic tasks, opportunities and deadlines.</p>
    {notice && <div className={'banner banner-' + notice.type} role="status">
      <span>{notice.message}</span><button className="banner-dismiss" onClick={onDismissNotice} aria-label="Dismiss">×</button>
    </div>}
    <button className="btn btn-google" onClick={authApi.startGoogleLogin}>Sign in with Google</button>
    <p className="login-footnote">Connect the Google account you use for Gmail and Classroom. Access is read-only. Your Google password is entered only on Google.</p>
  </div></div>;
}
