const multer = require('multer');
const csvParser = require('csv-parser');
const fs = require('fs');
const path = require('path');
const Student = require('../models/Student');
const Course = require('../models/Course');
const upload = multer({ dest: 'uploads/' });
const bcrypt = require("bcryptjs");
const Subject = require('../models/Subject');
const Teacher=require('../models/Teacher');
// Academic Year helper
const getCurrentAcademicYear = () => {
  const year = new Date().getFullYear();
  return `${year}-${(year + 1).toString().slice(-2)}`;
};



exports.uploadStudentsFromCSV = [
  upload.single('file'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: 'CSV file is required' });
    }

    const filePath = path.resolve(req.file.path);
    const studentRows = [];
    const invalidRollNumbers = []; // Track students with invalid roll numbers

    // Roll number pattern validation function
    const isValidRollNumber = (rollNumber) => {
      if (!rollNumber || typeof rollNumber !== 'string') return false;
      
      // First trim and capitalize the roll number (but don't remove internal spaces)
      const cleanedRollNumber = rollNumber.trim().toUpperCase();
      
      // Pattern: 2 letters + "-2K" + 2 digits + "-" + numbers
      // Valid examples: IT-2K21-36, CS-2K22-150
      // Invalid examples: IT-2021-36, It-2K21 -36 (space before hyphen)
      const pattern = /^[A-Z]{2}-2K\d{2}-\d+$/;
      return pattern.test(cleanedRollNumber);
    };

    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on('data', (row) => {
        const normalize = (key) => key?.trim().toLowerCase();

        const getField = (fieldName) => {
          const key = Object.keys(row).find(k => normalize(k) === normalize(fieldName));
          return key ? row[key] || null : null;
        };

        const rollNumber = (getField('Roll Number') || getField('Roll No.'))?.trim().toUpperCase();
        const studentName = getField('Student Name')?.trim() || getField('Name')?.trim() || 'Unknown';

        if (!rollNumber) {
          console.warn('Missing roll number for row:', row);
          invalidRollNumbers.push({
            name: studentName,
            rollNumber: 'MISSING',
            error: 'Roll number is missing'
          });
          return;
        }

        // Validate roll number pattern
        if (!isValidRollNumber(rollNumber)) {
          console.warn('Invalid roll number pattern:', rollNumber, 'for student:', studentName);
          invalidRollNumbers.push({
            name: studentName,
            rollNumber: rollNumber,
            error: 'Roll number does not match required pattern (XX-2KYY-NNN)'
          });
          return; // Skip this student
        }

        const specialization = getField('Specialization');

        studentRows.push({
          rollNumber,
          fullName: studentName,
          courseId: getField('Course_Id')?.trim(),
          semId: getField('Sem_Id')?.trim(),
          email: getField('Email')?.toLowerCase().trim() || null,
          phoneNumber: getField('Phone')?.trim() || null,
          section: getField('section')?.trim() || null,
          academicYear: getCurrentAcademicYear(),
          specialization // singular input field
        });
      })
     .on('end', async () => {
  try {
    let inserted = 0, updated = 0;
    const insertedStudents = [];
    const updatedStudents = [];

    for (const student of studentRows) {
      const existingStudent = await Student.findOne({ rollNumber: student.rollNumber });

      if (existingStudent) {
        // Append specialization if it's non-null and not already present
        if (
          student.specialization &&
          typeof student.specialization === 'string' &&
          !existingStudent.specializations?.includes(student.specialization)
        ) {
          if (!Array.isArray(existingStudent.specializations)) {
            existingStudent.specializations = [];
          }
          existingStudent.specializations.push(student.specialization);
        }

        // Update other fields
        existingStudent.fullName = student.fullName || existingStudent.fullName;
        existingStudent.courseId = student.courseId || existingStudent.courseId;
        existingStudent.semId = student.semId || existingStudent.semId;
        existingStudent.email = student.email || existingStudent.email;
        existingStudent.phoneNumber = student.phoneNumber || existingStudent.phoneNumber;
        existingStudent.section = student.section || existingStudent.section;
        existingStudent.academicYear = student.academicYear || existingStudent.academicYear;

        await existingStudent.save();
        updated++;
        updatedStudents.push(existingStudent.fullName || existingStudent.rollNumber);
      } else {
        // Insert new student
        const newStudent = {
          rollNumber: student.rollNumber,
          fullName: student.fullName,
          courseId: student.courseId,
          semId: student.semId,
          email: student.email,
          phoneNumber: student.phoneNumber,
          section: student.section,
          academicYear: student.academicYear,
          specializations: student.specialization ? [student.specialization] : []
        };

        const createdStudent = await Student.create(newStudent);
        inserted++;
        insertedStudents.push(createdStudent.fullName || createdStudent.rollNumber);
      }
    }

    fs.unlinkSync(filePath);

    // Prepare response
    const response = {
      message: 'Student database processed successfully',
      inserted,
      updated,
      total: studentRows.length,
      insertedStudents,
      updatedStudents
    };

    if (invalidRollNumbers.length > 0) {
      response.invalidRollNumbers = invalidRollNumbers;
      response.skipped = invalidRollNumbers.length;
      response.skippedStudents = invalidRollNumbers.map(s => s.name || 'Unknown');
      response.message = `Student database processed with ${invalidRollNumbers.length} students skipped due to invalid roll numbers`;
    }

    res.status(200).json(response);
  } catch (err) {
    console.error('DB Error:', err);
    res.status(500).json({ message: 'Failed to save students' });
  }
})

      .on('error', (err) => {
        console.error('CSV Error:', err);
        res.status(500).json({ message: 'Failed to parse CSV' });
      });
  }
];


