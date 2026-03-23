import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey123';

export default async function handler(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    jwt.verify(token, JWT_SECRET);

    const sql = neon(process.env.NETLIFY_DATABASE_URL!);

    if (request.method === 'GET') {
      const reports = await sql`
        SELECT business_date, data
        FROM daily_reports
        ORDER BY business_date DESC
      `;
      // Also fetch manual adjustments
      const adjustments = await sql`
        SELECT store_id, data
        FROM manual_adjustments
      `;
      return Response.json({ reports, adjustments });
    }

    if (request.method === 'POST') {
      const { reports, adjustments } = await request.json();

      // Upsert daily reports
      if (reports && reports.length > 0) {
        for (const report of reports) {
          const { business_date, data } = report;
          // Store data json directly stringified to avoid injection issues
          const stringifiedData = JSON.stringify(data);
          await sql`
            INSERT INTO daily_reports (business_date, data)
            VALUES (${business_date}, ${stringifiedData}::jsonb)
            ON CONFLICT (business_date) 
            DO UPDATE SET data = EXCLUDED.data, created_at = CURRENT_TIMESTAMP
          `;
        }
      }

      // Upsert manual adjustments
      if (adjustments && Array.isArray(adjustments)) {
        for (const adj of adjustments) {
          const { store_id, data } = adj;
          const stringifiedData = JSON.stringify(data);
          await sql`
            INSERT INTO manual_adjustments (store_id, data)
            VALUES (${store_id}, ${stringifiedData}::jsonb)
            ON CONFLICT (store_id)
            DO UPDATE SET data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP
          `;
        }
      }

      return Response.json({ success: true });
    }

    if (request.method === 'DELETE') {
      const { dates } = await request.json();
      if (dates && Array.isArray(dates) && dates.length > 0) {
        for (const date of dates) {
          await sql`DELETE FROM daily_reports WHERE business_date = ${date}`;
        }
      }
      return Response.json({ success: true });
    }

    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export const config = {
  path: "/api/data"
};
