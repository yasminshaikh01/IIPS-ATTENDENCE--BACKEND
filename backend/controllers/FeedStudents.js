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

// ✅ Updated: Create or Update Student by Roll Number
exports.uploadStudentsFromCSV = [
  upload.single('file'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: 'CSV file is required' });
    }

    const filePath = path.resolve(req.file.path);
    const studentRows = [];

    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on('data', (row) => {
        const normalize = (key) => key?.trim().toLowerCase();

        const getField = (fieldName) => {
          const key = Object.keys(row).find(k => normalize(k) === normalize(fieldName));
          return key ? row[key] || null : null;
        };

        const rollNumber = getField('Roll Number');
        if (!rollNumber) return;

        studentRows.push({
          rollNumber,
          fullName: getField('Student Name'),
          courseId: getField('Course_Id'),
          semId: getField('Sem_Id'),
          specialization: getField('Specialization'),
          email: getField('Email')?.toLowerCase() || null,
          phoneNumber: getField('Phone'),
          section: getField('section'),
          academicYear: getCurrentAcademicYear()
        });
      })
      .on('end', async () => {
        try {
          let inserted = 0, updated = 0;

          for (const student of studentRows) {
            const result = await Student.findOneAndUpdate(
              { rollNumber: student.rollNumber },
              { $set: student },
              { upsert: true, new: true }
            );

            // If result._id existed before update, it's an update
            const wasExisting = await Student.exists({ rollNumber: student.rollNumber });
            if (wasExisting) updated++;
            else inserted++;
          }

          fs.unlinkSync(filePath);
          res.status(200).json({
            message: 'Student database processed successfully',
            inserted,
            updated,
            total: studentRows.length
          });
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
