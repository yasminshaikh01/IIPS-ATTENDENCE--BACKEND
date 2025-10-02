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
      present: { type: Boolean, required: true },
      markedBy: { type: String, default: null } // now at record level
    }
  ]
}, { timestamps: true });

// Composite index for fast lookups
attendanceSchema.index({ studentId: 1, subjectCode: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
