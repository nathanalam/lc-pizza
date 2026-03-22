import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { Shield, Trash2, ArrowLeft } from 'lucide-react';

type User = { id: string, email: string, is_admin: boolean, created_at: string };

export default function Admin() {
  const { user, token, logout } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const { toast } = useToast();
  const navigate = useNavigate();

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setUsers(data.users);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
      if (e.message === 'Forbidden') navigate('/');
    }
  };

  useEffect(() => {
    if (!user) navigate('/login');
    else if (!user.is_admin) navigate('/');
    else fetchUsers();
  }, [user, navigate]);

  const removeUser = async (id: string) => {
    try {
      const res = await fetch(`/api/users?id=${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: 'Success', description: 'User removed.' });
      fetchUsers();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const toggleAdmin = async (id: string, currentStatus: boolean) => {
    try {
      const res = await fetch(`/api/users?id=${id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_admin: !currentStatus })
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: 'Success', description: 'User status updated.' });
      fetchUsers();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  if (!user?.is_admin) return null;

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="flex justify-between items-center bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-lg">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/')} className="text-slate-400 hover:text-white transition">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                <Shield className="w-6 h-6 text-purple-500" /> Admin Dashboard
              </h1>
              <p className="text-slate-400 text-sm">Manage user access and roles.</p>
            </div>
          </div>
          <button onClick={logout} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white border border-slate-600 rounded-lg text-sm font-medium transition">
            Sign out
          </button>
        </header>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="text-xs text-slate-400 uppercase bg-slate-900 border-b border-slate-800">
              <tr>
                <th className="px-6 py-4">User</th>
                <th className="px-6 py-4">Joined</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-slate-800/30 transition">
                  <td className="px-6 py-4 text-white font-medium">{u.email}</td>
                  <td className="px-6 py-4 text-slate-400">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${u.is_admin ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'bg-slate-800 text-slate-300 border border-slate-700'}`}>
                      {u.is_admin ? 'Admin' : 'User'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => toggleAdmin(u.id, u.is_admin)}
                        disabled={u.id == user.id}
                        className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 disabled:opacity-50 border border-slate-700 rounded-lg transition"
                      >
                        {u.is_admin ? 'Revoke Admin' : 'Make Admin'}
                      </button>
                      <button
                        onClick={() => removeUser(u.id)}
                        disabled={u.id == user.id}
                        className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 disabled:opacity-50 rounded-lg transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
