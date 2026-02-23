import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const SALT_ROUNDS = 12;
// 12 rounds is the sweet spot — low enough that login isn't slow, high enough that brute-forcing a leaked hash would take years on modern hardware

export const register = async (req, res) => {
  const { email, password, role } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  if (password.length < 8) {
    // enforce minimum before hashing — bcrypt silently truncates at 72 chars but says nothing about minimums
    return res.status(400).json({ error: 'password must be at least 8 characters' });
  }

  try {
    const normalizedEmail = email.toLowerCase().trim(); // normalize so "User@X.com" and "user@x.com" can't become two separate accounts
    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    // hash before save so the plaintext never touches the db, even in the same tick

    const user = new User({ email: normalizedEmail, password: hashed, role });
    await user.save();

    return res.status(201).json({ message: 'user registered', email: user.email, role: user.role });
  } catch (err) {
    if (err.code === 11000) {
      // unique index on email — same as alertid dedup, surface a clear message rather than a raw mongo error
      return res.status(409).json({ error: 'email already registered' });
    }

    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }

    console.error('unexpected error during register:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
};

export const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase().trim() }); // normalize before lookup so login works regardless of how the user typed their email

    if (!user) {
      // return the same message as a wrong password — don't confirm whether the email exists
      return res.status(401).json({ error: 'invalid credentials' });
    }

    const match = await bcrypt.compare(password, user.password);
    // bcrypt.compare is constant-time, so this doesn't leak timing info about whether the hash matched

    if (!match) {
      return res.status(401).json({ error: 'invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
      // 8 hours matches a typical work shift — short enough to limit exposure if a token leaks
    );

    return res.status(200).json({ token });
  } catch (err) {
    console.error('unexpected error during login:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
};