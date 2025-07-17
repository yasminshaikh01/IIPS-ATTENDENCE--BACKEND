const mongoose = require('mongoose');

// Academic year default like "2025-26"
const getCurrentAcademicYear = () => {
  const year = new Date().getFullYear();
  return `${year}-${(year + 1).toString().slice(-2)}`;
};

const studentSchema = new mongoose.Schema({
  rollNumber: {
    type: String,
    required: true,
    unique: true
  },
  fullName: {
    type: String,
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
  specialization: {
    type: String
  },
  email: {
    type: String,
    lowercase: true
  },
  section: {
    type: String,
  },
  phoneNumber: {
    type: String
  },
  academicYear: {
    type: String,
    default: getCurrentAcademicYear
  }
}, { collection: 'Students' });

module.exports = mongoose.model('Students', studentSchema);
