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
const { getAllUnmarkedAttendanceReport, getAttendanceByCourseAndSemesterExcel } = require("../controllers/ReportController");
const verifyToken = require("../middleware/verifyToken");
const { deleteAttendance, mergeAttendance } = require("../controllers/AttendanceController");
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

// Feed checking
router.post("/upload-students",verifyToken,uploadStudentsFromCSV);
router.post("/upload-courses",verifyToken,uploadCoursesFromCSV);
router.post("/upload-subjects",verifyToken,uploadSubjectsFromCSV);
router.post("/upload-teachers",verifyToken,uploadTeachersFromCSV);
router.post("/delete",verifyToken,deleteAttendance);
router.post("/getAttendanceByCourseAndSemesterExcel", verifyToken, getAttendanceByCourseAndSemesterExcel);
router.post("/mergeAttendance", verifyToken, mergeAttendance)

//summary
router.get('/getMissingSubjectSummary',verifyToken, getAllUnmarkedAttendanceReport);

module.exports = router;
