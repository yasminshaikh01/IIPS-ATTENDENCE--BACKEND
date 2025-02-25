const mongoose = require('mongoose');
const studentSchema = new mongoose.Schema({
    className: {
      type: String,
      required: true,
      enum: ['MTECH', 'MCA','MBA(MS)','MBA(ESHIP)','MBA(APR)','MBA(TM)','MBA(FT)','BCOM']
    },
    semester: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true,
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