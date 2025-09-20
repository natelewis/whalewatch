import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import jwt from 'jsonwebtoken';
import { secretValidator } from '../utils/secretValidator';

// Google OAuth configuration
const googleConfig = {
  clientID: secretValidator.getSecret('GOOGLE_CLIENT_ID') || 'your_google_client_id_here',
  clientSecret:
    secretValidator.getSecret('GOOGLE_CLIENT_SECRET') || 'your_google_client_secret_here',
  callbackURL:
    secretValidator.getSecret('GOOGLE_CALLBACK_URL') ||
    'http://localhost:3001/api/auth/google/callback',
};

// Mock user database - in production, use a real database
const users: Array<{
  id: string;
  googleId: string;
  email: string;
  name: string;
  picture?: string;
}> = [];

// Configure Google OAuth strategy only if properly configured
if (
  secretValidator.hasSecret('GOOGLE_CLIENT_ID') &&
  secretValidator.hasSecret('GOOGLE_CLIENT_SECRET')
) {
  console.log('✅ Initializing Google OAuth strategy');
  console.log('  Config:', {
    clientID: googleConfig.clientID,
    clientSecret: googleConfig.clientSecret ? '***' : 'Missing',
    callbackURL: googleConfig.callbackURL,
  });

  try {
    passport.use(
      new GoogleStrategy(googleConfig, async (accessToken, refreshToken, profile, done) => {
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
          const user = users.find((u) => u.googleId === googleId);

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
            picture,
          };

          users.push(newUser);
          return done(null, newUser);
        } catch (error) {
          return done(error, undefined);
        }
      })
    );
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
  const user = users.find((u) => u.id === id);
  done(null, user || null);
});

// Generate JWT token for user
export const generateToken = (user: any): string => {
  const secret = secretValidator.getSecret('JWT_SECRET');
  if (!secret) {
    throw new Error('JWT_SECRET not configured');
  }

  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      googleId: user.googleId,
    },
    secret,
    { expiresIn: secretValidator.getSecret('JWT_EXPIRES_IN') || '24h' }
  );
};

export { googleConfig };
