
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const AttendanceSummary = require('../models/AttendanceSummary');
const mongoose = require('mongoose');
const Course = require('../models/Course');
const Subject = require('../models/Subject');
const bcrypt = require("bcryptjs");
const emailService = require('../config/nodemailer');

// Get all subjects for a course and semester
exports.getSubjects = async (req, res) => {
  const { course, semester, specialization } = req.body;

  if (!course || !semester) {
    return res.status(400).json({ message: 'Course and semester are required' });
  }

  try {
    // Find course by Course_Name to get Course_Id
    const courseDoc = await Course.findOne({ Course_Name: course });
    if (!courseDoc) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Build the query
    const query = {
      Course_ID: courseDoc.Course_Id,
      Sem_Id: semester
    };

    // Add specialization if provided
    if (specialization) {
      query.Specialization = specialization;
    }

    const subjects = await Subject.find(query);
    res.status(200).json(subjects);
  } catch (err) {
    console.error('Error fetching subjects:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get students by course and semester
// Get students by course and semester
exports.getStudentsByCourseAndSemester = async (req, res) => {
  try {
    const { className, semester_id, specialization, section } = req.body;

    if (!className || !semester_id) {
      return res.status(400).json({ message: 'Class name and semester ID are required' });
    }

    // Step 1: Find the course using className (Course_Name)
    const course = await Course.findOne({ Course_Name: className });

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    console.log('Course found:', course.Course_Id, 'for className:', className, semester_id);

    // Step 2: Build the query
    const query = {
      courseId: course.Course_Id,
      semId: semester_id
    };

    // Step 3: Add specialization condition if provided
    if (specialization && specialization.trim() !== '') {
      query.specializations = { $in: [specialization] }; // Check if specialization exists in array
    }

    // Step 4: Add section condition if provided
    if (section && section.trim() !== '') {
      query.section = section;
    }

    console.log('Final query:', JSON.stringify(query));

    // Step 5: Fetch and return students
  const students = await Student.aggregate([
  { $match: query },
  {
    $addFields: {
      yearPart: {
        $toInt: {
          $substr: [ { $arrayElemAt: [ { $split: ["$rollNumber", "-"] }, 1 ] }, 2, 2 ] // gets '21' from '2K21'
        }
      },
      numericRoll: {
        $toInt: {
          $arrayElemAt: [ { $split: ["$rollNumber", "-"] }, 2 ]
        }
      }
    }
  },
  { $sort: { yearPart: 1, numericRoll: 1 } },
  { $project: { yearPart: 0, numericRoll: 0 } }
]);



    return res.status(200).json(students);
  } catch (error) {
    console.error('Error fetching students:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Submit new attendance
const getCurrentAcademicYear = () => {
  const year = new Date().getFullYear();
  return `${year}-${(year + 1).toString().slice(-2)}`;
};

exports.submitAttendance = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { courseName, semId, subjectCode, date, attendance, specialization, section } = req.body;

    if (!courseName || !semId || !subjectCode || !date || !attendance) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const course = await Course.findOne({ 
      Course_Name: courseName 
    });
    const courseId = course ? course.Course_Id : null;
    
    console.log('Received attendance data:', {
      courseId, 
      semId, 
      subjectCode, 
      date, 
      specialization, 
      section,
      attendanceCount: attendance.length
    });

    const academicYear = getCurrentAcademicYear();

    for (const record of attendance) {
      const { studentId, present } = record;
      if (!studentId) continue;

      console.log('Processing attendance for student:', studentId, 'Present:', present);

      // Verify student exists and matches optional filters
      const studentQuery = { _id: studentId };
      
      if (specialization && specialization.trim() !== '') {
        studentQuery.specializations = { $in: [specialization] };
      }
      
      if (section && section.trim() !== '') {
        studentQuery.section = section;
      }

      const studentExists = await Student.findOne(studentQuery).session(session);
      
      if (!studentExists) {
        console.log(`Student ${studentId} not found or doesn't match filters. Skipping.`);
        continue;
      }

      // Store attendance detail
      await Attendance.updateOne(
        {
          studentId,
          subjectCode
        },
        {
          $setOnInsert: { studentId, subjectCode },
          $push: {
            records: {
              date: new Date(date),
              present
            }
          }
        },
        { upsert: true, session }
      );

      console.log('Attendance record updated for student:', studentId);

      // Update or create summary
      let summary = await AttendanceSummary.findOne({
        studentId,
        courseId,
        semId,
        subjectCode,
        academicYear
      }).session(session);

      console.log('Attendance summary found:', summary ? 'Yes' : 'No', 'for student:', studentId);

      if (!summary) {
        summary = new AttendanceSummary({
          studentId,
          courseId,
          semId,
          subjectCode,
          academicYear,
          totalClasses: 1,
          attendedClasses: present ? 1 : 0,
          attendancePercentage: present ? 100 : 0
        });
        console.log('New attendance summary created for student:', studentId);
      } else {
        summary.totalClasses += 1;
        if (present) summary.attendedClasses += 1;
        summary.attendancePercentage = parseFloat(
          ((summary.attendedClasses / summary.totalClasses) * 100).toFixed(2)
        );
        summary.lastUpdated = new Date();
      }

      await summary.save({ session });
    }

    await session.commitTransaction();
    session.endSession();
    return res.status(201).json({ message: 'Attendance submitted successfully' });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Error submitting attendance:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Get attendance by course, semester, subject, and academic year with optional filters
exports.getAttendanceByCourseAndSubject = async (req, res) => {
  try {
    const { course, semester, subject, academicYear, specialization, section, startDate, endDate } = req.body;
    console.log('Query params:', { course, semester, subject, academicYear, specialization, section, startDate, endDate });

    // Step 1: Build student query
    const studentQuery = {
      courseId: course,
      semId: semester
    };

    // Add optional filters
    if (specialization && specialization.trim() !== '') {
      studentQuery.specializations = { $in: [specialization] };
    }

    if (section && section.trim() !== '') {
      studentQuery.section = section;
    }

    console.log('Student query:', JSON.stringify(studentQuery));

    // Step 2: Fetch students
    const students = await Student.find(studentQuery);

    if (students.length === 0) {
      return res.status(404).json({ 
        message: 'No students found for this course, semester, and filters',
        filters: { course, semester, specialization, section }
      });
    }

    const attendanceSummaries = [];

    // Convert start and end dates to Date objects if provided
    const fromDate = startDate ? new Date(startDate) : null;
    const toDate = endDate ? new Date(endDate) : null;

    // Step 3: Process each student's attendance
    for (const student of students) {
      const attendanceDoc = await Attendance.findOne({
        studentId: student._id,
        subjectCode: subject
      });

      let attended = 0;
      let total = 0;

      if (attendanceDoc?.records) {
        let filteredRecords = attendanceDoc.records;

        if (fromDate && toDate) {
          filteredRecords = filteredRecords.filter(record => {
            const recordDate = new Date(record.date);
            return recordDate >= fromDate && recordDate <= toDate;
          });
        }

        total = filteredRecords.length;
        attended = filteredRecords.filter(record => record.present).length;
      }

      console.log(`Attendance for student ${student.fullName} (${student._id}): ${attended}/${total}`);

      attendanceSummaries.push({
        studentId: student._id,
        studentName: student.fullName,
        rollNumber: student.rollNumber,
        courseId: student.courseId,
        semId: student.semId,
        specializations: student.specializations || [],
        section: student.section || '',
        subjectCode: subject,
        academicYear,
        classesAttended: attended,
        totalClasses: total,
        attendancePercentage: total > 0 ? Math.round((attended / total) * 100) : 0
      });
    }

    // Sort by roll number
    attendanceSummaries.sort((a, b) => {
      return a.rollNumber.localeCompare(b.rollNumber, undefined, { numeric: true });
    });

    return res.status(200).json({
      students: attendanceSummaries,
      totalStudents: attendanceSummaries.length,
      filters: { course, semester, subject, academicYear, specialization, section, startDate, endDate }
    });
  } catch (error) {
    console.error('Error fetching attendance by course and subject:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getStudentAttendanceDetail = async (req, res) => {
  try {
    const { studentId, subject } = req.params;
    const { startDate, endDate } = req.query;

    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      console.error('Invalid student ID:', studentId);
      return res.status(400).json({ message: 'Invalid student ID' });
    }

    const query = {
      studentId: new mongoose.Types.ObjectId(studentId),
      subjectCode: subject.trim(),
    };

    console.log('Searching attendance with query:', JSON.stringify(query, null, 2));

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const attendanceDoc = await Attendance.findOne(query);

    if (!attendanceDoc || !Array.isArray(attendanceDoc.records) || attendanceDoc.records.length === 0) {
      console.log('No attendance records found for student:', studentId, 'and subject:', subject);
      return res.status(200).json([]);
    }

    // Filter by date range if startDate and/or endDate are provided
    let filteredRecords = attendanceDoc.records;

    if (startDate || endDate) {
      const from = startDate ? new Date(startDate) : new Date('1970-01-01');
      const to = endDate ? new Date(endDate) : new Date(); // current date if endDate is not provided

      filteredRecords = filteredRecords.filter(record => {
        const recordDate = new Date(record.date);
        return recordDate >= from && recordDate <= to;
      });
    }

    const formattedRecords = filteredRecords
      .map(record => ({
        date: record.date,
        present: record.present
      }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    return res.status(200).json(formattedRecords);

  } catch (error) {
    console.error('Error fetching student attendance details:', error);
    return res.status(500).json({ 
      message: 'Server error',
      error: error.message
    });
  }
};


  
  // Get student information
  exports.getStudentById = async (req, res) => {
    try {
      const { id } = req.params;
      
      const student = await Student.findById(id).select('-password'); // Exclude password
      
      if (!student) {
        return res.status(404).json({ message: 'Student not found' });
      }
      
      return res.status(200).json(student);
    } catch (error) {
      console.error('Error fetching student information:', error);
      return res.status(500).json({ message: 'Server error' });
    }
  };

// Controller to send low attendance notifications
// Controller to send low attendance notifications
exports.sendLowAttendanceNotifications = async (req, res) => {
  try {
    const { attendanceSummary, threshold } = req.body;
    
    if (!attendanceSummary || !threshold) {
      return res.status(400).json({ message: 'Missing required data' });
    }

    // Filter students below threshold
    const lowAttendanceStudents = attendanceSummary.filter(record => {
      const percentage = (record.classesAttended / record.totalClasses) * 100;
      return percentage < threshold;
    });

    if (lowAttendanceStudents.length === 0) {
      return res.status(200).json({ 
        message: 'No students found below the threshold', 
        sentCount: 0 
      });
    }

    // Get subject name for the email
    const firstRecord = attendanceSummary[0];
    let subjectName = firstRecord.subject;

    // For each student, fetch their email and send notification
    let successCount = 0;
    let failedCount = 0;

    for (const student of lowAttendanceStudents) {
      try {
        // Fetch student details using _id
        const studentData = await Student.findOne({ _id: student.studentId });

        if (!studentData || !studentData.email) {
          console.log(`No email found for student ${student.studentName}`);
          failedCount++;
          continue;
        }

        const attendancePercentage = ((student.classesAttended / student.totalClasses) * 100).toFixed(2);
        const attendanceGap = threshold - attendancePercentage;
        const classesNeeded = calculateClassesNeeded(student.classesAttended, student.totalClasses, threshold);

        await sendLowAttendanceEmail(
          studentData.email,
          studentData.fullName,
          studentData.rollNumber,
          subjectName,
          attendancePercentage,
          threshold,
          attendanceGap,
          student.classesAttended,
          student.totalClasses,
          classesNeeded
        );

        successCount++;
      } catch (error) {
        console.error(`Error sending notification to ${student.studentName}:`, error);
        failedCount++;
      }
    }

    return res.status(200).json({
      message: 'Notifications processed',
      sentCount: successCount,
      failedCount: failedCount,
      totalProcessed: lowAttendanceStudents.length
    });

  } catch (error) {
    console.error('Error in sendLowAttendanceNotifications:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

  
  // Calculate how many consecutive classes a student needs to attend to reach the threshold
  function calculateClassesNeeded(present, total, threshold) {
    const currentPercentage = (present / total) * 100;
    
    if (currentPercentage >= threshold) return 0;
    
    let additionalClasses = 0;
    let newTotal = total;
    let newPresent = present;
    
    while ((newPresent / newTotal) * 100 < threshold) {
      additionalClasses++;
      newPresent++;
      newTotal++;
    }
    
    return additionalClasses;
  }
  
  // Function to send the low attendance email
  async function sendLowAttendanceEmail(
    email, 
    studentName, 
    rollNumber, 
    subject, 
    currentPercentage, 
    threshold, 
    gap, 
    present, 
    total,
    classesNeeded
  ) {
    // Format the email with HTML for better readability
    const emailSubject = `⚠️ IMPORTANT: Low Attendance Warning for ${subject}`;
    
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px;">
        <div style="background-color: #f8d7da; padding: 15px; border-radius: 5px; margin-bottom: 20px; border-left: 5px solid #dc3545;">
          <h2 style="color: #721c24; margin-top: 0;">Low Attendance Alert</h2>
          <p style="margin-bottom: 0;">This is an important notification regarding your attendance in ${subject}.</p>
        </div>
        
        <p>Dear <strong>${studentName}</strong> (Roll No: ${rollNumber}),</p>
        
        <p>We are writing to inform you that your current attendance in <strong>${subject}</strong> has fallen below the acceptable threshold.</p>
        
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Your current attendance:</strong> ${currentPercentage}% (${present} out of ${total} classes)</p>
          <p style="margin: 5px 0;"><strong>Required attendance threshold:</strong> ${threshold}%</p>
          <p style="margin: 5px 0;"><strong>Gap to minimum requirement:</strong> ${gap.toFixed(2)}%</p>
          <p style="margin: 5px 0;"><strong>Classes you need to attend consecutively:</strong> ${classesNeeded}</p>
        </div>
        
        <p><strong>Important:</strong> As per institutional policy, students with attendance below 75% may be prevented from taking examinations or may be subject to other academic penalties.</p>
        
        <div style="margin: 20px 0;">
          <h3>Actions Required:</h3>
          <ol>
            <li>Ensure regular attendance in all upcoming classes</li>
            <li>Meet with your course instructor to discuss your situation</li>
            <li>If you have legitimate reasons for absences (medical or otherwise), please submit appropriate documentation to the administration office</li>
          </ol>
        </div>
        
        <p>Please take this notification seriously and take immediate steps to improve your attendance. If you have any questions or need assistance, please contact your course instructor or the academic office.</p>
        
        <div style="margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
          <p style="margin: 5px 0;">Regards,</p>
          <p style="margin: 5px 0;"><strong>Academic Administration</strong></p>
          <p style="margin: 5px 0; color: #666; font-size: 0.9em;">This is an automated message. Please do not reply directly to this email.</p>
        </div>
      </div>
    `;
    
    try {
      await emailService.sendAttendanceEmail(
        email,
        emailSubject,
        emailHtml
      );
      return true;
    } catch (error) {
      console.error('Error sending attendance email:', error);
      throw error;
    }
  }

// delete attendance 
exports.deleteAttendance = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { courseId, semId, subjectCode, date, specialization, section } = req.body;

    // Validate required fields
    if (!courseId || !semId || !subjectCode || !date) {
      return res.status(400).json({ message: 'courseId, semId, subjectCode, and date are required' });
    }

  

    console.log('Deleting attendance for:', {
      courseId, 
      semId, 
      subjectCode, 
      date, 
      specialization, 
      section
    });

    const academicYear = getCurrentAcademicYear();
  const targetDate = new Date(date + 'T00:00:00.000Z');

    // Find all students that match the criteria
    const studentQuery = {};
    
    if (specialization && specialization.trim() !== '') {
      studentQuery.specializations = { $in: [specialization] };
    }
    
    if (section && section.trim() !== '') {
      studentQuery.section = section;
    }

    const students = await Student.find(studentQuery).session(session);
    
    if (students.length === 0) {
      return res.status(404).json({ message: 'No students found matching the criteria' });
    }

    let deletedCount = 0;
    let updatedSummaries = 0;

    for (const student of students) {
      const studentId = student._id;

      // Find attendance record for this student and subject
      const attendanceRecord = await Attendance.findOne({
        studentId,
        subjectCode
      }).session(session);

      if (!attendanceRecord) {
        console.log(`No attendance record found for student ${studentId}`);
        continue;
      }

      // Find the specific date record
      const recordIndex = attendanceRecord.records.findIndex(record => 
        record.date.toDateString() === targetDate.toDateString()
      );

      if (recordIndex === -1) {
        console.log(`No attendance record found for student ${studentId} on date ${date}`);
        continue;
      }

      // Get the attendance status before deletion (for summary update)
      const wasPresent = attendanceRecord.records[recordIndex].present;

      // Remove the specific date record
      attendanceRecord.records.splice(recordIndex, 1);

      // If no more records exist, delete the entire attendance document
      if (attendanceRecord.records.length === 0) {
        await Attendance.deleteOne({ _id: attendanceRecord._id }).session(session);
        console.log(`Deleted entire attendance record for student ${studentId}`);
      } else {
        await attendanceRecord.save({ session });
        console.log(`Removed date record for student ${studentId}`);
      }

      deletedCount++;

      // Update attendance summary
      const summary = await AttendanceSummary.findOne({
        studentId,
        courseId,
        semId,
        subjectCode,
        academicYear
      }).session(session);

      if (summary) {
        // Decrease total classes
        summary.totalClasses = Math.max(0, summary.totalClasses - 1);
        
        // Decrease attended classes if student was present
        if (wasPresent) {
          summary.attendedClasses = Math.max(0, summary.attendedClasses - 1);
        }

        // Recalculate percentage
        if (summary.totalClasses === 0) {
          // If no classes left, delete the summary
          await AttendanceSummary.deleteOne({ _id: summary._id }).session(session);
          console.log(`Deleted attendance summary for student ${studentId}`);
        } else {
          summary.attendancePercentage = parseFloat(
            ((summary.attendedClasses / summary.totalClasses) * 100).toFixed(2)
          );
          summary.lastUpdated = new Date();
          await summary.save({ session });
          updatedSummaries++;
          console.log(`Updated attendance summary for student ${studentId}`);
        }
      }
    }

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({ 
      message: 'Attendance deleted successfully',
      deletedRecords: deletedCount,
      updatedSummaries: updatedSummaries
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Error deleting attendance:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

//merge attendance
exports.mergeAttendance = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { courseId, semId, subjectCode, date, specialization, section, finalCount } = req.body;

    // Validate required fields
    if (!courseId || !semId || !subjectCode || !date || !finalCount) {
      return res.status(400).json({ 
        message: 'courseId, semId, subjectCode, date, and finalCount are required' 
      });
    }

    if (finalCount < 1) {
      return res.status(400).json({ 
        message: 'finalCount must be at least 1' 
      });
    }

    console.log('Merging attendance for:', {
      courseId, 
      semId, 
      subjectCode, 
      date, 
      specialization, 
      section,
      finalCount
    });

    const academicYear = getCurrentAcademicYear();
    // Convert date string (YYYY-MM-DD) to Date object for comparison
    const targetDate = new Date(date + 'T00:00:00.000Z');

    // Find all students that match the criteria
    const studentQuery = {};
    
    if (specialization && specialization.trim() !== '') {
      studentQuery.specializations = { $in: [specialization] };
    }
    
    if (section && section.trim() !== '') {
      studentQuery.section = section;
    }

    const students = await Student.find(studentQuery).session(session);
    
    if (students.length === 0) {
      return res.status(404).json({ message: 'No students found matching the criteria' });
    }

    let processedStudents = 0;
    let updatedSummaries = 0;
    let mergeStats = {
      studentsWithRecords: 0,
      totalRecordsRemoved: 0,
      presentRecordsKept: 0,
      absentRecordsKept: 0
    };

    for (const student of students) {
      const studentId = student._id;

      // Find attendance record for this student and subject
      const attendanceRecord = await Attendance.findOne({
        studentId,
        subjectCode
      }).session(session);

      if (!attendanceRecord) {
        console.log(`No attendance record found for student ${studentId}`);
        continue;
      }

      // Find all records for the target date
      const dateRecords = attendanceRecord.records.filter(record => 
        record.date.toDateString() === targetDate.toDateString()
      );

      if (dateRecords.length === 0) {
        console.log(`No attendance records found for student ${studentId} on date ${date}`);
        continue;
      }

      if (dateRecords.length <= finalCount) {
        console.log(`Student ${studentId} already has ${dateRecords.length} records (≤ ${finalCount}), no merge needed`);
        continue;
      }

      mergeStats.studentsWithRecords++;
      
      // Separate present and absent records
      const presentRecords = dateRecords.filter(record => record.present === true);
      const absentRecords = dateRecords.filter(record => record.present === false);

      console.log(`Student ${studentId}: ${presentRecords.length} present, ${absentRecords.length} absent records`);

      // Determine how many to keep of each type
      let keepPresent = Math.min(presentRecords.length, finalCount);
      let keepAbsent = Math.max(0, finalCount - keepPresent);

      // If we have more absent records than we need, adjust
      if (keepAbsent > absentRecords.length) {
        keepAbsent = absentRecords.length;
        keepPresent = finalCount - keepAbsent;
      }

      console.log(`Student ${studentId}: Keeping ${keepPresent} present, ${keepAbsent} absent records`);

      // Create the final records array for this date
      const finalRecords = [
        ...presentRecords.slice(0, keepPresent),
        ...absentRecords.slice(0, keepAbsent)
      ];

      mergeStats.presentRecordsKept += keepPresent;
      mergeStats.absentRecordsKept += keepAbsent;
      mergeStats.totalRecordsRemoved += (dateRecords.length - finalRecords.length);

      // Remove all records for this date
      attendanceRecord.records = attendanceRecord.records.filter(record => 
        record.date.toDateString() !== targetDate.toDateString()
      );

      // Add back the final records
      attendanceRecord.records.push(...finalRecords);

      await attendanceRecord.save({ session });
      processedStudents++;

      // Update attendance summary
      const summary = await AttendanceSummary.findOne({
        studentId,
        courseId,
        semId,
        subjectCode,
        academicYear
      }).session(session);

      if (summary) {
        // Calculate the difference in classes and attendance
        const originalTotalClasses = dateRecords.length;
        const originalPresentClasses = presentRecords.length;
        const newTotalClasses = finalRecords.length;
        const newPresentClasses = finalRecords.filter(r => r.present).length;

        // Update summary
        summary.totalClasses -= (originalTotalClasses - newTotalClasses);
        summary.attendedClasses -= (originalPresentClasses - newPresentClasses);

        // Ensure non-negative values
        summary.totalClasses = Math.max(0, summary.totalClasses);
        summary.attendedClasses = Math.max(0, summary.attendedClasses);

        // Recalculate percentage
        if (summary.totalClasses === 0) {
          summary.attendancePercentage = 0;
        } else {
          summary.attendancePercentage = parseFloat(
            ((summary.attendedClasses / summary.totalClasses) * 100).toFixed(2)
          );
        }

        summary.lastUpdated = new Date();
        await summary.save({ session });
        updatedSummaries++;

        console.log(`Updated summary for student ${studentId}: ${summary.attendedClasses}/${summary.totalClasses} (${summary.attendancePercentage}%)`);
      }
    }

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({ 
      message: 'Attendance merged successfully',
      processedStudents: processedStudents,
      updatedSummaries: updatedSummaries,
      mergeStatistics: mergeStats
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Error merging attendance:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};