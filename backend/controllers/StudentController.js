const Student = require("../models/Student"); // adjust path
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

// ---------------- CREATE ----------------
exports.createStudent = async (req, res) => {
  try {
    const { rollNumber, fullName, courseId, semId, email, phoneNumber, section, specializations } = req.body;

    if (!isValidRollNumber(rollNumber)) {
      return res.status(400).json({
        message: "Invalid roll number format. Use XX-2KYY-NNN (e.g., IT-2K21-36)",
      });
    }

    const existing = await Student.findOne({ rollNumber: rollNumber.toUpperCase() });
    if (existing) {
      return res.status(400).json({ message: "Student with this roll number already exists" });
    }

    const student = new Student({
      rollNumber: rollNumber.toUpperCase(),
      fullName,
      courseId,
      semId,
      email,
      phoneNumber,
      section,
      specializations
    });

    const saved = await student.save();
    res.status(201).json(saved);
  } catch (err) {
    console.error("Create error:", err);
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

    const updated = await Student.findByIdAndUpdate(
      req.params.id,
      { ...req.body, rollNumber: rollNumber ? rollNumber.toUpperCase() : undefined },
      { new: true, runValidators: true }
    );

    if (!updated) return res.status(404).json({ message: "Student not found" });

    res.status(200).json(updated);
  } catch (err) {
    console.error("Update error:", err);
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
