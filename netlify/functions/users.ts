import { neon } from '@netlify/neon';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey123';

export default async function handler(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string, isAdmin: boolean };
    
    if (!decoded.isAdmin) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const sql = neon();
    const url = new URL(request.url);

    if (request.method === 'GET') {
      const users = await sql`SELECT id, email, is_admin, created_at FROM users ORDER BY created_at DESC`;
      return Response.json({ users });
    }

    if (request.method === 'DELETE') {
      const id = url.searchParams.get('id');
      if (id === decoded.userId) {
        return Response.json({ error: 'Cannot delete yourself' }, { status: 400 });
      }
      await sql`DELETE FROM users WHERE id = ${id}`;
      return Response.json({ success: true });
    }

    if (request.method === 'PATCH') {
      const id = url.searchParams.get('id');
      const { is_admin } = await request.json();
      if (id === decoded.userId) {
        return Response.json({ error: 'Cannot change your own admin status' }, { status: 400 });
      }
      await sql`UPDATE users SET is_admin = ${is_admin} WHERE id = ${id}`;
      return Response.json({ success: true });
    }

    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export const config = {
  path: "/api/users"
};
