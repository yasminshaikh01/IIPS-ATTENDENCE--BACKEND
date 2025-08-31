const Student = require("../models/Student"); // adjust path
const Course = require('../models/Course');
const mongoose = require("mongoose");

// Roll number pattern validation function
const isValidRollNumber = (rollNumber) => {
  if (!rollNumber || typeof rollNumber !== "string") return false;

  const cleanedRollNumber = rollNumber.trim().toUpperCase();

  // Pattern: 2 letters + "-2K" + 2 digits + "-" + numbers
  // Examples: IT-2K21-36, CS-2K22-150
  const pattern = /^[A-Z]{2}-2K\d{2}-\d+$/;
  return pattern.test(cleanedRollNumber);
};

// Helper function to convert empty strings to null
const convertEmptyToNull = (value) => {
  if (value === "" || value === undefined) return null;
  return value;
};

// Helper function to process student data
const processStudentData = (data) => {
  const processed = {};
  
  // Required fields
  if (data.rollNumber !== undefined) {
    processed.rollNumber = data.rollNumber ? data.rollNumber.toUpperCase() : null;
  }
  if (data.fullName !== undefined) {
    processed.fullName = convertEmptyToNull(data.fullName);
  }
  if (data.courseId !== undefined) {
    processed.courseId = convertEmptyToNull(data.courseId);
  }
  if (data.semId !== undefined) {
    processed.semId = data.semId || null;
  }
  
  // Optional fields
  if (data.email !== undefined) {
    processed.email = convertEmptyToNull(data.email);
  }
  if (data.phoneNumber !== undefined) {
    processed.phoneNumber = convertEmptyToNull(data.phoneNumber);
  }
  if (data.section !== undefined) {
    processed.section = convertEmptyToNull(data.section);
  }
  if (data.specializations !== undefined) {
    // Handle specializations array - remove empty strings
    if (Array.isArray(data.specializations)) {
      const filtered = data.specializations.filter(spec => spec !== "" && spec !== null && spec !== undefined);
      processed.specializations = filtered.length > 0 ? filtered : null;
    } else if (data.specializations === "") {
      processed.specializations = null;
    } else {
      processed.specializations = data.specializations;
    }
  }
  
  return processed;
};

// ---------------- CREATE ----------------
exports.createStudent = async (req, res) => {
  try {
    const { rollNumber, fullName, courseName, semId, email, phoneNumber, section, specializations } = req.body;

    // Validate required fields
    if (!rollNumber || !fullName || !courseName || !semId) {
      return res.status(400).json({
        message: "Roll number, full name, course name, and semester ID are required",
      });
    }

    if (!isValidRollNumber(rollNumber?.trim())) {
      return res.status(400).json({
        message: "Invalid roll number format. Use XX-2KYY-NNN (e.g., IT-2K21-36)",
      });
    }

    // ✅ Find course ID using course name
    const course = await Course.findOne({ Course_Name: courseName }, { Course_Id: 1 }).lean();
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    const existing = await Student.findOne({ rollNumber: rollNumber.toUpperCase().trim() });
    if (existing) {
      return res.status(400).json({ message: "Student with this roll number already exists" });
    }

    // Process the data to handle empty strings
    const studentData = processStudentData({
      rollNumber,
      fullName,
      courseId: course.Course_Id,   // ✅ resolved from courseName
      semId,
      email,
      phoneNumber,
      section,
      specializations: specializations?.length ? specializations : null // store null if []
    });

    const student = new Student(studentData);
    const saved = await student.save();
    res.status(201).json(saved);
  } catch (err) {
    console.error("Create error:", err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ 
        message: "Validation error", 
        details: Object.keys(err.errors).map(key => ({
          field: key,
          message: err.errors[key].message
        }))
      });
    }
    res.status(500).json({ message: "Failed to create student" });
  }
};


// ---------------- READ ----------------
exports.getStudents = async (req, res) => {
  try {
    const students = await Student.find();
    res.status(200).json(students);
  } catch (err) {
    console.error("Read error:", err);
    res.status(500).json({ message: "Failed to fetch students" });
  }
};

exports.getStudentById = async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ message: "Student not found" });
    res.status(200).json(student);
  } catch (err) {
    console.error("Get by ID error:", err);
    res.status(500).json({ message: "Failed to fetch student" });
  }
};

// ---------------- UPDATE ----------------
exports.updateStudent = async (req, res) => {
  try {
    const { rollNumber } = req.body;

    if (rollNumber && !isValidRollNumber(rollNumber)) {
      return res.status(400).json({
        message: "Invalid roll number format. Use XX-2KYY-NNN (e.g., IT-2K21-36)",
      });
    }

    // Process the update data to handle empty strings
    const updateData = processStudentData(req.body);

    // Remove undefined values to avoid overwriting existing data
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    const updated = await Student.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updated) return res.status(404).json({ message: "Student not found" });

    res.status(200).json(updated);
  } catch (err) {
    console.error("Update error:", err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ 
        message: "Validation error", 
        details: Object.keys(err.errors).map(key => ({
          field: key,
          message: err.errors[key].message
        }))
      });
    }
    res.status(500).json({ message: "Failed to update student" });
  }
};

// ---------------- DELETE ----------------
exports.deleteStudent = async (req, res) => {
  try {
    const deleted = await Student.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Student not found" });

    res.status(200).json({ message: "Student deleted successfully" });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ message: "Failed to delete student" });
  }
};