import jwt from 'jsonwebtoken';

const authenticate = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // reject early so the rest of the middleware chain never runs without a valid identity
    return res.status(401).json({ error: 'missing or malformed authorization header' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // verify throws on expired or tampered tokens — the catch below handles both cases

    req.user = decoded;
    // attach to req so downstream controllers can read role/userId without re-decoding
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'token expired, please log in again' });
    }

    // covers JsonWebTokenError (bad signature, malformed token, wrong secret)
    return res.status(401).json({ error: 'invalid token' });
  }
};

export default authenticate;
