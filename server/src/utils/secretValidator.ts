import dotenv from 'dotenv';
dotenv.config();

export interface SecretConfig {
  name: string;
  value: string | undefined;
  required: boolean;
  description: string;
  maskValue?: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  missingSecrets: string[];
  warnings: string[];
  summary: {
    total: number;
    required: number;
    missing: number;
    present: number;
  };
}

/**
 * Validates all required secrets and environment variables
 * Uses a processing array pattern for comprehensive validation
 */
export class SecretValidator {
  private secrets: SecretConfig[] = [];

  constructor() {
    this.initializeSecrets();
  }

  private initializeSecrets(): void {
    this.secrets = [
      // Alpaca API Configuration
      {
        name: 'ALPACA_API_KEY',
        value: process.env.ALPACA_API_KEY,
        required: true,
        description: 'Alpaca API key for trading operations',
        maskValue: true,
      },
      {
        name: 'ALPACA_SECRET_KEY',
        value: process.env.ALPACA_SECRET_KEY,
        required: true,
        description: 'Alpaca secret key for trading operations',
        maskValue: true,
      },
      {
        name: 'ALPACA_BASE_URL',
        value: process.env.ALPACA_BASE_URL,
        required: false,
        description: 'Alpaca base URL (defaults to paper trading)',
      },
      {
        name: 'ALPACA_DATA_URL',
        value: process.env.ALPACA_DATA_URL,
        required: false,
        description: 'Alpaca data URL (defaults to data.alpaca.markets)',
      },

      // JWT Configuration
      {
        name: 'JWT_SECRET',
        value: process.env.JWT_SECRET,
        required: true,
        description: 'JWT secret for token signing',
        maskValue: true,
      },
      {
        name: 'JWT_EXPIRES_IN',
        value: process.env.JWT_EXPIRES_IN,
        required: false,
        description: 'JWT token expiration time (defaults to 24h)',
      },

      // Google OAuth Configuration
      {
        name: 'GOOGLE_CLIENT_ID',
        value: process.env.GOOGLE_CLIENT_ID,
        required: true,
        description: 'Google OAuth client ID for authentication',
      },
      {
        name: 'GOOGLE_CLIENT_SECRET',
        value: process.env.GOOGLE_CLIENT_SECRET,
        required: true,
        description: 'Google OAuth client secret for authentication',
        maskValue: true,
      },
      {
        name: 'GOOGLE_CALLBACK_URL',
        value: process.env.GOOGLE_CALLBACK_URL,
        required: false,
        description: 'Google OAuth callback URL (defaults to localhost)',
      },

      // Session Configuration
      {
        name: 'SESSION_SECRET',
        value: process.env.SESSION_SECRET,
        required: true,
        description: 'Session secret for secure sessions',
        maskValue: true,
      },

      // Server Configuration
      {
        name: 'PORT',
        value: process.env.PORT,
        required: false,
        description: 'Server port (defaults to 3001)',
      },
      {
        name: 'NODE_ENV',
        value: process.env.NODE_ENV,
        required: false,
        description: 'Node environment (development/production)',
      },

      // CORS Configuration
      {
        name: 'CORS_ORIGIN',
        value: process.env.CORS_ORIGIN,
        required: false,
        description: 'CORS origin URL (defaults to localhost:5173)',
      },

      // Test Configuration (only required in test environment)
      {
        name: 'TEST_ALPACA_API_KEY',
        value: process.env.TEST_ALPACA_API_KEY,
        required: process.env.NODE_ENV === 'test',
        description: 'Test Alpaca API key for testing',
      },
      {
        name: 'TEST_ALPACA_SECRET_KEY',
        value: process.env.TEST_ALPACA_SECRET_KEY,
        required: process.env.NODE_ENV === 'test',
        description: 'Test Alpaca secret key for testing',
      },
    ];
  }

