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
   photo: { type: String, default: "http://res.cloudinary.com/duxvbwdf3/image/upload/v1731004725/question/xnykk7ixq6bk2qdrppty.png" },
    
  courseId: {
    type: String,
    required: true
  },
  semId: {
    type: String,
    required: true
  },
specializations: {
  type: [String],
  default: undefined
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
