const mongoose = require('mongoose');

// Individual attendance record schema
const attendanceRecordSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  present: {
    type: Boolean,
    default: true
  }
});

// Main attendance schema
const attendanceSchema = new mongoose.Schema({
  course: {
    type: String,
    required: true,
    enum: ['MTECH', 'MCA']
  },
  semester: {
    type: String,
    required: true
  },
  subject: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  records: [attendanceRecordSchema],
  createdAt: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
});

module.exports = mongoose.model('Attendance', attendanceSchema);