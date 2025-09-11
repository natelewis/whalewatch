import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

// Google OAuth configuration
const googleConfig = {
  clientID: process.env.GOOGLE_CLIENT_ID || 'your_google_client_id_here',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'your_google_client_secret_here',
  callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3001/api/auth/google/callback'
};

// Check if Google OAuth is properly configured
console.log('🔍 Environment check:');
console.log('  GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? '✅ Set' : '❌ Missing');
console.log('  GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? '✅ Set' : '❌ Missing');
console.log('  GOOGLE_CALLBACK_URL:', process.env.GOOGLE_CALLBACK_URL || 'Using default');

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.warn('⚠️  Google OAuth not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env file');
  console.warn('   You can copy server/env.example to server/.env and update the values');
}

// Mock user database - in production, use a real database
const users: Array<{
  id: string;
  googleId: string;
  email: string;
  name: string;
  picture?: string;
}> = [];

// Configure Google OAuth strategy only if properly configured
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  console.log('✅ Initializing Google OAuth strategy');
  console.log('  Config:', {
    clientID: googleConfig.clientID,
    clientSecret: googleConfig.clientSecret ? '***' : 'Missing',
    callbackURL: googleConfig.callbackURL
  });
  
  try {
    passport.use(new GoogleStrategy(googleConfig, async (accessToken, refreshToken, profile, done) => {
    try {
      console.log('🔍 Google OAuth callback received:', profile.id);
      const googleId = profile.id;
      const email = profile.emails?.[0]?.value;
      const name = profile.displayName;
      const picture = profile.photos?.[0]?.value;

      if (!email) {
        return done(new Error('No email found in Google profile'), undefined);
      }

      // Check if user already exists
      let user = users.find(u => u.googleId === googleId);
      
      if (user) {
        // Update existing user
        user.email = email;
        user.name = name;
        user.picture = picture;
        return done(null, user);
      }

      // Create new user
      const newUser = {
        id: `user_${Date.now()}`,
        googleId,
        email,
        name,
        picture
      };

      users.push(newUser);
      return done(null, newUser);
    } catch (error) {
      return done(error, undefined);
    }
  }));
  console.log('✅ Google OAuth strategy initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing Google OAuth strategy:', error);
  }
} else {
  console.warn('⚠️  Google OAuth strategy not initialized due to missing configuration');
}

// Serialize user for session
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser((id: string, done) => {
  const user = users.find(u => u.id === id);
  done(null, user || null);
});

// Generate JWT token for user
export const generateToken = (user: any): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET not configured');
  }

  return jwt.sign(
    { 
      userId: user.id, 
      email: user.email,
      googleId: user.googleId 
    },
    secret,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );
};

export { googleConfig };