//  Create or Update Course from CSV
exports.uploadCoursesFromCSV = [
  upload.single('file'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'CSV file is required' });

    const filePath = path.resolve(req.file.path);
    const courses = [];
    const skippedCourses = [];

    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on('data', (row) => {
        const normalize = (key) => key?.trim().toLowerCase();
        const getField = (fieldName) => {
          const key = Object.keys(row).find(k => normalize(k) === normalize(fieldName));
          return key ? row[key] || null : null;
        };

        const Course_Id = getField('Course_Id')?.trim();
        const Course_Name = getField('Course_Name')?.trim();
        const noOfSemRaw = getField('No_of_Sem')?.trim();

        if (!Course_Id || !noOfSemRaw || isNaN(parseInt(noOfSemRaw))) {
          skippedCourses.push({
            Course_Id: Course_Id || 'MISSING',
            Course_Name: Course_Name || 'Unknown',
            reason: !Course_Id ? 'Missing Course_Id' : 'Invalid No_of_Sem'
          });
          return;
        }

        courses.push({
          Course_Id,
          Course_Name,
          No_of_Sem: parseInt(noOfSemRaw),
        });
      })
      .on('end', async () => {
        try {
          let inserted = 0;
          let updated = 0;
          const insertedCourses = [];
          const updatedCourses = [];

          for (const course of courses) {
            const existing = await Course.findOne({ Course_Id: course.Course_Id });

            if (existing) {
              await Course.findOneAndUpdate(
                { Course_Id: course.Course_Id },
                course,
                { new: true }
              );
              updated++;
              updatedCourses.push(course.Course_Id);
            } else {
              await Course.create(course);
              inserted++;
              insertedCourses.push(course.Course_Id);
            }
          }

          fs.unlinkSync(filePath);

          const response = {
            message: `Courses processed successfully`,
            inserted,
            updated,
            skipped: skippedCourses.length,
            insertedCourses,
            updatedCourses,
            skippedCourses,
            totalProcessed: courses.length + skippedCourses.length
          };

          if (skippedCourses.length > 0) {
            response.message = `Courses processed with ${skippedCourses.length} skipped due to invalid/missing fields.`;
          }

          res.status(200).json(response);
        } catch (err) {
          console.error(err);
          res.status(500).json({ message: 'Failed to upload courses' });
        }
      })
      .on('error', (err) => {
        console.error('CSV parse error:', err);
        res.status(500).json({ message: 'Failed to parse CSV file' });
      });
  }
];

