const express = require("express");
const { getStudentsByCourseAndSemester, submitAttendance, getAttendanceByCourseAndSubject, getStudentById, getStudentAttendanceDetail, sendLowAttendanceNotifications, getSubjects, markSingleAttendance } = require("../controllers/AttendanceController");
const verifyToken = require("../middleware/verifyToken");

const router = express.Router();
router.use(verifyToken);

router.post("/getByCourseAndSemester", getStudentsByCourseAndSemester);
router.post("/markattendance", submitAttendance);
router.get('/detail/:studentId/:subject/:semester/:academicYear', getStudentAttendanceDetail);
router.get('/students/:id', getStudentById);
router.post("/getAttendanceByCourseAndSubject",getAttendanceByCourseAndSubject);
router.post('/getsubjects', getSubjects);
router.post('/sendLowAttendanceNotifications', sendLowAttendanceNotifications);
router.post('/markSingleAttendance', markSingleAttendance);

module.exports = router;
