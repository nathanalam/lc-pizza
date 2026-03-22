import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey123';

export default async function handler(request: Request) {
  try {
    const url = new URL(request.url);
    const sql = neon(process.env.NETLIFY_DATABASE_URL!);
    const action = url.searchParams.get('action');

    if (request.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const { email, password } = await request.json();

    if (!email || !password) {
      return Response.json({ error: 'Missing email or password' }, { status: 400 });
    }

    if (action === 'signup') {
      // First user to sign up will be admin.
      const [{ count }] = await sql`SELECT COUNT(*)::int FROM users`;
      const isFirstUser = count === 0;

      if (!isFirstUser) {
        return Response.json({ error: 'Signups are closed. Please ask an admin to invite you.' }, { status: 403 });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      try {
        const [newUser] = await sql`
          INSERT INTO users (email, password, is_admin)
          VALUES (${email}, ${hashedPassword}, ${isFirstUser})
          RETURNING id, email, is_admin
        `;
        
        const token = jwt.sign({ userId: newUser.id, email: newUser.email, isAdmin: newUser.is_admin }, JWT_SECRET, { expiresIn: '7d' });
        return Response.json({ user: newUser, token });
      } catch (e: any) {
        if (e.message.includes('duplicate key value')) {
          return Response.json({ error: 'Email already exists' }, { status: 409 });
        }
        throw e;
      }
    } else if (action === 'login') {
      const users = await sql`SELECT * FROM users WHERE email = ${email}`;
      if (users.length === 0) {
        return Response.json({ error: 'Invalid email or password' }, { status: 401 });
      }

      const user = users[0];
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return Response.json({ error: 'Invalid email or password' }, { status: 401 });
      }

      const token = jwt.sign({ userId: user.id, email: user.email, isAdmin: user.is_admin }, JWT_SECRET, { expiresIn: '7d' });
      return Response.json({ user: { id: user.id, email: user.email, is_admin: user.is_admin }, token });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export const config = {
  path: "/api/auth"
};