  /**
   * Validates all secrets and returns comprehensive results
   */
  public validateSecrets(): ValidationResult {
    const missingSecrets: string[] = [];
    const warnings: string[] = [];
    let presentCount = 0;
    let requiredCount = 0;

    console.log('🔍 Environment Configuration Check:');
    console.log('=====================================');

    // Process each secret in the array
    this.secrets.forEach((secret) => {
      const isPresent = Boolean(secret.value && secret.value.trim() !== '');
      const isRequired = secret.required;
      
      if (isRequired) {
        requiredCount++;
      }

      if (isPresent) {
        presentCount++;
        const displayValue = secret.maskValue && secret.value 
          ? `${secret.value.substring(0, 4)}***` 
          : secret.value;
        console.log(`  ${secret.name}: ${isPresent ? '✅ Set' : '❌ Missing'} ${displayValue ? `(${displayValue})` : ''}`);
      } else {
        if (isRequired) {
          missingSecrets.push(secret.name);
          console.log(`  ${secret.name}: ❌ Missing (Required)`);
        } else {
          console.log(`  ${secret.name}: ⚠️  Missing (Optional)`);
          warnings.push(`${secret.name} is not set (optional)`);
        }
      }
    });

    const isValid = missingSecrets.length === 0;

    if (!isValid) {
      console.log('\n⚠️  Missing Required Configuration:');
      missingSecrets.forEach(secret => {
        const secretConfig = this.secrets.find(s => s.name === secret);
        console.log(`  - ${secret}: ${secretConfig?.description || 'Required secret'}`);
      });
      console.log('\n💡 To fix this:');
      console.log('  1. Copy server/env.example to server/.env');
      console.log('  2. Update the values in server/.env with your actual secrets');
      console.log('  3. Restart the server');
    } else {
      console.log('\n✅ All required configuration is present!');
    }

    if (warnings.length > 0) {
      console.log('\n⚠️  Optional Configuration Warnings:');
      warnings.forEach(warning => console.log(`  - ${warning}`));
    }

    console.log('=====================================\n');

    return {
      isValid,
      missingSecrets,
      warnings,
      summary: {
        total: this.secrets.length,
        required: requiredCount,
        missing: missingSecrets.length,
        present: presentCount,
      },
    };
  }

  /**
   * Gets a specific secret value with validation
   */
  public getSecret(name: string): string | undefined {
    const secret = this.secrets.find(s => s.name === name);
    return secret?.value;
  }

  /**
   * Checks if a specific secret is present
   */
  public hasSecret(name: string): boolean {
    const secret = this.secrets.find(s => s.name === name);
    return Boolean(secret?.value && secret.value.trim() !== '');
  }

  /**
   * Gets all secrets for a specific category
   */
  public getSecretsByCategory(category: 'auth' | 'trading' | 'server' | 'test'): SecretConfig[] {
    const categoryMap = {
      auth: ['JWT_SECRET', 'JWT_EXPIRES_IN', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_CALLBACK_URL', 'SESSION_SECRET'],
      trading: ['ALPACA_API_KEY', 'ALPACA_SECRET_KEY', 'ALPACA_BASE_URL', 'ALPACA_DATA_URL'],
      server: ['PORT', 'NODE_ENV', 'CORS_ORIGIN'],
      test: ['TEST_ALPACA_API_KEY', 'TEST_ALPACA_SECRET_KEY'],
    };

    return this.secrets.filter(secret => 
      categoryMap[category].includes(secret.name)
    );
  }

  /**
   * Gets all secrets that are currently missing
   */
  public getMissingSecrets(): SecretConfig[] {
    return this.secrets.filter(secret => 
      secret.required && (!secret.value || secret.value.trim() === '')
    );
  }

  /**
   * Gets all secrets that are currently present
   */
  public getPresentSecrets(): SecretConfig[] {
    return this.secrets.filter(secret => 
      secret.value && secret.value.trim() !== ''
    );
  }

  /**
   * Gets all optional secrets that are missing
   */
  public getMissingOptionalSecrets(): SecretConfig[] {
    return this.secrets.filter(secret => 
      !secret.required && (!secret.value || secret.value.trim() === '')
    );
  }

  /**
   * Validates a specific secret by name
   */
  public validateSecret(name: string): { isValid: boolean; message: string } {
    const secret = this.secrets.find(s => s.name === name);
    
    if (!secret) {
      return { isValid: false, message: `Secret '${name}' not found` };
    }

    const isPresent = Boolean(secret.value && secret.value.trim() !== '');
    
    if (secret.required && !isPresent) {
      return { isValid: false, message: `Required secret '${name}' is missing` };
    }

    if (!secret.required && !isPresent) {
      return { isValid: true, message: `Optional secret '${name}' is not set` };
    }

    return { isValid: true, message: `Secret '${name}' is present` };
  }

  /**
   * Gets a summary of all secrets without console output
   */
  public getValidationSummary(): ValidationResult {
    const missingSecrets: string[] = [];
    const warnings: string[] = [];
    let presentCount = 0;
    let requiredCount = 0;

    this.secrets.forEach((secret) => {
      const isPresent = Boolean(secret.value && secret.value.trim() !== '');
      const isRequired = secret.required;
      
      if (isRequired) {
        requiredCount++;
      }

      if (isPresent) {
        presentCount++;
      } else {
        if (isRequired) {
          missingSecrets.push(secret.name);
        } else {
          warnings.push(`${secret.name} is not set (optional)`);
        }
      }
    });

    return {
      isValid: missingSecrets.length === 0,
      missingSecrets,
      warnings,
      summary: {
        total: this.secrets.length,
        required: requiredCount,
        missing: missingSecrets.length,
        present: presentCount,
      },
    };
  }
}

// Export a singleton instance
export const secretValidator = new SecretValidator();
