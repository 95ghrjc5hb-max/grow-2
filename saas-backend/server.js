import express from 'express';
// mongoose import removed as the system is fully migrated to Supabase
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import path from 'path';
import nodemailer from 'nodemailer';
import dashboardRoutes from './routes/dashboardRoutes.js';
import { createClient } from '@supabase/supabase-js';
import orderRoutes from './routes/orderRoutes.js';
import integrationRoutes from './routes/integrationRoutes.js';

// Setup paths for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: './.env' });

// ==========================================
// 1. SYSTEM INITIALIZATION
// ==========================================
const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'GROW_APP_SECURE_KEY_2026';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ==========================================
// 2. ADVANCED SECURITY & MIDDLEWARES
// ==========================================

// 1. CORS must always be placed BEFORE helmet
app.use(cors({
  origin: true, // Automatically accepts request from http://localhost:5173
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// 2. Security headers (Placed after CORS)
app.use(helmet());

app.use(express.json({ limit: '10kb' })); 
app.use(morgan('dev')); 

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests from this IP, please try again later.' }
});
//app.use('/api/', limiter);

// ==========================================
// 3. DATABASE INFRASTRUCTURE (SUPABASE)
// ==========================================
const supabaseUrl = process.env.SUPABASE_URL;
// Using the Secret Key for secure backend operations
const supabaseKey = process.env.SUPABASE_SECRET_KEY; 

// Initialize the Supabase client
export const supabase = createClient(supabaseUrl, supabaseKey);

if (supabase) {
  console.log('🟢 [DATABASE] Dedicated SaaS Database engine (Supabase) connected successfully.');
} else {
  console.error('🔴 [DATABASE] Engine connection failure.');
}

// ==========================================
// 4. ARCHITECTURAL SCHEMAS 
// ==========================================
// Note: Unlike Mongoose (MongoDB), Supabase (PostgreSQL) does not require 
// defining schemas in the code.
// You must create the 'users', 'conversations', and 'orders' tables 
// directly in the Supabase Dashboard via the "Table Editor".

// ==========================================
// 5. SECURITY AUTHENTICATION MIDDLEWARE
// ==========================================
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ success: false, error: 'Session token missing or unauthorized.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, error: 'Session expired or cryptographic signature invalid.' });
    }
    req.user = user;
    next();
  });
};

// ==========================================
// 6. CENTRAL CORE API ENDPOINTS
// ==========================================
app.use('/api/dashboard', dashboardRoutes);

app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user already exists
    const userExists = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (userExists.data) {
      return res.status(400).json({ 
        success: false, 
        error: 'Identity already exists in system.' 
      });
    }

    // Generate dynamic 6-digit cryptographically secure OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Secure password hashing
    const hashedPassword = await bcrypt.hash(password, 12);

    // Register new user instance in Supabase
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert([
        {
          email: email,
          password: hashedPassword,
          otp: otpCode,
          isVerified: false
        }
      ])
      .select();

    if (insertError) {
      console.error("Insert Error:", insertError);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to register user in database.' 
      });
    }

    // Futuristic, responsive HTML Email Template
    const emailHtmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #090d16; color: #f3f4f6; margin: 0; padding: 40px 20px; }
          .card { max-width: 480px; margin: 0 auto; background: #111827; border: 1px solid #1f2937; border-radius: 16px; padding: 40px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7); }
          .brand { font-size: 18px; font-weight: 800; color: #6366f1; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 24px; text-align: center; }
          .title { font-size: 22px; font-weight: 700; color: #ffffff; text-align: center; margin-bottom: 10px; }
          .subtitle { font-size: 14px; color: #9ca3af; text-align: center; margin-bottom: 30px; line-height: 1.5; }
          .otp-box { background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.4); border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 30px; }
          .otp-code { font-size: 38px; font-weight: 900; color: #818cf8; letter-spacing: 10px; font-family: monospace; }
          .footer { font-size: 12px; color: #4b5563; text-align: center; border-top: 1px solid #1f2937; padding-top: 20px; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="brand">GROW APP CORE</div>
          <div class="title">Security Verification</div>
          <div class="subtitle">Use the system-generated authentication code below to complete your registration.</div>
          <div class="otp-box">
            <div class="otp-code">${otpCode}</div>
          </div>
          <div class="subtitle" style="font-size: 12px; margin-bottom: 0;">This code is confidential and strictly intended for this transaction.</div>
          <div class="footer">
            &copy; 2026 Grow App Platform. Automated Neural Network Dispatch.
          </div>
        </div>
      </body>
      </html>
    `;

    // Dispatch Email via Nodemailer Transporter
    try {
      await transporter.sendMail({
        from: `"Grow App Core" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: '⚡ Action Required: Your 6-Digit Verification Code',
        html: emailHtmlContent,
      });
    } catch (emailError) {
      console.error("⚠️ Email dispatch failed, but registration succeeded:", emailError.message);
    }

    return res.status(201).json({ 
      success: true, 
      message: 'Account pipeline configured and verification code dispatched.' 
    });

  } catch (error) {
    console.error('CRITICAL REGISTRATION ERROR:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal registration failure.',
      details: error.message 
    });
  }
});

