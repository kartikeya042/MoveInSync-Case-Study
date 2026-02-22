import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true, // email is the login key, duplicates would make auth ambiguous
      lowercase: true, // normalize before saving so "User@X.com" and "user@x.com" don't become two accounts
      trim: true,
    },
    password: {
      type: String,
      required: true,
      // never store plaintext — the hash goes here, bcrypt handles the rest
    },
    role: {
      type: String,
      enum: ['admin', 'operator'],
      default: 'operator', // least privilege by default — admins are explicitly assigned
    },
  },
  { timestamps: true }
);

const User = mongoose.model('User', userSchema);

export default User;
