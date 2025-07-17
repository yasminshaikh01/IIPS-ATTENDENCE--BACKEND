const express = require("express");
const { getStudentsByCourseAndSemester, submitAttendance, getAttendanceByCourseAndSubject, getStudentById, getStudentAttendanceDetail, sendLowAttendanceNotifications, getSubjects } = require("../controllers/AttendanceController");


const router = express.Router();

router.post("/getByCourseAndSemester", getStudentsByCourseAndSemester);
router.post("/markattendance", submitAttendance);
router.get('/detail/:studentId/:subject/:semester/:academicYear', getStudentAttendanceDetail);
router.get('/students/:id', getStudentById);
router.post("/getAttendanceByCourseAndSubject",getAttendanceByCourseAndSubject);
router.post('/getsubjects', getSubjects);
router.post('/sendLowAttendanceNotifications', sendLowAttendanceNotifications);

module.exports = router;
