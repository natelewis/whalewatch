// Auth0 configuration for testing
export const auth0Config = {
  domain: process.env.AUTH0_DOMAIN || 'test-tenant.auth0.com',
  clientId: process.env.AUTH0_CLIENT_ID || 'test-client-id',
  clientSecret: process.env.AUTH0_CLIENT_SECRET || 'test-client-secret',
  audience: process.env.AUTH0_AUDIENCE || 'test-audience',
};

export const verifyAuth0Token = jest.fn();
export const createOrUpdateUser = jest.fn();
export const generateToken = jest.fn();
