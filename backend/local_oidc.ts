import {
  workerGlobals,
  WorkerRequest,
  WorkerResponse,
  type Env,
  type ExecutionContext,
  type SimpleHandler,
} from "./types";
import * as jose from "jose";
import { v5 as uuidv5 } from "uuid";
import { getPassport, parseToken } from "./auth";

export interface OpenIdConfiguration {
  issuer: string;
  authorization_endpoint: string;
  jwks_uri: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  end_session_endpoint: string;
  scopes_supported: string[];
  response_types_supported: string[];
  token_endpoint_auth_methods_supported: string[];
}

interface UserData {
  firstName: string;
  lastName: string;
  email: string;
}

export async function generatePEM(): Promise<string> {
  // Use jose library to generate a key that can be exported as JWK
  const { privateKey } = await jose.generateKeyPair("RS256", {
    extractable: true,
  });

  // Export as PKCS8 PEM
  const pem = await jose.exportPKCS8(privateKey);
  return pem;
}

export async function ensurePEM(env: Env): Promise<string> {
  // Check if a PEM already exists in the database
  const existing = await env.DB.prepare(
    `
    SELECT value FROM settings WHERE key = 'local_oidc_pem'
  `
  ).first<{ value: string }>();

  if (existing) {
    return existing.value;
  }

  console.log("Generating new PEM");

  // Generate a new PEM if none exists
  const privateKey = await generatePEM();

  const result = await env.DB.prepare(
    `
    INSERT INTO settings (key, value)
    VALUES ('local_oidc_pem', ?)
    ON CONFLICT(key) DO NOTHING
    RETURNING value
  `
  )
    .bind(privateKey)
    .first<{ value: string }>();

  if (!result) {
    // If there was a conflict, then nothing is returned, so we need to query again
    const existing = await env.DB.prepare(
      `
      SELECT value FROM settings WHERE key = 'local_oidc_pem'
    `
    ).first<{ value: string }>();
    if (!existing) {
      throw new Error("Failed to generate PEM");
    }
    return existing.value;
  }

  return result.value;
}

function getBaseUrl(request: WorkerRequest): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function generateOpenIdConfiguration(
  baseUrl: string,
  env: Env
): OpenIdConfiguration {
  return {
    issuer: `${baseUrl}/local_oidc`,
    authorization_endpoint:
      env.LOCAL_OIDC_AUTHORIZATION_ENDPOINT ??
      "http://localhost:5173/local_oidc/authorize",
    jwks_uri: `${baseUrl}/local_oidc/.well-known/jwks.json`,
    token_endpoint: `${baseUrl}/local_oidc/token`,
    userinfo_endpoint: `${baseUrl}/local_oidc/userinfo`,
    end_session_endpoint: `${baseUrl}/local_oidc/logout`,
    scopes_supported: ["profile", "email", "openid"],
    response_types_supported: ["code"],
    token_endpoint_auth_methods_supported: ["client_secret_post"],
  };
}

