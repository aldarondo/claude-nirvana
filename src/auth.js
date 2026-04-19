/**
 * AWS Cognito authentication for Nirvana HP API
 * Pool: us-east-2_zqlraOyU4 | Client: 3nducehok3t5n23fa76gfj6ulh
 */

import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
} from 'amazon-cognito-identity-js';

const USER_POOL_ID = 'us-east-2_zqlraOyU4';
const CLIENT_ID = '3nducehok3t5n23fa76gfj6ulh';

const pool = new CognitoUserPool({
  UserPoolId: USER_POOL_ID,
  ClientId: CLIENT_ID,
});

let cachedSession = null;

/**
 * Sign in and cache the session. Re-uses cached session if still valid.
 * @param {string} username - Nirvana account email
 * @param {string} password - Nirvana account password
 * @returns {Promise<string>} JWT access token
 */
export async function getAccessToken(username, password) {
  // Try to refresh existing session first
  if (cachedSession) {
    const expiry = cachedSession.getAccessToken().getExpiration();
    const now = Math.round(Date.now() / 1000);
    if (expiry - 60 > now) {
      return cachedSession.getAccessToken().getJwtToken();
    }
    // Try to refresh
    try {
      const token = await refreshSession();
      if (token) return token;
    } catch (_) {
      cachedSession = null;
    }
  }

  return signIn(username, password);
}

function signIn(username, password) {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: username, Pool: pool });
    const authDetails = new AuthenticationDetails({
      Username: username,
      Password: password,
    });

    user.authenticateUser(authDetails, {
      onSuccess(session) {
        cachedSession = session;
        resolve(session.getAccessToken().getJwtToken());
      },
      onFailure(err) {
        reject(new Error(`Cognito auth failed: ${err.message}`));
      },
    });
  });
}

function refreshSession() {
  return new Promise((resolve, reject) => {
    const user = pool.getCurrentUser();
    if (!user) return resolve(null);

    user.getSession((err, session) => {
      if (err || !session?.isValid()) return resolve(null);
      cachedSession = session;
      resolve(session.getAccessToken().getJwtToken());
    });
  });
}

export function clearSession() {
  cachedSession = null;
}
