# Auth0 Setup Guide

This guide will help you set up Auth0 authentication for the WhaleWatch application.

## Prerequisites

- Auth0 account (free tier available)
- Node.js and npm installed
- WhaleWatch application cloned and dependencies installed

## Step 1: Create Auth0 Application

1. Go to the [Auth0 Dashboard](https://manage.auth0.com/)
2. Create a new application:
   - Click "Applications" > "Create Application"
   - Name: "WhaleWatch"
   - Type: "Single Page Application"
   - Click "Create"

3. Configure the application settings:
   - **Allowed Callback URLs**: `http://localhost:5173/auth/callback`
   - **Allowed Logout URLs**: `http://localhost:5173`
   - **Allowed Web Origins**: `http://localhost:5173`
   - **Allowed Origins (CORS)**: `http://localhost:5173`

4. Note down your credentials:
   - **Domain**: `your-tenant.auth0.com`
   - **Client ID**: `your_client_id`
   - **Client Secret**: `your_client_secret` (for backend)

## Step 2: Configure Auth0 APIs

1. Go to "APIs" in the Auth0 Dashboard
2. Create a new API:
   - Name: "WhaleWatch API"
   - Identifier: `https://your-tenant.auth0.com/api/v2/`
   - Signing Algorithm: RS256
   - Click "Create"

3. Note the **API Identifier** (this will be your audience)

## Step 3: Configure Environment Variables

1. Copy the server environment example:
   ```bash
   cp server/env.example server/.env
   ```

2. Update `server/.env` with your Auth0 credentials:
   ```env
   # Auth0 Configuration
   AUTH0_DOMAIN=your-tenant.auth0.com
   AUTH0_CLIENT_ID=your_auth0_client_id_here
   AUTH0_CLIENT_SECRET=your_auth0_client_secret_here
   AUTH0_AUDIENCE=https://your-tenant.auth0.com/api/v2/
   AUTH0_ISSUER=https://your-tenant.auth0.com/

   # JWT Configuration
   JWT_SECRET=your_jwt_secret_here
   JWT_EXPIRES_IN=24h

   # Other existing configuration...
   ```

3. Copy the dashboard environment example:
   ```bash
   cp dashboard/env.example dashboard/.env
   ```

4. Update `dashboard/.env` with your Auth0 credentials:
   ```env
   # API Configuration
   VITE_API_URL=http://localhost:3001
   VITE_WS_URL=ws://localhost:3001

   # App Configuration
   VITE_APP_NAME=WhaleWatch
   VITE_APP_VERSION=1.0.0

   # Auth0 Configuration
   VITE_AUTH0_DOMAIN=your-tenant.auth0.com
   VITE_AUTH0_CLIENT_ID=your_auth0_client_id_here
   VITE_AUTH0_AUDIENCE=https://your-tenant.auth0.com/api/v2/
   ```

## Step 4: Install Dependencies

1. Install server dependencies:
   ```bash
   cd server
   npm install
   ```

2. Install dashboard dependencies:
   ```bash
   cd dashboard
   npm install
   ```

## Step 5: Start the Application

1. Start the server:
   ```bash
   cd server
   npm run dev
   ```

2. Start the dashboard (in a new terminal):
   ```bash
   cd dashboard
   npm run dev
   ```

## Step 6: Test Auth0 Flow

1. Open your browser and go to `http://localhost:5173`
2. Click "Continue with Auth0"
3. You should be redirected to Auth0's login page
4. Sign up or log in with your Auth0 account
5. After authorizing, you'll be redirected back to the application
6. You should now be logged in and see the dashboard

## Production Setup

For production deployment:

1. Update Auth0 application settings:
   - **Allowed Callback URLs**: `https://yourdomain.com/auth/callback`
   - **Allowed Logout URLs**: `https://yourdomain.com`
   - **Allowed Web Origins**: `https://yourdomain.com`
   - **Allowed Origins (CORS)**: `https://yourdomain.com`

2. Update environment variables with production URLs
3. Set `NODE_ENV=production` in your server environment
4. Use strong, unique secrets for production

## Troubleshooting

### Common Issues

1. **"Invalid redirect_uri" error**:
   - Ensure the callback URL in Auth0 matches exactly
   - Check for trailing slashes or protocol mismatches

2. **"Invalid client" error**:
   - Verify your `AUTH0_CLIENT_ID` and `AUTH0_CLIENT_SECRET`
   - Ensure the credentials are for the correct application

3. **"Invalid audience" error**:
   - Check that `AUTH0_AUDIENCE` matches your API identifier
   - Ensure the API is properly configured in Auth0

4. **CORS errors**:
   - Verify `Allowed Origins (CORS)` in Auth0 application settings
   - Check that `CORS_ORIGIN` matches your frontend URL

5. **Token verification fails**:
   - Ensure `AUTH0_DOMAIN` and `AUTH0_ISSUER` are correct
   - Check that the JWT secret is properly configured

### Debug Mode

To enable debug logging, set:
```env
DEBUG=auth0:*
```

## Security Notes

- Never commit `.env` files to version control
- Use strong, unique secrets for production
- Regularly rotate your Auth0 credentials
- Monitor Auth0 usage in the dashboard
- Consider implementing rate limiting for auth endpoints

## Auth0 Scopes

The application requests the following scopes:
- `openid`: Required for OpenID Connect
- `profile`: Access to basic profile information
- `email`: Access to email address

These are the minimum required scopes for user authentication.

## User Data

The application stores the following user data from Auth0:
- Auth0 ID (sub claim)
- Email address
- Display name
- Profile picture (optional)

This data is stored in memory for the demo. In production, you should use a proper database.

## Advanced Configuration

### Custom Login Page

You can customize the Auth0 login page:
1. Go to "Branding" > "Universal Login" in Auth0 Dashboard
2. Customize the login page with your branding
3. Configure custom domains if needed

### Social Connections

To enable social logins (Google, GitHub, etc.):
1. Go to "Authentication" > "Social" in Auth0 Dashboard
2. Enable the desired social connections
3. Configure the social provider credentials

### Rules and Hooks

You can add custom logic using Auth0 Rules or Hooks:
1. Go to "Auth0 Pipeline" > "Rules" or "Hooks"
2. Create custom rules for user data transformation
3. Add custom logic for user registration

## Support

- [Auth0 Documentation](https://auth0.com/docs)
- [Auth0 Community](https://community.auth0.com/)
- [Auth0 Support](https://support.auth0.com/)
