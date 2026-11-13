const mongoose = require('mongoose');
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  googleId: { type: String, unique: true, sparse: true },
  branch: { type: String, trim: true, default: null },
  year: { type: Number, min: 1, max: 6, default: null },
  graduationYear: { type: Number, min: 2000, max: 2100, default: null },
  cgpa: { type: Number, min: 0, max: 10, default: null },
  preferredCategories: {
    type: [String], default: [],
    enum: ['job', 'internship', 'assignment', 'exam', 'event', 'scholarship', 'registration', 'announcement'],
  },
  timezone: { type: String, default: 'Asia/Kolkata' },
}, { timestamps: true });
module.exports = mongoose.model('User', userSchema);
