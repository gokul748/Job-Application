# Job Application Site

A full-featured job board built with Node.js, Express, and MySQL. Features user authentication, role-based access control (users and admins), job listings, and application submission with resume uploads.

## Prerequisites
- Node.js 18+
- MySQL 8 (community server is fine)

## MySQL setup (one-time)
1) Install MySQL: https://dev.mysql.com/downloads/mysql/ (Windows Installer → “Server only” is fine).
2) Create a database and user (adjust names/passwords as you like):
   ```sql
   CREATE DATABASE jobboard CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'jobboard_user'@'%' IDENTIFIED BY 'jobboard_pass';
   GRANT ALL PRIVILEGES ON jobboard.* TO 'jobboard_user'@'%';
   FLUSH PRIVILEGES;
   ```
3) Environment variables:
   - Copy `env.example` to `.env` and edit as needed (or set in shell):
   - `DB_HOST` (default `localhost`)
   - `DB_PORT` (default `3306`)
   - `DB_USER` (default `root` or `jobboard_user` above)
   - `DB_PASSWORD`
   - `DB_NAME` (default `jobboard`)

## App setup & run
```sh
npm install
npm start
# server runs at http://localhost:3000
```

On first run, tables are created automatically, a default admin user is created, and two sample jobs are seeded if none exist. Uploaded resumes are stored in the `uploads/` directory.

## Step-by-step setup (any OS: Windows/Mac/Linux)
1) Install Node.js 18+ and MySQL 8  
2) Clone or copy the project to your machine  
3) In the project folder:
   ```sh
   npm install
   cp env.example .env   # on Windows PowerShell: copy env.example .env
   ```
4) Edit `.env` with your DB credentials (host/user/password/db)  
5) Create the DB and user in MySQL (see SQL above)  
6) Run the server:
   ```sh
   npm start
   ```
7) Open `http://localhost:3000` in your browser  
8) Default admin: `admin@jobboard.com` / `admin123` (change in `.env`)

## Admin endpoints
- `GET /api/admin/applications` — list all applications with job and user info (admin only)

## Default Admin Credentials

On first run, a default admin account is created:
- **Email:** `admin@jobboard.com`
- **Password:** `admin123` (or set `ADMIN_PASSWORD` in `.env`)

**Important:** Change the admin password in production!

## Authentication

The application uses session-based authentication with role-based access control:
- **Users** (`user` role): Can browse jobs and submit applications
- **Admins** (`admin` role): Can post new job listings

### User Registration & Login

- Visit `/register.html` to create a new user account
- Visit `/login.html` to sign in
- Users are automatically assigned the `user` role

## API Endpoints

### Public Endpoints
- `GET /api/jobs` — list all jobs (public)
- `GET /api/jobs/:id` — get job details (public)

### Authentication Endpoints
- `POST /api/auth/register` — register new user (JSON: `name`, `email`, `password`)
- `POST /api/auth/login` — login (JSON: `email`, `password`)
- `POST /api/auth/logout` — logout
- `GET /api/auth/me` — get current user info

### Protected Endpoints
- `POST /api/jobs` — create job (requires admin, JSON: `title`, `company`, `description`, `deadline`)
- `POST /api/jobs/:id/apply` — submit application (requires user auth, multipart/form-data: `name`, `email`, `phone`, `coverLetter`, `resume` file)

Responses include error messages with non-200 status codes for validation failures.

## Frontend Pages

- `public/index.html` — home page with login/register options and job preview
- `public/login.html` — user login page
- `public/register.html` — user registration page
- `public/jobs.html` — browse all job listings (requires login to apply)
- `public/job.html` — view job details
- `public/apply.html` — application form (requires user login)
- `public/admin.html` — post new jobs (requires admin login)

These are served automatically by Express.

## Viewing the Database

Instead of using MySQL command line, you can use GUI tools to visually browse your database:

**Recommended:** See `MYSQL_GUI_TOOLS.md` for detailed guide on:
- MySQL Workbench (official, recommended)
- DBeaver (lightweight, multi-database)
- HeidiSQL (Windows-focused)
- TablePlus (modern UI)
- phpMyAdmin (web-based)

**Quick Connection Details:**
```
Host: localhost
Port: 3306
Username: jobboard_user
Password: jobboard_pass
Database: jobboard
```

## Database Workflow

See `WORKFLOW.md` for complete documentation on:
- Database schema and table structure
- CRUD operations breakdown
- Authentication flow
- Data seeding process
- Testing checklist

## Notes
- Adjust the `PORT` env var to change the listening port.
- Resumes are stored on disk; move to object storage for production use.
- Database tables are created automatically on first run.
- Foreign key relationships ensure data integrity.

