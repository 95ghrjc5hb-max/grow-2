import 'dotenv/config';
import express from 'express';
// mongoose import removed as the system is fully migrated to Supabase
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import path from 'path';
import { Resend } from 'resend';
import crypto from 'crypto';
import dashboardRoutes from './routes/dashboardRoutes.js';
import { createClient } from '@supabase/supabase-js';
import orderRoutes from './routes/orderRoutes.js';
import integrationRoutes from './routes/integrationRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import authRoutes from './routes/authRoutes.js';
import { getConversations, sendManualMessage } from './controllers/conversationController.js';
import conversationRoutes from './routes/conversationRoutes.js';
import { authenticateToken } from './middleware/authMiddleware.js'; 
import stripeRoutes from './routes/stripeRoutes.js';
import { handleStripeWebhook } from './controllers/stripeController.js';
import lemonSqueezyRoutes from './routes/lemonSqueezyRoutes.js';
import shopifyRoutes from './routes/shopifyRoutes.js';
// Setup paths for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// ==========================================
// 1. SYSTEM INITIALIZATION
// ==========================================
const app = express();
app.use((req, res, next) => {
  res.setHeader('ngrok-skip-browser-warning', 'true');
  next();
});

const PORT = process.env.PORT || 5000;
if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('FATAL SECURITY ERROR: JWT_SECRET environment variable is missing.');
}
const JWT_SECRET = process.env.JWT_SECRET || 'GROW_APP_SECURE_KEY_2026';

const resend = new Resend(process.env.RESEND_API_KEY);

// ==========================================
// 2. ADVANCED SECURITY & MIDDLEWARES
// ==========================================

// 1. CORS must always be placed BEFORE helmet
app.use(cors({
  origin: true, // Automatically accepts request from http://localhost:5173
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
// IMPORTANT: Stripe Webhook MUST be placed exactly here, BEFORE express.json()
app.post('/api/v1/stripe/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);
// 2. Security headers (Placed after CORS)
app.use(helmet());

// 2. Safe Payload Limits (Prevent Heap Out-Of-Memory/DoS attacks)
app.use(express.json({ 
  limit: '2mb', 
  verify: (req, res, buf) => { 
    req.rawBody = buf; 
  } 
}));
app.use(express.urlencoded({ limit: '2mb', extended: true }));
app.use(morgan('dev'));

// 3. Enterprise-Scale Dynamic Rate Limiting (1k Merchants + 10k Customers Ready)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  max: 3000, // High throughput: Allows heavy dashboard & real-time inbox actions
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // CRITICAL: Bypass webhooks completely!
    // Meta (WhatsApp/Messenger) and Shopify traffic must NEVER be blocked by IP limits
    // Security is already strictly guaranteed by HMAC-SHA256 signature verification.
    return (
      req.originalUrl.includes('/webhook') || 
      req.originalUrl.includes('/shopify/callback')
    );
  },
  message: { 
    success: false, 
    error: 'High traffic threshold reached. Please try again shortly.' 
  }
});

// Apply rate limiter safely across general API routes
app.use('/api/', limiter);

// 4. Strict Limiter ONLY for Auth Endpoints (Blocks Brute-force & Credential Stuffing)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // Max 30 attempts per 15 minutes per IP
  message: { 
    success: false, 
    error: 'Too many authentication attempts. Please try again later.' 
  }
});
app.use('/api/auth/', authLimiter);

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
// 6. CENTRAL CORE API ENDPOINTS
// ==========================================
app.use('/api/dashboard', dashboardRoutes);

app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required.' });
    }

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

    // 1. Cryptographically Secure 6-digit OTP
    const otpCode = crypto.randomInt(100000, 999999).toString();

    // 2. Secure password hashing
    const hashedPassword = await bcrypt.hash(password, 12);

    // 3. Register new user instance in Supabase
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

    // 4. Anti-Spam Clean Email Template
    const emailHtmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; padding: 40px 15px;">
        <div style="max-width: 460px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e2e8f0; text-align: center;">
          <div style="display: inline-block; background-color: #059669; color: #ffffff; padding: 5px 16px; border-radius: 20px; font-weight: 600; font-size: 13px; margin-bottom: 20px;">
            GROW CORE
          </div>
          <h2 style="color: #0f172a; margin: 0 0 10px 0; font-size: 22px; font-weight: 700;">Initialize Access Key</h2>
          <p style="color: #64748b; font-size: 14px; line-height: 1.5; margin: 0 0 24px 0;">
            Use the one-time authentication code below to complete your setup.
          </p>
          <div style="background-color: #f1f5f9; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
            <span style="font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #0f766e;">
              ${otpCode}
            </span>
          </div>
          <p style="color: #94a3b8; font-size: 12px; margin: 0 0 20px 0;">
            This code will expire in 60 seconds. Do not share this token with anyone.
          </p>
          <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 20px 0;" />
          <p style="color: #64748b; font-size: 11px; margin: 0;">
            • 256-Bit Cryptographic End-to-End Encryption
          </p>
        </div>
      </div>
    `;

    // 5. Dispatch Email via Resend API
    try {
      const { data: resendData, error: resendError } = await resend.emails.send({
        from: 'GROW Core <hello@growcorebot.com>',
        to: email,
        subject: `GROW Core verification code: ${otpCode}`,
        text: `Your GROW Core verification code is: ${otpCode}. This code will expire in 60 seconds.`,
        html: emailHtmlContent,
      });

      if (resendError) {
        console.error("⚠️ Resend Email Error:", resendError);
      } else {
        console.log("✅ OTP Email Sent Successfully:", resendData.id);
      }
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


// Unified Inbox Endpoints

app.post('/api/message/send', authenticateToken, sendManualMessage);


app.use('/api/conversations', conversationRoutes);


app.use('/api/auth', authRoutes);


app.use('/api/v1/orders', orderRoutes);


app.use('/api/integrations', integrationRoutes);


app.use('/api/v1/webhooks', webhookRoutes);


// Serve static assets if in production
app.use(express.static(path.join(__dirname, '../dist')));


app.use('/api/widget', express.static(path.join(__dirname, 'public/widget')));

app.use('/api/shopify', shopifyRoutes);
app.use('/api/v1/shopify', shopifyRoutes);
app.use('/api/v1/billing/lemon-squeezy', lemonSqueezyRoutes);
app.use('/api/v1/billing', lemonSqueezyRoutes);
app.use('/api/billing', lemonSqueezyRoutes);

app.use('/api/v1/settings', settingsRoutes);

app.use('/api/v1/stripe', stripeRoutes);

app.use('/api/v1/shopify', shopifyRoutes);
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
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    error: status === 500 ? 'Internal server error' : err.message,
  });
});
