import { describe, test, expect, jest, beforeEach } from '@jest/globals';

// --- Mocks for amazon-cognito-identity-js ---
const mockGetJwtToken = jest.fn();
const mockGetExpiration = jest.fn();
const mockGetAccessToken = jest.fn(() => ({
  getJwtToken: mockGetJwtToken,
  getExpiration: mockGetExpiration,
}));
const mockIsValid = jest.fn();
const mockGetSession = jest.fn();
const mockGetCurrentUser = jest.fn();
const mockAuthenticateUser = jest.fn();
const mockSetAuthenticationFlowType = jest.fn();

jest.unstable_mockModule('amazon-cognito-identity-js', async () => ({
  CognitoUserPool: jest.fn(() => ({
    getCurrentUser: mockGetCurrentUser,
  })),
  CognitoUser: jest.fn(() => ({
    setAuthenticationFlowType: mockSetAuthenticationFlowType,
    authenticateUser: mockAuthenticateUser,
    getSession: mockGetSession,
  })),
  AuthenticationDetails: jest.fn(),
}));

const { getAccessToken, clearSession } = await import('../../src/auth.js');

beforeEach(() => {
  jest.clearAllMocks();
  clearSession();
});

describe('getAccessToken', () => {
  test('calls signIn when no cached session exists', async () => {
    mockGetJwtToken.mockReturnValue('fresh-token');
    mockAuthenticateUser.mockImplementation((details, callbacks) => {
      callbacks.onSuccess({ getAccessToken: mockGetAccessToken });
    });

    const token = await getAccessToken('user@example.com', 'pass');

    expect(token).toBe('fresh-token');
    expect(mockAuthenticateUser).toHaveBeenCalledTimes(1);
  });

  test('returns cached token when still valid (expiry > now + 300s)', async () => {
    // First call: sign in and cache session
    mockGetJwtToken.mockReturnValue('cached-token');
    mockGetExpiration.mockReturnValue(Math.round(Date.now() / 1000) + 3600); // 1h from now
    mockAuthenticateUser.mockImplementation((details, callbacks) => {
      callbacks.onSuccess({ getAccessToken: mockGetAccessToken });
    });

    await getAccessToken('user@example.com', 'pass');
    jest.clearAllMocks();

    // Second call: should reuse cache without calling authenticateUser again
    mockGetJwtToken.mockReturnValue('cached-token');
    mockGetExpiration.mockReturnValue(Math.round(Date.now() / 1000) + 3600);

    const token = await getAccessToken('user@example.com', 'pass');

    expect(token).toBe('cached-token');
    expect(mockAuthenticateUser).not.toHaveBeenCalled();
  });

  test('attempts refresh when cached session is near expiry', async () => {
    // Seed a nearly-expired cached session
    mockGetJwtToken.mockReturnValue('old-token');
    mockGetExpiration.mockReturnValue(Math.round(Date.now() / 1000) + 100); // only 100s left
    mockAuthenticateUser.mockImplementationOnce((details, callbacks) => {
      callbacks.onSuccess({ getAccessToken: mockGetAccessToken });
    });
    await getAccessToken('user@example.com', 'pass');

    // Now try again — expiry is 100s out, below 300s buffer → should try refresh
    mockGetCurrentUser.mockReturnValue(null); // refresh returns null → falls through to signIn
    mockGetJwtToken.mockReturnValue('new-token');
    mockAuthenticateUser.mockImplementationOnce((details, callbacks) => {
      callbacks.onSuccess({ getAccessToken: mockGetAccessToken });
    });

    const token = await getAccessToken('user@example.com', 'pass');
    expect(token).toBe('new-token');
    expect(mockAuthenticateUser).toHaveBeenCalledTimes(2);
  });

  test('falls back to signIn when refresh returns null (no current user)', async () => {
    // Seed an expired session
    mockGetJwtToken.mockReturnValue('expired-token');
    mockGetExpiration.mockReturnValue(Math.round(Date.now() / 1000) + 100);
    mockAuthenticateUser.mockImplementationOnce((details, callbacks) => {
      callbacks.onSuccess({ getAccessToken: mockGetAccessToken });
    });
    await getAccessToken('user@example.com', 'pass');

    mockGetCurrentUser.mockReturnValue(null);
    mockGetJwtToken.mockReturnValue('new-token');
    mockAuthenticateUser.mockImplementationOnce((details, callbacks) => {
      callbacks.onSuccess({ getAccessToken: mockGetAccessToken });
    });

    const token = await getAccessToken('user@example.com', 'pass');
    expect(token).toBe('new-token');
  });

  test('falls back to signIn when refresh returns invalid session', async () => {
    // Seed an expired session
    mockGetJwtToken.mockReturnValue('expired-token');
    mockGetExpiration.mockReturnValue(Math.round(Date.now() / 1000) + 100);
    mockAuthenticateUser.mockImplementationOnce((details, callbacks) => {
      callbacks.onSuccess({ getAccessToken: mockGetAccessToken });
    });
    await getAccessToken('user@example.com', 'pass');

    // Refresh returns invalid session
    const fakeUser = { getSession: (cb) => cb(null, { isValid: () => false }) };
    mockGetCurrentUser.mockReturnValue(fakeUser);
    mockGetJwtToken.mockReturnValue('new-token');
    mockAuthenticateUser.mockImplementationOnce((details, callbacks) => {
      callbacks.onSuccess({ getAccessToken: mockGetAccessToken });
    });

    const token = await getAccessToken('user@example.com', 'pass');
    expect(token).toBe('new-token');
  });

  test('rejects when signIn fails', async () => {
    mockAuthenticateUser.mockImplementation((details, callbacks) => {
      callbacks.onFailure(new Error('Incorrect username or password'));
    });

    await expect(getAccessToken('user@example.com', 'wrong')).rejects.toThrow('Cognito auth failed');
  });
});

describe('clearSession', () => {
  test('forces re-authentication on next call after clearSession', async () => {
    mockGetJwtToken.mockReturnValue('token');
    mockGetExpiration.mockReturnValue(Math.round(Date.now() / 1000) + 3600);
    mockAuthenticateUser.mockImplementation((details, callbacks) => {
      callbacks.onSuccess({ getAccessToken: mockGetAccessToken });
    });

    await getAccessToken('user@example.com', 'pass');
    clearSession();

    await getAccessToken('user@example.com', 'pass');
    expect(mockAuthenticateUser).toHaveBeenCalledTimes(2);
  });
});
