const mongoose = require('mongoose');

const SubjectSchema = new mongoose.Schema({
  Course_ID: { type: String, required: true },
  Sem_Id: { type: String, required: true },
  Specialization: { type: String },
  Sub_Code: { type: String, required: true, unique: true },
  Sub_Name: { type: String, required: true },
  Semester: { type: String, enum: ['odd', 'even'], required: true },
  Year: { type: String, required: true },
});

module.exports = mongoose.model('Subject', SubjectSchema);