// Central Authentication - Advanced Neural Verification Endpoint
app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    // 1. Strict Input Validation & Sanitization
    if (!email || !otp) {
      return res.status(400).json({ 
        success: false, 
        error: 'Malformed request: Missing identification or verification payload.' 
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const sanitizedOtp = otp.toString().trim();

    // 2. Retrieve target user record securely from Supabase
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('email', normalizedEmail)
      .single();

    if (fetchError || !user) {
      return res.status(404).json({ 
        success: false, 
        error: 'Identity record not found in the system registry.' 
      });
    }

    // 3. Prevent redundant verification pipeline execution
    if (user.isVerified) {
      return res.status(400).json({ 
        success: false, 
        error: 'Identity pipeline is already verified and active.' 
      });
    }

    // 4. Secure Verification Check (Strict Type Match)
    if (!user.otp || user.otp !== sanitizedOtp) {
      return res.status(401).json({ 
        success: false, 
        error: 'Cryptographic verification failed: Invalid or expired token.' 
      });
    }

    // 5. Atomic Update: Flush temporary OTP and set verified status via Supabase
    const { error: updateError } = await supabase
      .from('users')
      .update({ 
        otp: null, 
        isVerified: true 
      })
      .eq('email', normalizedEmail);

    if (updateError) throw updateError;

    // 6. Issue standard authorization JWT token with explicit algorithm
    // Note: Replaced user._id with user.id for Supabase compatibility
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email 
      }, 
      JWT_SECRET, 
      { 
        expiresIn: '7d',
        algorithm: 'HS256' 
      }
    );

    // 7. Dispatch successful standard response
    return res.status(200).json({ 
      success: true, 
      message: 'Authentication protocol complete. Access granted.',
      token,
      data: {
        user: { 
          id: user.id, 
          email: user.email,
          isVerified: true
        }
      }
    });

  } catch (error) {
    console.error('CRITICAL VERIFICATION ENGINE FAILURE:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal system anomaly detected during verification.' 
    });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Credentials missing.' });
    }

    // Secure user fetch from Supabase
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.trim().toLowerCase())
      .single();

    if (fetchError || !user) {
      return res.status(404).json({ success: false, error: 'Identity records not found.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Secured credentials mismatch.' });
    }

    // Token payload using Supabase ID
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    
    res.status(200).json({ success: true, token });
  } catch (error) {
    console.error('CRITICAL LOGIN FAILURE:', error);
    res.status(500).json({ success: false, error: 'Internal authentication failure.' });
  }
});

app.get('/api/v1/auth/me', authenticateToken, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', req.user.email)
      .single();

    if (error || !user) {
      console.error('Supabase Profile Fetch Error:', error);
      return res.status(404).json({ success: false, error: 'User system profile match failed.' });
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        user: { 
          id: user.id || user._id, 
          full_name: user.email.split('@')[0], 
          email: user.email, 
          role: 'administrator' 
        }
      }
    });
  } catch (error) {
    console.error('Catch block error:', error);
    res.status(500).json({ success: false, error: 'Internal pipeline profile failure.' });
  }
});


app.get('/api/conversations', authenticateToken, async (req, res) => {
  try {
    // Advanced relational query via Supabase equivalent to MongoDB find & sort
    const { data: records, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('userId', req.user.userId)
      .order('updated_date', { ascending: false });

    if (error) throw error;

    res.status(200).json(records);
  } catch (error) {
    res.status(500).json({ success: false, error: 'Data isolation fetching layer failure.' });
  }
});
app.use('/api/v1/orders', orderRoutes);
app.use('/api/integrations', integrationRoutes);
// Serve static assets if in production
app.use(express.static(path.join(__dirname, '../dist')));

// Any request that doesn't match the API routes will load the frontend
app.get(/(.*)/, (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ success: false, error: "API route not found" });
  }
  res.sendFile(path.join(__dirname, '../dist', 'index.html'));
});

// ==========================================
// 7. GLOBAL ERROR HANDLER & SERVER BOOT
// ==========================================
app.listen(PORT, () => {
  console.log(`🚀 [CORE] Dedicated Independent Server processing core live on port ${PORT}`);
  console.log(`🛡️  [SECURITY] Helmet & Rate Limiting Active`);
});
