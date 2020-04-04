const { KJUR } = require("jsrsasign");
const { getInput } = require("@actions/core");
const axios = require("axios");
const querystring = require("querystring");
const config = require("./config");

async function getAccessToken() {
  const jwt = getSignedJWT(config);
  const tokenResp = await tokenRequest(config.aud, jwt);
  return tokenResp.access_token;
}

async function tokenRequest(aud, jwt) {
  const url = aud + "/protocol/openid-connect/token";
  const data = {
    grant_type: "client_credentials",
    client_assertion_type:
      "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: jwt
  };

  const response = await axios({
    method: "post",
    url,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json"
    },
    data: querystring.stringify(data)
  });

  return response.data;
}

function getSignedJWT({ kid, alg, iss, aud, sub, privateKey }) {
  const currentTime = +new Date(); // the current time in milliseconds
  const issuedAtTimeSeconds = currentTime / 1000;
  const expirationTimeSeconds = currentTime / 1000 + 3600;

  // Generate random string for "jti" claim - needed if client has Replay Prevention enabled
  let jti = "";
  const charset = "abcdefghijklmnopqrstuvwxyz0123456789";

  for (let i = 0; i < 12; i++) {
    jti += charset.charAt(Math.floor(Math.random() * charset.length));
  }

  // Create Header and Payload objects
  const header = {
    kid,
    alg
  };

  var payload = {
    iss,
    aud,
    sub,
    jti,
    exp: Math.ceil(expirationTimeSeconds),
    iat: Math.ceil(issuedAtTimeSeconds)
  };

  console.log(JSON.stringify(header));
  console.log(JSON.stringify(payload));
  // Prep the objects for a JWT
  const sHeader = JSON.stringify(header);
  const sPayload = JSON.stringify(payload);
  const sJWT = KJUR.jws.JWS.sign(header.alg, sHeader, sPayload, privateKey);
  return sJWT;
}

module.exports = {
  getAccessToken
};