// Create or Update Subjects from CSV
exports.uploadSubjectsFromCSV = [
  upload.single('file'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'CSV file is required' });

    const filePath = path.resolve(req.file.path);
    const subjects = [];
    const skippedSubjects = [];

    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on('data', (row) => {
        const normalize = (key) => key?.trim().toLowerCase();
        const getField = (fieldName) => {
          const key = Object.keys(row).find(k => normalize(k) === normalize(fieldName));
          return key ? row[key] || null : null;
        };

        const Sub_Code = getField('Sub_Code')?.trim();
        const Sub_Name = getField('Sub_Name')?.trim();

        if (!Sub_Code || !Sub_Name) {
          skippedSubjects.push({
            Sub_Code: Sub_Code || 'MISSING',
            Sub_Name: Sub_Name || 'MISSING',
            reason: !Sub_Code ? 'Missing Sub_Code' : 'Missing Sub_Name'
          });
          return;
        }

        subjects.push({
          Course_ID: getField('Course_ID')?.trim(),
          Sem_Id: getField('Sem_Id')?.trim(),
          Specialization: getField('Specialization')?.trim(),
          Sub_Code,
          Sub_Name,
          Semester: getField('Semester')?.trim(),
          Year: getField('Year')?.trim(),
        });
      })
      .on('end', async () => {
        try {
          let inserted = 0;
          let updated = 0;
          const insertedSubjects = [];
          const updatedSubjects = [];

          for (const subject of subjects) {
            const existing = await Subject.findOne({ Sub_Code: subject.Sub_Code });

            if (existing) {
              await Subject.findOneAndUpdate({ Sub_Code: subject.Sub_Code }, subject, { new: true });
              updated++;
              updatedSubjects.push(subject.Sub_Code);
            } else {
              await Subject.create(subject);
              inserted++;
              insertedSubjects.push(subject.Sub_Code);
            }
          }

          fs.unlinkSync(filePath);

          const response = {
            message: 'Subjects processed successfully',
            inserted,
            updated,
            skipped: skippedSubjects.length,
            insertedSubjects,
            updatedSubjects,
            skippedSubjects,
            totalProcessed: subjects.length + skippedSubjects.length
          };

          if (skippedSubjects.length > 0) {
            response.message = `Subjects processed with ${skippedSubjects.length} skipped due to missing fields.`;
          }

          res.status(200).json(response);
        } catch (err) {
          console.error(err);
          res.status(500).json({ message: 'Failed to upload subjects' });
        }
      })
      .on('error', (err) => {
        console.error('CSV parse error:', err);
        res.status(500).json({ message: 'Failed to parse CSV file' });
      });
  }
];

exports.uploadTeachersFromCSV = [
  upload.single('file'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: 'CSV file is required' });
    }

    const filePath = path.resolve(req.file.path);
    const teachers = [];
    const skippedTeachers = [];
    const failedTeachers = [];

    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on('data', (row) => {
        const normalize = (key) => key?.trim().toLowerCase();
        const getField = (fieldName) => {
          const key = Object.keys(row).find(k => normalize(k) === normalize(fieldName));
          return key ? row[key]?.trim() || null : null;
        };

        const name = getField('name');
        const email = getField('email');
        const password = getField('password');

        if (!name || !email || !password) {
          skippedTeachers.push({
            name: name || 'MISSING',
            email: email || 'MISSING',
            reason: 'Missing required fields (name/email/password)'
          });
          return;
        }

        teachers.push({ name, email, password });
      })
      .on('end', async () => {
        let inserted = 0;
        let skipped = skippedTeachers.length;
        let failed = 0;
        const insertedTeachers = [];

        for (const { name, email, password } of teachers) {
          try {
            const hashedPassword = await bcrypt.hash(password, 10);
            const existing = await Teacher.findOne({ email });

            if (existing) {
              // Update existing teacher
              existing.name = name;
              existing.password = hashedPassword;
              await existing.save();

              inserted++;
              insertedTeachers.push(email);
              continue;
            }

            const newTeacher = new Teacher({
              name,
              email,
              mobileNumber: null,
              password: hashedPassword,
            });

            await newTeacher.save();
            inserted++;
            insertedTeachers.push(email);
          } catch (err) {
            failed++;
            failedTeachers.push({
              name,
              email,
              reason: err.message || 'Unknown error'
            });
          }
        }

        fs.unlinkSync(filePath);

        res.status(200).json({
          message: `Teachers upload completed with ${skipped} skipped and ${failed} failed`,
          inserted,
          skipped,
          failed,
          total: teachers.length + skippedTeachers.length,
          insertedTeachers,
          skippedTeachers,
          failedTeachers
        });
      })
      .on('error', (err) => {
        console.error('CSV Parse Error:', err);
        res.status(500).json({ message: 'Failed to parse CSV file' });
      });
  },
];
