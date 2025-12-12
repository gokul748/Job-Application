const mysql = require('mysql2/promise');

const {
  DB_HOST = 'localhost',
  DB_PORT = '3306',
  DB_USER = 'root',
  DB_PASSWORD = '',
  DB_NAME = 'jobboard',
} = process.env;

// Connection pool for reuse across requests
const pool = mysql.createPool({
  host: DB_HOST,
  port: Number(DB_PORT),
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  connectionLimit: 10,
  namedPlaceholders: true,
});

// Create schema if missing
// Order matters: users first, then jobs, then applications (due to foreign keys)
async function initDb() {
  // Create users table first (no dependencies)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create jobs table (no dependencies)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      company VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      deadline DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Helper: ensure column exists (for older DBs without IF NOT EXISTS support)
  const ensureColumn = async (table, column, definition) => {
    const [cols] = await pool.query(`SHOW COLUMNS FROM ${table} LIKE ?`, [column]);
    if (!cols.length) {
      await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  };

  // Helper: ensure FK exists (tolerate duplicate)
  const ensureFk = async (table, fkName, definition) => {
    try {
      await pool.query(`ALTER TABLE ${table} ADD CONSTRAINT ${fkName} ${definition}`);
    } catch (err) {
      if (
        err &&
        (
          err.code === 'ER_DUP_KEYNAME' ||
          err.code === 'ER_FK_DUP_NAME' ||
          (err.sqlMessage || '').includes('already exists')
        )
      ) {
        return;
      }
      throw err;
    }
  };

  // Create applications table last (depends on users and jobs)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS applications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      job_id INT NOT NULL,
      user_id INT,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(50) NOT NULL,
      cover_letter TEXT NOT NULL,
      resume_path VARCHAR(255) NOT NULL,
      submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
    )
  `);

  // Backfill user_id column and FK if missing (older DBs)
  await ensureColumn('applications', 'user_id', 'INT NULL');
  await ensureFk(
    'applications',
    'fk_user',
    'FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL'
  );
}

module.exports = { pool, initDb };

