import { useState } from 'react';
import { userApi } from '../api/endpoints';
const BRANCHES = ['Mining', 'CSE', 'IT', 'MNC', 'ECE', 'EEE', 'Chemical', 'Mechanical', 'Civil', 'Metallurgy', 'Ceramic'];
const CATEGORIES = ['job', 'internship', 'assignment', 'exam', 'event', 'scholarship', 'registration', 'announcement'];

export function ProfilePanel({ user, onUpdated }) {
  const [form, setForm] = useState({
    branch: user.branch || '', year: user.year || '', graduationYear: user.graduationYear || '',
    cgpa: user.cgpa ?? '', preferredCategories: user.preferredCategories || [], timezone: user.timezone || 'Asia/Kolkata',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const change = field => event => { setSaved(false); setForm(prev => ({ ...prev, [field]: event.target.value })); };
  const submit = async event => {
    event.preventDefault(); setSaving(true); setError(''); setSaved(false);
    try {
      const result = await userApi.updateProfile(user._id, {
        ...form, branch: form.branch || null, year: form.year === '' ? null : Number(form.year),
        graduationYear: form.graduationYear === '' ? null : Number(form.graduationYear),
        cgpa: form.cgpa === '' ? null : Number(form.cgpa),
      });
      onUpdated(result.data); setSaved(true);
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };
  return <form className="profile-form" onSubmit={submit}>
    <div className="profile-readonly"><p><strong>{user.name}</strong></p><p className="text-muted">{user.email}</p></div>
    <div className="form-grid">
      <label>Branch<select aria-label="Branch" value={form.branch} onChange={change('branch')}><option value="">Not set</option>{BRANCHES.map(b => <option key={b}>{b}</option>)}</select></label>
      <label>Year<input type="number" min="1" max="6" value={form.year} onChange={change('year')} /></label>
      <label>Graduation year<input type="number" min="2000" max="2100" value={form.graduationYear} onChange={change('graduationYear')} /></label>
      <label>CGPA<input type="number" min="0" max="10" step="0.01" value={form.cgpa} onChange={change('cgpa')} /></label>
      <label className="form-grid-wide">Timezone<input required value={form.timezone} onChange={change('timezone')} placeholder="Asia/Kolkata" /></label>
      <fieldset className="form-grid-wide"><legend>Categories you want to prioritize</legend>
        <div className="category-options">{CATEGORIES.map(category => <label key={category}>
          <input type="checkbox" checked={form.preferredCategories.includes(category)} onChange={event => {
            setSaved(false);
            setForm(prev => ({ ...prev, preferredCategories: event.target.checked ? [...prev.preferredCategories, category] : prev.preferredCategories.filter(item => item !== category) }));
          }} /> {category}
        </label>)}</div>
      </fieldset>
    </div>
    {error && <div className="banner banner-error" role="alert">{error}</div>}
    {saved && <div className="banner banner-success" role="status">Profile saved. Your dashboard will use the updated preferences.</div>}
    <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
    <p className="text-muted profile-hint">Branch, CGPA and graduation year determine eligibility. Category preferences affect priority. Missing information is marked for review.</p>
  </form>;
}
