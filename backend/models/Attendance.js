// Attendance.js
const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Students',
    required: true
  },
  subjectCode: {
    type: String,
    required: true
  },
  records: [
    {
      date: { type: Date, required: true },
      present: { type: Boolean, required: true }
    }
  ]
}, { timestamps: true });

attendanceSchema.index({ studentId: 1, subjectCode: 1 }); // fast lookup

module.exports = mongoose.model('Attendance', attendanceSchema);
