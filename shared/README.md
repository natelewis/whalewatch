# @whalewatch/shared

Shared types and utilities for the WhaleWatch project, including robust error handling using the neverthrow library.

## Installation

```bash
npm install @whalewatch/shared
```

## Error Handling

This module provides a robust, type-safe error handling system using the neverthrow library. It replaces complex try-catch patterns with a clean, functional approach.

### Quick Start

```typescript
import { safeCallAsync, createUserFriendlyMessage } from '@whalewatch/shared';

// Replace this complex pattern:
try {
  const response = await apiService.getAccount();
  setAccount(response.account);
} catch (err: unknown) {
  const errorMessage =
    err instanceof Error &&
    'response' in err &&
    typeof err.response === 'object' &&
    err.response !== null &&
    'data' in err.response &&
    typeof err.response.data === 'object' &&
    err.response.data !== null &&
    'error' in err.response.data &&
    typeof err.response.data.error === 'string'
      ? err.response.data.error
      : 'Failed to load account data';
  setError(errorMessage);
}

// With this simple pattern:
const result = await safeCallAsync(async () => {
  return apiService.getAccount();
});

if (result.isOk()) {
  setAccount(result.value.account);
} else {
  const userMessage = createUserFriendlyMessage(result.error);
  setError(userMessage);
}
```

### Available Utilities

- `safeCall(fn)` - Wrap sync functions that might throw
- `safeCallAsync(fn)` - Wrap async functions that might throw
- `parseError(error)` - Parse any error into a structured format
- `createUserFriendlyMessage(error)` - Convert technical errors to user-friendly messages
- `createReactErrorHandler(setError)` - Create React error handlers
- `createExpressErrorHandler(res)` - Create Express error handlers

### Error Types

The system automatically categorizes errors into types like:

- `NETWORK_ERROR`
- `VALIDATION_ERROR`
- `AUTHENTICATION_ERROR`
- `AUTHORIZATION_ERROR`
- `RATE_LIMIT_ERROR`
- `SERVER_ERROR`
- `ALPACA_API_ERROR`
- `QUESTDB_ERROR`

### Benefits

1. **Type Safety** - No more `unknown` types
2. **Consistency** - Same pattern across dashboard and server
3. **User-Friendly** - Automatic error message conversion
4. **Maintainable** - Much cleaner code
5. **Robust** - Handles all edge cases automatically

See `examples/simpleExamples.ts` for more usage patterns and `MIGRATION_GUIDE.md` for detailed migration instructions.
