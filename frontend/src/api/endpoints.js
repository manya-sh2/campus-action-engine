import { api, API_BASE } from './client';
export const authApi = {
  startGoogleLogin: () => { window.location.href = API_BASE + '/api/auth/google'; },
  me: () => api.get('/api/auth/me'),
  logout: () => api.post('/api/auth/logout'),
};
export const userApi = {
  updateProfile: (userId, updates) => api.patch('/api/users/' + userId, updates),
};
export const taskApi = {
  list: (params = {}) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== '' && value !== null));
    return api.get('/api/tasks?' + query.toString());
  },
  highPriority: () => api.get('/api/tasks/priority/high'),
  upcoming: () => api.get('/api/tasks/deadlines/upcoming'),
  getById: taskId => api.get('/api/tasks/' + taskId),
  updateStatus: (taskId, status) => api.patch('/api/tasks/' + taskId + '/status', { status }),
  sync: (options = {}) => api.post('/api/tasks/sync', options),
};
