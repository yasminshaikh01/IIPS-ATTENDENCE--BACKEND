const express = require("express");
const { getAllStudents, createStudent, getStudents, getStudentById, updateStudent, deleteStudent } = require("../controllers/StudentController");
const router = express.Router();


// CRUD
router.post("/", createStudent);
router.get("/", getStudents);
router.get("/:id", getStudentById);
router.put("/:id", updateStudent);
router.delete("/:id", deleteStudent);



module.exports = router;
