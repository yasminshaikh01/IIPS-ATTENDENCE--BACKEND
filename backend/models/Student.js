const mongoose = require('mongoose');
const studentSchema = new mongoose.Schema({
    className: {
      type: String,
      required: true,
      enum: ['MTECH', 'MCA']
    },
    semester: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true
    },
    fullName: {
      type: String,
      required: true
    },
    rollNumber: {
      type: String,
      required: true,
      unique: true
    },
    enrollmentNumber: {
      type: String,
      required: true,
      unique: true
    },
    phoneNumber: {
      type: String,
      required: true
    },
    password: {
      type: String,
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }, { collection: 'Students' });
  
  module.exports = mongoose.model('Students', studentSchema);
  