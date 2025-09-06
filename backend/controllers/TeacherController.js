const Teacher = require("../models/Teacher");
const UnverifiedTeacher = require("../models/UnverifiedTeacher");
const Subject = require('../models/Subject');
const {
  sendOtpToEmail,
  sendResetLinkToEmail,
} = require("../config/nodemailer");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const secret = process.env.SECRET_KEY || "your_secret_key";

const signUp = async (req, res) => {
  const { name, email, mobileNumber, password } = req.body;

  try {
    const existingTeacher = await UnverifiedTeacher.findOne({ email });
    if (existingTeacher) {
      return res.status(400).json({ error: "User already exists." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = Math.floor(100000 + Math.random() * 900000);
    const otpExpiry = Date.now() + 2 * 24 * 60 * 60 * 1000; //2days

    const newTeacher = new UnverifiedTeacher({
      name,
      email,
      mobileNumber,
      password: hashedPassword,
      otp,
      otpExpiry,
    });

    await newTeacher.save();

    // Custom text for the email sent to the admin
    const customText = `${name} is trying to sign up. His email is ${email} and the OTP is ${otp}.`;

    // Send OTP to admin
    await sendOtpToEmail(process.env.ADMIN_EMAIL, otp, customText);

    res
      .status(200)
      .json({ message: "OTP sent to admin. Awaiting verification." });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
};

const verifyOtppasscode = async (req, res) => {
  const { email, otp } = req.body;

  try {
    const unverifiedTeacher = await UnverifiedTeacher.findOne({ email });

    if (!unverifiedTeacher) {
      return res.status(404).json({ error: "Unverified user not found." });
    }

    if (
      unverifiedTeacher.otp !== otp ||
      unverifiedTeacher.otpExpiry < Date.now()
    ) {
      return res.status(400).json({ error: "Invalid or expired OTP." });
    }

    const { name, mobileNumber, password } = unverifiedTeacher;
    const teacher = new Teacher({
      name,
      email,
      mobileNumber,
      password,
    });

    await teacher.save();
    await UnverifiedTeacher.deleteOne({ email });

    res.status(200).json({
      success: true,
      message: "Verification successful. You can now log in.",
    });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
};

const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const teacher = await Teacher.findOne({ email });

    if (!teacher) {
      return res.status(404).json({ error: "Teacher not found" });
    }

    const isPasswordMatch = await bcrypt.compare(password, teacher.password);

    if (!isPasswordMatch) {
      return res.status(400).json({ error: "Invalid password" });
    }

    // Generate session ID and set expiry to 6 hours from now
    const sessionId = crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8 hours from now

    teacher.sessions.push({ sessionId, expiresAt });
    await teacher.save();
     // Generate JWT token valid for 8 hours
    const token = jwt.sign(
      {
        teacherId: teacher._id,
        email: teacher.email,
        name: teacher.name,
      },
      secret,
      { expiresIn: "8h" }
    );


    res.status(200).json({
      message: "Login successful",
      sessionId,
      token, 
      teacherId: teacher._id,
      name: teacher.name,
      email: teacher.email,
      mobileNumber: teacher?.mobileNumber,
      photo: teacher.photo,
    });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
};

// const verifyOtp = async (req, res) => {
//   const { email, otp } = req.body;

//   try {
//     const teacher = await Teacher.findOne({ email });

//     if (!teacher) {
//       return res.status(404).json({ error: "Teacher not found" });
//     }

//     // Check if OTP matches and is not expired
//     if (teacher.otp !== otp || Date.now() > teacher.otpExpiry) {
//       return res.status(400).json({ error: "Invalid or expired OTP" });
//     }

//     // Clear OTP and OTP expiry after successful verification
//     teacher.otp = null;
//     teacher.otpExpiry = null;

//     // Generate session ID and set expiry to 6 hours from now
//     const sessionId = crypto.randomBytes(16).toString("hex");
//     const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000); // 6 hours from now

//     teacher.sessions.push({ sessionId, expiresAt });
//     await teacher.save();

//     res.status(200).json({
//       message: "Login successful",
//       sessionId,
//       teacherId: teacher._id,
//       name: teacher.name,
//       email: teacher.email,
//       mobileNumber: teacher.mobileNumber,
//       photo: teacher.photo,
//     });
//   } catch (error) {
//     res.status(500).json({ error: "Server error" });
//   }
// };

const verifySession = async (req, res) => {
  const { sessionId } = req.body;

  try {
    const teacher = await Teacher.findOne({ "sessions.sessionId": sessionId });

    if (!teacher) {
      return res.status(401).json({ valid: false, error: "Session not found" });
    }

    const session = teacher.sessions.find((s) => s.sessionId === sessionId);

    // Check if session has expired
    if (new Date() > session.expiresAt) {
      return res.status(401).json({ valid: false, error: "Session expired" });
    }

    res.status(200).json({ valid: true });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
};

const forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const teacher = await Teacher.findOne({ email });

    if (!teacher) {
      return res.status(404).json({ error: "Teacher not found" });
    }

    // Generate a reset token
    const resetToken = crypto.randomBytes(32).toString("hex");

    // Hash the reset token before saving to the database
    const hashedToken = await bcrypt.hash(resetToken, 10);

    // Set token expiry time (10 minutes from now)
    const tokenExpiry = Date.now() + 10 * 60 * 1000;

    // Save the hashed token and expiry in the database
    teacher.resetPasswordToken = hashedToken;
    teacher.resetPasswordExpiry = tokenExpiry;
    await teacher.save();

    // Construct the reset link
    const resetLink = `${process.env.FRONTEND_URL}/reset_password?token=${resetToken}&email=${email}`;

    // Send the reset link to the teacher's email
    await sendResetLinkToEmail(email, resetLink);

    res.status(200).json({ message: "Password reset link sent successfully" });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
};
const resetPassword = async (req, res) => {
  const { token, email, newPassword } = req.body;

  try {
    const teacher = await Teacher.findOne({ email });

    if (!teacher) {
      return res.status(404).json({ error: "Teacher not found" });
    }

    // Verify the reset token
    const isTokenValid = await bcrypt.compare(
      token,
      teacher.resetPasswordToken
    );
    console.log("reset");

    if (!isTokenValid || Date.now() > teacher.resetPasswordExpiry) {
      return res.status(400).json({ error: "Invalid or expired token" });
    }

    // Hash the new password and update it
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    teacher.password = hashedPassword;

    // Clear the reset token and expiry
    teacher.resetPasswordToken = null;
    teacher.resetPasswordExpiry = null;

    await teacher.save();

    res.status(200).json({ message: "Password reset successfully" });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
};

const getTeacherDetailsById = async (req, res) => {
  const { teacherId } = req.body; // Assuming teacherId is sent in the request body

  try {
    const teacher = await Teacher.findById(teacherId);

    if (!teacher) {
      return res.status(404).json({ error: "Teacher not found" });
    }

    res.status(200).json({
      message: "Teacher details retrieved successfully",
      teacher,
    });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
};

const updateTeacherDetailsById = async (req, res) => {
  const { teacherId, name, mobile_no, password, email } = req.body;

  let updateFields = { name, mobileNumber: mobile_no, email }; // Starting with name, email and mobile

  // Hash the password only if it's provided
  if (password) {
    const hashedPassword = await bcrypt.hash(password, 10);
    updateFields.password = hashedPassword;
  }
  try {
    const teacher = await Teacher.findOneAndUpdate(
      { _id: teacherId },
      updateFields, // Only the fields that need to be updated
    );

    if (!teacher) {
      return res.status(404).json({ error: "Teacher not found" });
    }
    res.status(200).json({ message: "Teacher updated successfully", teacher });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
};

// ================================
// 📌 Create Teacher (Admin Only)
// ================================
const createTeacher = async (req, res) => {
  try {
    const { name, email, password, mobileNumber, faculty_id, subjectAccess } = req.body;

    // ✅ Check if teacher with email or faculty_id already exists
    const existingTeacher = await Teacher.findOne({
      $or: [{ email }, { faculty_id }]
    });

    if (existingTeacher) {
      return res.status(409).json({   // 409 Conflict (resource already exists)
        success: false,
        message: existingTeacher.email === email 
          ? "A teacher with this email already exists"
          : "A teacher with this faculty ID already exists",
        teacher: {
          id: existingTeacher._id,
          name: existingTeacher.name,
          email: existingTeacher.email,
          faculty_id: existingTeacher.faculty_id,
        }
      });
    }

    // ✅ Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // ✅ Convert subjectAccess array of strings -> array of objects
    const formattedSubjects = subjectAccess.map(code => ({ subjectCode: code }));

    const teacher = new Teacher({
      name,
      email,
      password: hashedPassword,
      mobileNumber,
      faculty_id,
      subjectAccess: formattedSubjects,
    });

    await teacher.save();

    res.status(201).json({
      success: true,
      message: "Teacher created successfully",
      teacher: {
        id: teacher._id,
        name: teacher.name,
        email: teacher.email,
        faculty_id: teacher.faculty_id,
        subjectAccess: teacher.subjectAccess,
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error creating teacher",
      error: error.message,
    });
  }
};

// ================================
// 📌 Get All Teachers
// ================================
const getAllTeachers = async (req, res) => {
  try {
    const teachers = await Teacher.find().select("-password");
    res.status(200).json({ success: true, teachers });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching teachers", error: error.message });
  }
};

// ================================
// 📌 Get Teacher by ID
// ================================
const getTeacherById = async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.params.id).select("-password");
    if (!teacher) return res.status(404).json({ success: false, message: "Teacher not found" });

    res.status(200).json({ success: true, teacher });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching teacher", error: error.message });
  }
};

// ================================
// 📌 Update Teacher (except password)
// ================================
const updateTeacher = async (req, res) => {
  try {
    const { name, email, mobileNumber, faculty_id, subjectAccess } = req.body;

    // ✅ Convert ["all","IC-101"] → [{ subjectCode: "all" }, { subjectCode: "IC-101" }]
    const formattedSubjectAccess = Array.isArray(subjectAccess)
      ? subjectAccess.map(sub => ({ subjectCode: sub }))
      : [];

    const teacher = await Teacher.findByIdAndUpdate(
      req.params.id,
      { name, email, mobileNumber, faculty_id, subjectAccess: formattedSubjectAccess },
      { new: true }
    ).select("-password");

    if (!teacher) {
      return res.status(404).json({ success: false, message: "Teacher not found" });
    }

    res.status(200).json({
      success: true,
      message: "Teacher updated successfully",
      teacher
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Error updating teacher",
      error: error.message
    });
  }
};

// ================================
// 📌 Update Teacher Password (Admin)
// ================================
const updateTeacherPassword = async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ success: false, message: "Password is required" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const teacher = await Teacher.findByIdAndUpdate(
      req.params.id,
      { password: hashedPassword },
      { new: true }
    );

    if (!teacher) return res.status(404).json({ success: false, message: "Teacher not found" });

    res.status(200).json({ success: true, message: "Password updated successfully" });
  } catch (error) {
    res.status(400).json({ success: false, message: "Error updating password", error: error.message });
  }
};

// ================================
// 📌 Delete Teacher
// ================================
const deleteTeacher = async (req, res) => {
  try {
    const teacher = await Teacher.findByIdAndDelete(req.params.id);
    if (!teacher) return res.status(404).json({ success: false, message: "Teacher not found" });

    res.status(200).json({ success: true, message: "Teacher deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error deleting teacher", error: error.message });
  }
};

const getAllSubjects = async (req, res) => {
  try {
    const subjects = await Subject.find({}, { Sub_Code: 1, _id: 0 }); // only Sub_Code
    const codes = subjects.map(sub => sub.Sub_Code); // extract array of codes
    res.status(200).json(codes);
  } catch (err) {
    console.error('Error fetching subject codes:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};



module.exports = {
  login,
  // verifyOtp,
  verifySession,
  signUp,
  verifyOtppasscode,
  forgotPassword,
  resetPassword,
  updateTeacherDetailsById,
  getTeacherDetailsById,
  getAllTeachers,
  createTeacher,
  getTeacherById,
  updateTeacher,
  updateTeacherPassword,
  deleteTeacher,
  getAllSubjects
};
