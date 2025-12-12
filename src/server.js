require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { pool, initDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure uploads folder exists
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/\s+/g, '-');
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const upload = multer({ storage });

// Session configuration
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // Set to true if using HTTPS
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadDir));

// Explicit resume download route (helps if static resolution fails)
app.get('/uploads/:file', (req, res) => {
  const fileName = req.params.file;
  const filePath = path.join(uploadDir, fileName);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found');
  }
  return res.sendFile(filePath);
});

// API routes must come before static middleware
// Authentication routes
const isValidDate = (value) => {
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
};

const toMySqlDateTime = (value) => {
  const d = new Date(value);
  return d.toISOString().slice(0, 19).replace('T', ' ');
};

const formatJob = (row) => ({
  id: row.id,
  title: row.title,
  company: row.company,
  description: row.description,
  deadline: row.deadline,
  createdAt: row.created_at,
});

// Authentication middleware
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

const requireAdmin = async (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const [users] = await pool.query('SELECT role FROM users WHERE id = ?', [req.session.userId]);
    if (!users.length || users[0].role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (err) {
    next(err);
  }
};

// Seed default admin user and sample jobs
const seedData = async () => {
  // Check if admin exists
  const [adminUsers] = await pool.query("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'");
  if (adminUsers[0].count === 0) {
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await pool.query(
      'INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)',
      ['admin@jobboard.com', passwordHash, 'Admin User', 'admin']
    );
    // eslint-disable-next-line no-console
    console.log('Default admin created: admin@jobboard.com / admin123');
  }

  // Seed sample jobs
  const [rows] = await pool.query('SELECT COUNT(*) AS count FROM jobs');
  const count = rows[0].count;
  if (count === 0) {
    await pool.query(
      'INSERT INTO jobs (title, company, description, deadline) VALUES (?, ?, ?, ?)',
      [
        'Frontend Engineer',
        'Acme Corp',
        'Build UI components and improve UX.',
        toMySqlDateTime(Date.now() + 7 * 24 * 60 * 60 * 1000),
      ]
    );
    await pool.query(
      'INSERT INTO jobs (title, company, description, deadline) VALUES (?, ?, ?, ?)',
      [
        'Backend Developer',
        'Globex',
        'Work on APIs and database performance.',
        toMySqlDateTime(Date.now() + 14 * 24 * 60 * 60 * 1000),
      ]
    );
  }
};

app.post('/api/auth/register', async (req, res, next) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if user exists
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)',
      [email, passwordHash, name, 'user']
    );

    req.session.userId = result.insertId;
    req.session.userRole = 'user';

    res.status(201).json({
      message: 'Registration successful',
      user: { id: result.insertId, email, name, role: 'user' },
    });
  } catch (err) {
    next(err);
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const [users] = await pool.query('SELECT id, email, password_hash, name, role FROM users WHERE email = ?', [
      email,
    ]);

    if (!users.length) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = users[0];
    const isValid = await bcrypt.compare(password, user.password_hash);

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    req.session.userId = user.id;
    req.session.userRole = user.role;

    res.json({
      message: 'Login successful',
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (err) {
    next(err);
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.json({ message: 'Logged out successfully' });
  });
});

app.get('/api/auth/me', async (req, res, next) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const [users] = await pool.query('SELECT id, email, name, role FROM users WHERE id = ?', [
      req.session.userId,
    ]);

    if (!users.length) {
      req.session.destroy();
      return res.status(401).json({ error: 'User not found' });
    }

    res.json({ user: users[0] });
  } catch (err) {
    next(err);
  }
});

// Public job routes
app.get('/api/jobs', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, title, company, description, deadline, created_at FROM jobs ORDER BY created_at DESC'
    );
    res.json(rows.map(formatJob));
  } catch (err) {
    next(err);
  }
});

app.get('/api/jobs/:id', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, title, company, description, deadline, created_at FROM jobs WHERE id = ?',
      [req.params.id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json(formatJob(rows[0]));
  } catch (err) {
    next(err);
  }
});

