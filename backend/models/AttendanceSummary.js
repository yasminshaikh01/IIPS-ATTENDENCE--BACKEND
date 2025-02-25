const mongoose = require('mongoose');

const attendanceSummarySchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  course: {
    type: String,
    required: true
  },
  semester: {
    type: String,
    required: true
  },
  subject: {
    type: String,
    required: true
  },
  academicYear: {
    type: String,
    required: true
  },
  totalClasses: {
    type: Number,
    default: 0
  },
  attendedClasses: {
    type: Number,
    default: 0
  },
  attendancePercentage: {
    type: Number,
    default: 0
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

// Compound index to ensure a student has only one summary per subject per semester
attendanceSummarySchema.index(
  { studentId: 1, subject: 1, semester: 1, academicYear: 1 },
  { unique: true }
);

module.exports = mongoose.model('AttendanceSummary', attendanceSummarySchema);