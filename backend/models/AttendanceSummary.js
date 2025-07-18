const mongoose = require('mongoose');

const attendanceSummarySchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  courseId: {
    type: String,
    required: true
  },
  semId: {
    type: String,
    required: true
  },
  subjectCode: {
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

// ✅ Correct compound index
attendanceSummarySchema.index(
  { studentId: 1, courseId: 1, semId: 1, subjectCode: 1, academicYear: 1 },
  { unique: true }
);

module.exports = mongoose.model('AttendanceSummary', attendanceSummarySchema);