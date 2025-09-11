import { Router, Request, Response } from 'express';
import passport from 'passport';
import jwt from 'jsonwebtoken';
import { generateToken } from '../config/passport';

const router = Router();

// Test endpoint to check environment variables
router.get('/test-env', (req: Request, res: Response) => {
  res.json({
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? 'Set' : 'Missing',
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ? 'Set' : 'Missing',
    GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL || 'Using default'
  });
});

// Test endpoint to check if Google strategy is registered
router.get('/test-strategy', (req: Request, res: Response) => {
  const strategies = Object.keys(passport._strategies || {});
  res.json({
    registeredStrategies: strategies,
    hasGoogleStrategy: strategies.includes('google')
  });
});

// Google OAuth login endpoint
router.get('/google', passport.authenticate('google', {
  scope: ['profile', 'email']
}));

// Google OAuth callback endpoint
router.get('/google/callback', 
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const token = generateToken(user);
      
      // Redirect to frontend with token
      const frontendUrl = process.env.CORS_ORIGIN || 'http://localhost:5173';
      res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
    } catch (error) {
      console.error('OAuth callback error:', error);
      res.redirect(`${process.env.CORS_ORIGIN || 'http://localhost:5173'}/login?error=auth_failed`);
    }
  }
);

// Verify token endpoint
router.get('/verify', (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET not configured');
    }
    
    const decoded = jwt.verify(token, secret) as any;
    
    res.json({
      user: {
        id: decoded.userId,
        email: decoded.email,
        googleId: decoded.googleId
      }
    });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Logout endpoint
router.post('/logout', (req: Request, res: Response) => {
  res.json({ message: 'Logged out successfully' });
});

export { router as authRoutes };
