const mongoose = require('mongoose');
const eligibilitySchema = new mongoose.Schema({
  branches: { type: [String], default: [] },
  minCgpa: { type: Number, default: null },
  graduationYears: { type: [Number], default: [] },
  needsReview: { type: Boolean, default: false },
}, { _id: false });
const taskSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  source: { type: String, enum: ['gmail', 'classroom'], required: true },
  sourceId: { type: String, required: true },
  sourceType: { type: String, enum: ['email', 'announcement', 'courseWork'], required: true },
  sourceLink: String,
  courseId: { type: String, default: '' },
  classification: { type: String, enum: ['ACTION_REQUIRED', 'IMPORTANT_INFORMATION'], required: true },
  category: { type: String, enum: ['job', 'internship', 'assignment', 'exam', 'event', 'scholarship', 'registration', 'announcement', 'other'], required: true },
  title: { type: String, required: true, trim: true, maxlength: 300 },
  organization: { type: String, default: null },
  description: { type: String, default: '', maxlength: 600 },
  occurredAt: { type: Date, default: null },
  deadline: { type: Date, default: null },
  actionRequired: String,
  actionUrl: String,
  parsingWarnings: { type: [String], default: [] },
  eligibility: { type: eligibilitySchema, default: () => ({}) },
  isEligible: { type: Boolean, default: null },
  eligibilityStatus: { type: String, enum: ['eligible', 'ineligible', 'unknown'], required: true },
  eligibilityReasons: { type: [String], default: [] },
  importanceScore: { type: Number, required: true, min: 0, max: 100 },
  urgencyScore: { type: Number, required: true, min: 0, max: 100 },
  priorityScore: { type: Number, required: true, min: 0, max: 100 },
  priorityLevel: { type: String, enum: ['critical', 'high', 'medium', 'low'], required: true },
  priorityReasons: { type: [String], default: [] },
  status: { type: String, enum: ['pending', 'in_progress', 'completed', 'dismissed'], default: 'pending' },
}, { timestamps: true });
taskSchema.index({ userId: 1, source: 1, sourceId: 1 }, { unique: true });
taskSchema.index({ userId: 1, priorityScore: -1 });
taskSchema.index({ userId: 1, status: 1, deadline: 1 });
module.exports = mongoose.model('Task', taskSchema);