async function handleOpenIdConfiguration(
  request: WorkerRequest,
  env: Env
): Promise<WorkerResponse> {
  const baseUrl = getBaseUrl(request);
  const config = generateOpenIdConfiguration(baseUrl, env);

  return new workerGlobals.Response(JSON.stringify(config, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function getUserId(userData: UserData): string {
  // We want the userId to always be the same for a given email
  const nullNamespace = "00000000-0000-0000-0000-000000000000";
  return uuidv5(userData.email.toLowerCase(), nullNamespace);
}

async function generateTokens(
  userData: UserData,
  env: Env
): Promise<{
  access_token: string;
  token_type: string;
  refresh_token: string;
  id_token: string;
  expires_in: number;
  scope: string;
}> {
  const pem = await ensurePEM(env);
  const privateKey = await jose.importPKCS8(pem, "RS256", {
    extractable: true,
  });
  const userId = getUserId(userData);
  const now = Math.floor(Date.now() / 1000);

  const basePayload = {
    sub: userId,
    given_name: userData.firstName,
    family_name: userData.lastName,
    email: userData.email,
    iss: env.AUTH_ISSUER,
    aud: "local-anode-client",
    iat: now,
  };

  const accessTokenPayload = {
    ...basePayload,
    exp: now + 5 * 60, // 5 minutes
  };

  // Use a new timestamp for refresh token to ensure it's different
  const refreshNow = Math.floor(Date.now() / 1000);
  const refreshTokenPayload = {
    ...basePayload,
    iat: refreshNow,
    exp: refreshNow + 365 * 24 * 60 * 60, // 1 year
  };

  const accessToken = await new jose.SignJWT(accessTokenPayload)
    .setProtectedHeader({ alg: "RS256", kid: "1" })
    .sign(privateKey);

  const refreshToken = await new jose.SignJWT(refreshTokenPayload)
    .setProtectedHeader({ alg: "RS256", kid: "1" })
    .sign(privateKey);

  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 300,
    refresh_token: refreshToken,
    id_token: accessToken,
    scope: "openid profile email",
  };
}

async function handleToken(
  request: WorkerRequest,
  env: Env
): Promise<WorkerResponse> {
  // Parse form data instead of URL search params
  const formData = await request.formData();
  const clientId = formData.get("client_id") as string;
  const redirectUri = formData.get("redirect_uri") as string;
  const code = formData.get("code") as string;
  const grantType = formData.get("grant_type") as string;
  const refreshToken = formData.get("refresh_token") as string;

  if (clientId !== "local-anode-client") {
    console.log("Invalid client_id", clientId);
    return new workerGlobals.Response("Invalid client_id", { status: 400 });
  }

  if (grantType === "authorization_code") {
    if (!redirectUri || !redirectUri.startsWith("http://localhost")) {
      console.log("Invalid redirect_uri", redirectUri);
      return new workerGlobals.Response("Invalid redirect_uri", {
        status: 400,
      });
    }

    if (!code) {
      console.log("Missing code parameter", code);
      return new workerGlobals.Response("Missing code parameter", {
        status: 400,
      });
    }

    let userData: UserData;
    try {
      const decodedCode = atob(code);
      userData = JSON.parse(decodedCode) as UserData;

      if (!userData.firstName || !userData.lastName || !userData.email) {
        console.log("Invalid code: missing required fields", userData);
        return new workerGlobals.Response(
          "Invalid code: missing required fields",
          {
            status: 400,
          }
        );
      }
    } catch {
      console.log("Invalid code: not a valid BASE64 encoded JSON", code);
      return new workerGlobals.Response(
        "Invalid code: not a valid BASE64 encoded JSON",
        {
          status: 400,
        }
      );
    }

    try {
      const tokens = await generateTokens(userData, env);

      // Store user data for silent refresh session tracking
      if (env.DB) {
        try {
          await env.DB.prepare(
            `INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`
          )
            .bind("local-auth-registration", JSON.stringify(userData))
            .run();
        } catch (error) {
          console.warn("Failed to store user session data:", error);
          // Continue anyway - this is just for silent refresh optimization
        }
      }

      return new workerGlobals.Response(JSON.stringify(tokens), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      });
    } catch (error) {
      console.error("Error creating tokens:", error);
      return new workerGlobals.Response("Internal Server Error", {
        status: 500,
      });
    }
  } else if (grantType === "refresh_token") {
    if (!refreshToken) {
      console.log("Missing refresh_token parameter");
      return new workerGlobals.Response("Missing refresh_token parameter", {
        status: 400,
      });
    }

    try {
      // Verify the refresh token using the public key
      const { user } = await parseToken(refreshToken, env);

      const { givenName, familyName, email } = user;

      // Generate new tokens
      const tokens = await generateTokens(
        {
          firstName: givenName ?? "",
          lastName: familyName ?? "",
          email: email ?? "",
        },
        env
      );

      return new workerGlobals.Response(JSON.stringify(tokens), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      });
    } catch (error) {
      console.error("Error verifying refresh token:", error);
      return new workerGlobals.Response("Invalid refresh token", {
        status: 400,
      });
    }
  } else {
    console.log("Invalid grant_type", grantType);
    return new workerGlobals.Response("Invalid grant_type", { status: 400 });
  }
}

