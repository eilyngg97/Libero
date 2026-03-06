function unique(list) {
  return [...new Set(list.filter(Boolean).map((item) => String(item).trim()))];
}

function getJwtSigningSecret() {
  const secret = process.env.JWT_SECRET_CURRENT || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT secret no configurado. Define JWT_SECRET_CURRENT o JWT_SECRET');
  }
  return secret;
}

function getJwtVerificationSecrets() {
  const secrets = unique([
    process.env.JWT_SECRET_CURRENT,
    process.env.JWT_SECRET,
    process.env.JWT_SECRET_PREVIOUS
  ]);

  if (secrets.length === 0) {
    throw new Error('No hay secretos JWT configurados para validacion');
  }

  return secrets;
}

function getMongoUri() {
  const uri = process.env.MONGO_URI_CURRENT || process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO URI no configurado. Define MONGO_URI_CURRENT o MONGO_URI');
  }
  return uri;
}

module.exports = {
  getJwtSigningSecret,
  getJwtVerificationSecrets,
  getMongoUri
};