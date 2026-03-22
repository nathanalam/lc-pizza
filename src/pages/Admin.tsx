import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { Shield, Trash2, ArrowLeft, KeyRound } from 'lucide-react';
import ChangePasswordModal from '@/components/ChangePasswordModal';

type User = { id: string, email: string, is_admin: boolean, created_at: string };

export default function Admin() {
  const { user, token, logout } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [addingUser, setAddingUser] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordModalUserId, setPasswordModalUserId] = useState<string | null>(null);
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

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddingUser(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, password: newPassword, is_admin: newIsAdmin })
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: 'Success', description: 'User added.' });
      setNewEmail('');
      setNewPassword('');
      setNewIsAdmin(false);
      fetchUsers();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setAddingUser(false);
    }
  };

  const openPasswordModal = (id: string) => {
    setPasswordModalUserId(id);
    setPasswordModalOpen(true);
  };

  if (!user?.is_admin) return null;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex justify-between items-center bg-card border border-border p-6 rounded-2xl shadow-lg">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/dashboard')} className="text-muted-foreground hover:text-foreground transition">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                <Shield className="w-6 h-6 text-primary" /> Admin Dashboard
              </h1>
              <p className="text-muted-foreground text-sm">Manage user access and roles.</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => openPasswordModal(user.id as string)}
              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-sm transition-colors whitespace-nowrap"
            >
              <KeyRound className="w-4 h-4" /> Change Password
            </button>
            <button onClick={logout} className="px-4 py-2 bg-secondary hover:bg-secondary/80 text-foreground border border-slate-600 rounded-lg text-sm font-medium transition">
              Sign out
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1 space-y-6">
            <div className="bg-card border border-border p-6 rounded-2xl shadow-lg">
              <h3 className="text-lg font-bold text-foreground mb-4">Invite New User</h3>
              <form onSubmit={handleInvite} className="space-y-4">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Email</label>
                  <input type="email" placeholder="user@example.com" value={newEmail} onChange={e => setNewEmail(e.target.value)} required className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Temporary Password</label>
                  <input type="password" placeholder="••••••••" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6} className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary" />
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="isAdminCheck" checked={newIsAdmin} onChange={e => setNewIsAdmin(e.target.checked)} className="rounded border-border bg-background" />
                  <label htmlFor="isAdminCheck" className="text-sm text-foreground">Grant Admin Access</label>
                </div>
                <button type="submit" disabled={addingUser} className="w-full bg-primary hover:bg-primary/90 text-foreground font-medium text-sm py-2 rounded-lg transition-colors mt-2">
                  {addingUser ? 'Sending...' : 'Create Account'}
                </button>
              </form>
            </div>
          </div>

          <div className="md:col-span-2 bg-card border border-border rounded-2xl overflow-hidden shadow-lg">
            <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="text-xs text-muted-foreground uppercase bg-card border-b border-border">
              <tr>
                <th className="px-6 py-4">User</th>
                <th className="px-6 py-4">Joined</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-muted/50 transition">
                  <td className="px-6 py-4 text-foreground font-medium">{u.email}</td>
                  <td className="px-6 py-4 text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${u.is_admin ? 'bg-purple-500/10 text-primary border border-purple-500/20' : 'bg-secondary text-foreground border border-border'}`}>
                      {u.is_admin ? 'Admin' : 'User'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => toggleAdmin(u.id, u.is_admin)}
                        disabled={u.id == user.id}
                        className="px-3 py-1.5 text-xs font-medium text-foreground hover:text-foreground bg-secondary hover:bg-secondary/80 disabled:opacity-50 border border-border rounded-lg transition"
                      >
                        {u.is_admin ? 'Revoke Admin' : 'Make Admin'}
                      </button>
                      <button
                        onClick={() => openPasswordModal(u.id)}
                        className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition"
                        title="Change Password"
                      >
                        <KeyRound className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => removeUser(u.id)}
                        disabled={u.id == user.id}
                        className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 disabled:opacity-50 rounded-lg transition"
                        title="Delete User"
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

      <ChangePasswordModal
        isOpen={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
        userId={passwordModalUserId}
      />
    </div>
  );
}