// Protected admin route - create job
app.post('/api/jobs', requireAdmin, async (req, res, next) => {
  try {
    const { title, company, description, deadline } = req.body;

    if (!title || !company || !description || !deadline) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Trim and validate inputs
    const trimmedTitle = title.trim();
    const trimmedCompany = company.trim();
    const trimmedDescription = description.trim();

    if (!trimmedTitle || !trimmedCompany || !trimmedDescription) {
      return res.status(400).json({ error: 'Fields cannot be empty' });
    }

    if (!isValidDate(deadline)) {
      return res.status(400).json({ error: 'Invalid deadline format' });
    }

    const deadlineVal = toMySqlDateTime(deadline);
    const [result] = await pool.query(
      'INSERT INTO jobs (title, company, description, deadline) VALUES (?, ?, ?, ?)',
      [trimmedTitle, trimmedCompany, trimmedDescription, deadlineVal]
    );

    const [rows] = await pool.query(
      'SELECT id, title, company, description, deadline, created_at FROM jobs WHERE id = ?',
      [result.insertId]
    );

    if (!rows.length) {
      return res.status(500).json({ error: 'Failed to retrieve created job' });
    }

    res.status(201).json(formatJob(rows[0]));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error creating job:', err);
    next(err);
  }
});

// Admin view applications
app.get('/api/admin/applications', requireAdmin, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT 
        a.id,
        a.name,
        a.email,
        a.phone,
        a.cover_letter,
        a.resume_path,
        a.submitted_at,
        j.id AS job_id,
        j.title AS job_title,
        j.company AS job_company,
        u.id AS user_id,
        u.email AS user_email,
        u.name AS user_name
      FROM applications a
      LEFT JOIN jobs j ON a.job_id = j.id
      LEFT JOIN users u ON a.user_id = u.id
      ORDER BY a.submitted_at DESC
      `
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Protected route - apply for job (requires user auth)
app.post('/api/jobs/:id/apply', requireAuth, upload.single('resume'), async (req, res, next) => {
  try {
    const jobId = parseInt(req.params.id, 10);
    const userId = req.session.userId;

    if (!jobId || isNaN(jobId)) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Invalid job ID' });
    }

    if (!userId) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(401).json({ error: 'User session not found' });
    }

    const [jobs] = await pool.query('SELECT id, deadline FROM jobs WHERE id = ?', [jobId]);

    if (!jobs.length) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Job not found' });
    }

    const now = new Date();
    const deadline = new Date(jobs[0].deadline);
    if (deadline < now) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Application deadline has passed' });
    }

    const { name, email, phone, coverLetter } = req.body;

    if (!name || !email || !phone || !coverLetter) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Resume file is required' });
    }

    await pool.query(
      'INSERT INTO applications (job_id, user_id, name, email, phone, cover_letter, resume_path) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [jobId, userId, name.trim(), email.trim(), phone.trim(), coverLetter.trim(), req.file.filename]
    );

    res.status(201).json({ message: 'Application submitted successfully' });
  } catch (err) {
    // Clean up uploaded file on error
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkErr) {
        // eslint-disable-next-line no-console
        console.error('Failed to delete uploaded file:', unlinkErr);
      }
    }
    next(err);
  }
});

// Static files served after API routes
app.use(express.static(path.join(__dirname, '..', 'public')));

// Error handler
app.use((err, req, res, next) => {
  // eslint-disable-next-line no-console
  console.error('Error:', err);
  
  // Don't expose internal error details in production
  const errorMessage = process.env.NODE_ENV === 'production' 
    ? 'Internal server error' 
    : err.message || 'Internal server error';
  
  res.status(err.status || 500).json({ 
    error: errorMessage,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

async function start() {
  try {
    await initDb();
    await seedData();
    app.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`Server running at http://localhost:${PORT}`);
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
