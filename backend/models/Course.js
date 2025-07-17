const mongoose = require('mongoose');

const CourseSchema = new mongoose.Schema({
  Course_Id: { type: String, required: true, unique: true },
  Course_Name: { type: String, required: true },
  No_of_Sem: { type: Number, required: true },
});

module.exports = mongoose.model('Course', CourseSchema);