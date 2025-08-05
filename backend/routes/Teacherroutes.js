const express = require("express");
const {
  login,

  verifySession,
  signUp,
  verifyOtppasscode,
  forgotPassword,
  resetPassword,

  getTeacherDetailsById,
  updateTeacherDetailsById,


  
} = require("../controllers/TeacherController");
const { uploadStudentsFromCSV, uploadCoursesFromCSV, uploadSubjectsFromCSV, uploadTeachersFromCSV } = require("../controllers/FeedStudents");
const { getAllUnmarkedAttendanceReport } = require("../controllers/ReportController");
const router = express.Router();

router.post("/login", login);
// router.post("/verify-otp", verifyOtp);
router.post("/signup", signUp);
router.post("/verifypasscode", verifyOtppasscode);
router.post("/verify-session", verifySession);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/getteacherDetails",getTeacherDetailsById);
router.post("/edit",updateTeacherDetailsById);

// Feed
router.post("/upload-students",uploadStudentsFromCSV);
router.post("/upload-courses",uploadCoursesFromCSV);
router.post("/upload-subjects",uploadSubjectsFromCSV);
router.post("/upload-teachers",uploadTeachersFromCSV);

//summary
router.get('/getMissingSubjectSummary', getAllUnmarkedAttendanceReport);

module.exports = router;
