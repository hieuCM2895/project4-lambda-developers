import 'source-map-support/register';
import { APIGatewayTokenAuthorizerEvent, APIGatewayAuthorizerResult } from 'aws-lambda';
import { verify, decode } from 'jsonwebtoken';
import { createLogger } from '../../utils/logger';
import { JwtPayload, Jwt } from './jwt';
import Axios from 'axios'

const logger = createLogger('auth');

const jwksUrl = 'https://dev-dnt8xiz2bvdurua5.us.auth0.com/.well-known/jwks.json'

export const handler = async (
  event: APIGatewayTokenAuthorizerEvent
): Promise<APIGatewayAuthorizerResult> => {
  logger.info('Authorizing an user', event.authorizationToken);
  try {
    const jwtToken = await verifyToken(event.authorizationToken);
    logger.info('User was authorized', jwtToken);

    return {
      principalId: jwtToken.sub,
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Action: 'execute-api:Invoke',
            Effect: 'Allow',
            Resource: '*'
          }
        ]
      }
    };
  } catch (error) {
    logger.error('User not authorized', { error: error.message });

    return {
      principalId: 'user',
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Action: 'execute-api:Invoke',
            Effect: 'Deny',
            Resource: '*'
          }
        ]
      }
    };
  }
};

function getToken(authHeader: string): string {
  if (!authHeader) throw new Error('No authentication header');
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    throw new Error('Invalid authentication header');
  }
  const jwtArr = authHeader.split(' ');
  const token = jwtArr[1];
  return token;
}

async function verifyToken(authHeader: string): Promise<JwtPayload> {
  logger.info("Start verify token")
  const token = getToken(authHeader)
  const jwt: Jwt = decode(token, { complete: true }) as Jwt

  const res = await Axios.get(jwksUrl)

  const jwks = res.data.keys
  const signingKeys = jwks.filter(key => key.use === 'sig'
    && key.kty === 'RSA'
    && key.kid
    && ((key.x5c && key.x5c.length) || (key.n && key.e))
  ).map(key => {
    return { kid: key.kid, nbf: key.nbf, publicKey: certToPEM(key.x5c[0]) }
  })
  const signingKey = signingKeys.find(key => key.kid === jwt.header.kid)

  return new Promise((resolve, reject) => {
    verify(token, signingKey.publicKey, (err, decoded) => {
      if (err) {
        logger.error('verify error', err)
        reject(err)
      }
      resolve({
        iss: decoded.iss,
        sub: decoded.sub,
        iat: decoded.iat,
        exp: decoded.exp,
      })
    })
  })
}

export function certToPEM(cert) {
  cert = cert.match(/.{1,64}/g).join('\n');
  cert = `-----BEGIN CERTIFICATE-----\n${cert}\n-----END CERTIFICATE-----\n`;
  return cert;
}