async function handleUserinfo(
  request: WorkerRequest,
  env: Env
): Promise<WorkerResponse> {
  let jwt: jose.JWTPayload;
  try {
    const parsed = await getPassport(request, env);
    jwt = parsed.jwt;
  } catch (error) {
    console.error("Error verifying access token:", error);
    return new workerGlobals.Response("Invalid access token", {
      status: 401,
      headers: {
        "WWW-Authenticate": "Bearer",
      },
    });
  }
  const responseBody = JSON.stringify(jwt);

  return new workerGlobals.Response(responseBody, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

interface JWK {
  kty: string;
  use: string;
  kid: string;
  n: string;
  e: string;
}

interface JWKS {
  keys: JWK[];
}

async function getJwks(env: Env): Promise<JWKS> {
  const pem = await ensurePEM(env);
  const privateKey = await jose.importPKCS8(pem, "RS256", {
    extractable: true,
  });

  const publicKey = await jose.exportJWK(privateKey);

  const jwk: JWK = {
    kty: publicKey.kty!,
    use: "sig",
    kid: "1",
    n: publicKey.n!,
    e: publicKey.e!,
  };

  return {
    keys: [jwk],
  };
}

async function handleJwks(
  _request: WorkerRequest,
  env: Env
): Promise<WorkerResponse> {
  try {
    const jwks = await getJwks(env);

    return new workerGlobals.Response(JSON.stringify(jwks, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Error generating JWKS:", error);
    return new workerGlobals.Response("Internal Server Error", { status: 500 });
  }
}

async function handleAuthorize(
  request: WorkerRequest,
  env: Env
): Promise<WorkerResponse> {
  const url = new URL(request.url);
  const params = url.searchParams;

  const responseType = params.get("response_type");
  const clientId = params.get("client_id");
  const redirectUri = params.get("redirect_uri");
  const scope = params.get("scope");
  const state = params.get("state");
  const codeChallenge = params.get("code_challenge");
  const codeChallengeMethod = params.get("code_challenge_method");
  const prompt = params.get("prompt");

  // Validate required parameters
  if (!responseType || responseType !== "code") {
    return new workerGlobals.Response("Invalid response_type", { status: 400 });
  }

  if (!clientId || clientId !== "local-anode-client") {
    return new workerGlobals.Response("Invalid client_id", { status: 400 });
  }

  if (!redirectUri) {
    return new workerGlobals.Response("Missing redirect_uri", { status: 400 });
  }

  // Handle silent refresh (prompt=none)
  if (prompt === "none") {
    // For silent refresh, check if user has valid session
    // For local dev, check if localStorage data exists by looking for stored registration
    let userData: UserData | null = null;

    try {
      // Check if there's a stored local auth registration
      // This simulates checking for an active session
      if (env.DB) {
        const stored = await env.DB.prepare(
          "SELECT value FROM settings WHERE key = 'local-auth-registration' LIMIT 1"
        ).first<{ value: string }>();

        if (stored?.value) {
          userData = JSON.parse(stored.value) as UserData;
        }
      }
    } catch (error) {
      // If there's any error checking session, treat as no session
      console.warn("Session check failed:", error);
    }

    if (!userData) {
      // No session - return error that will trigger normal login flow
      const errorParams = new URLSearchParams({
        error: "login_required",
        error_description: "User authentication required",
        ...(state && { state }),
      });
      return workerGlobals.Response.redirect(
        `${redirectUri}?${errorParams}`,
        302
      );
    }

    // Session exists - generate auth code for silent refresh using stored user data
    const authCode = btoa(JSON.stringify(userData));

    const successParams = new URLSearchParams({
      code: authCode,
      ...(state && { state }),
    });
    return workerGlobals.Response.redirect(
      `${redirectUri}?${successParams}`,
      302
    );
  }

  // Regular authorization flow - redirect to frontend
  const frontendAuthUrl = new URL(
    "/local_oidc/authorize",
    "http://localhost:5173"
  );
  frontendAuthUrl.searchParams.set("client_id", clientId);
  frontendAuthUrl.searchParams.set("redirect_uri", redirectUri);
  frontendAuthUrl.searchParams.set("response_type", responseType);
  if (scope) frontendAuthUrl.searchParams.set("scope", scope);
  if (state) frontendAuthUrl.searchParams.set("state", state);
  if (codeChallenge)
    frontendAuthUrl.searchParams.set("code_challenge", codeChallenge);
  if (codeChallengeMethod)
    frontendAuthUrl.searchParams.set(
      "code_challenge_method",
      codeChallengeMethod
    );
  frontendAuthUrl.searchParams.set("prompt", "registration");

  return workerGlobals.Response.redirect(frontendAuthUrl.toString(), 302);
}

const handler: SimpleHandler = {
  fetch: async (
    request: WorkerRequest,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<WorkerResponse> => {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (request.method === "OPTIONS") {
      return new workerGlobals.Response(null, {
        status: 200,
      });
    }

    if (pathname === "/local_oidc/.well-known/openid-configuration") {
      return handleOpenIdConfiguration(request, env);
    }

    if (pathname === "/local_oidc/.well-known/jwks.json") {
      return handleJwks(request, env);
    }

    if (pathname === "/local_oidc/token") {
      return handleToken(request, env);
    }

    if (pathname === "/local_oidc/userinfo") {
      return handleUserinfo(request, env);
    }

    if (pathname === "/local_oidc/authorize") {
      return handleAuthorize(request, env);
    }

    return new workerGlobals.Response("Not Found", { status: 404 });
  },
};

export default handler;
