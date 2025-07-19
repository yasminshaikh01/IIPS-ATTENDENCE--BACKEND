const multer = require('multer');
const csvParser = require('csv-parser');
const fs = require('fs');
const path = require('path');
const Student = require('../models/Student');
const Course = require('../models/Course');
const upload = multer({ dest: 'uploads/' });
const Subject = require('../models/Subject');
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
          
          // Prepare response with validation results
          const response = {
            message: 'Student database processed successfully',
            inserted,
            updated,
            total: studentRows.length,
            insertedStudents,
            updatedStudents
          };

          // Include invalid roll numbers if any
          if (invalidRollNumbers.length > 0) {
            response.invalidRollNumbers = invalidRollNumbers;
            response.skipped = invalidRollNumbers.length;
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

    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on('data', (row) => {
        const normalize = (key) => key?.trim().toLowerCase();
        const getField = (fieldName) => {
          const key = Object.keys(row).find(k => normalize(k) === normalize(fieldName));
          return key ? row[key] || null : null;
        };

        const Course_Id = getField('Course_Id');
        if (!Course_Id) return;

        courses.push({
          Course_Id,
          Course_Name: getField('Course_Name'),
          No_of_Sem: parseInt(getField('No_of_Sem')),
        });
      })
      .on('end', async () => {
        try {
          for (const course of courses) {
            await Course.findOneAndUpdate(
              { Course_Id: course.Course_Id },
              course,
              { upsert: true, new: true }
            );
          }

          fs.unlinkSync(filePath);
          res.status(200).json({ message: 'Courses uploaded/updated successfully', count: courses.length });
        } catch (err) {
          console.error(err);
          res.status(500).json({ message: 'Failed to upload courses' });
        }
      });
  }
];

// Create or Update Subject from CSV
exports.uploadSubjectsFromCSV = [
  upload.single('file'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'CSV file is required' });

    const filePath = path.resolve(req.file.path);
    const subjects = [];

    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on('data', (row) => {
        const normalize = (key) => key?.trim().toLowerCase();
        const getField = (fieldName) => {
          const key = Object.keys(row).find(k => normalize(k) === normalize(fieldName));
          return key ? row[key] || null : null;
        };

        const Sub_Code = getField('Sub_Code');
        if (!Sub_Code) return;

        subjects.push({
          Course_ID: getField('Course_ID'),
          Sem_Id: getField('Sem_Id'),
          Specialization: getField('Specialization'),
          Sub_Code,
          Sub_Name: getField('Sub_Name'),
          Semester: getField('Semester'),
          Year: getField('Year'),
        });
      })
      .on('end', async () => {
        try {
          for (const subject of subjects) {
            await Subject.findOneAndUpdate(
              { Sub_Code: subject.Sub_Code },
              subject,
              { upsert: true, new: true }
            );
          }

          fs.unlinkSync(filePath);
          res.status(200).json({ message: 'Subjects uploaded/updated successfully', count: subjects.length });
        } catch (err) {
          console.error(err);
          res.status(500).json({ message: 'Failed to upload subjects' });
        }
      });
  }
];
