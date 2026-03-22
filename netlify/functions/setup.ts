import { neon } from '@netlify/neon';

export default async function handler(request: Request) {
  try {
    const sql = neon();
    
    // Create users table
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        is_admin BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    
    // Create daily reports table
    await sql`
      CREATE TABLE IF NOT EXISTS daily_reports (
        id SERIAL PRIMARY KEY,
        business_date VARCHAR(50) UNIQUE NOT NULL,
        data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Create manual adjustments table
    await sql`
      CREATE TABLE IF NOT EXISTS manual_adjustments (
        id SERIAL PRIMARY KEY,
        store_id VARCHAR(50) UNIQUE NOT NULL,
        data JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    return Response.json({ message: "Tables created successfully!" });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export const config = {
  path: "/api/setup"
};
