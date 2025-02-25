
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const AttendanceSummary = require('../models/AttendanceSummary');
const mongoose = require('mongoose');
const emailService = require('../config/nodemailer');

// Get students by course and semester
exports.getStudentsByCourseAndSemester = async (req, res) => {
    
  try {
    const { className, semester } = req.body;
    
    if (!className || !semester) {
      return res.status(400).json({ message: 'Course and semester are required' });
    }
    
    const students = await Student.find({ 
      className,
      semester
    }).sort({ fullName: 1 });
    
    return res.status(200).json(students);
  } catch (error) {
    console.error('Error fetching students:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};


// Submit new attendance
exports.submitAttendance = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { course, semester, subject, date, attendance } = req.body;
    
    if (!course || !semester || !subject || !date || !attendance) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    
    // Create new attendance record
    // No need to check for existing records - we'll allow multiple entries for the same date
    const newAttendance = new Attendance({
      course,
      semester,
      subject,
      date: new Date(date),
      records: attendance,
      createdBy: req.user ? req.user._id : null
    });
    
    await newAttendance.save({ session });
    
    // Get current academic year (e.g., "2024-2025")
    const currentDate = new Date();
    let academicYear;
    if (currentDate.getMonth() < 6) { // Before July
      academicYear = `${currentDate.getFullYear()-1}-${currentDate.getFullYear()}`;
    } else {
      academicYear = `${currentDate.getFullYear()}-${currentDate.getFullYear()+1}`;
    }
    
    // Update attendance summary for each student
    for (const record of attendance) {
      // Find or create attendance summary for student
      let summary = await AttendanceSummary.findOne({
        studentId: record.studentId,
        course,
        semester,
        subject,
        academicYear
      }).session(session);
      
      if (!summary) {
        summary = new AttendanceSummary({
          studentId: record.studentId,
          course,
          semester,
          subject,
          academicYear,
          totalClasses: 1,
          attendedClasses: record.present ? 1 : 0,
          attendancePercentage: record.present ? 100 : 0
        });
      } else {
        summary.totalClasses += 1;
        if (record.present) {
          summary.attendedClasses += 1;
        }
        summary.attendancePercentage = (summary.attendedClasses / summary.totalClasses) * 100;
        summary.lastUpdated = Date.now();
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

// New controller method to get attendance by course, semester, subject, and academic year
// Controller to get attendance by course, semester, subject, and academic year
exports.getAttendanceByCourseAndSubject = async (req, res) => {
    try {
      const { course, semester, subject, academicYear } = req.body;
      
      // First, get all students in this course and semester
      const students = await Student.find({
        className: course,
        semester: semester
      });
      
      if (students.length === 0) {
        return res.status(404).json({ message: 'No students found for this course and semester' });
      }
      
      // Get attendance summaries for these students
      const attendanceSummaries = [];
      
      for (const student of students) {
        // Query to find attendance records
        const attendanceQuery = {
          studentId: student._id,
          semester: semester,
          academicYear: academicYear
        };
        
        // Add subject filter if it's provided
        if (subject) {
          attendanceQuery.subject = subject;
        }
        
        // Find attendance records
        const attendanceRecords = await Attendance.find({
          semester: semester,
          'records.studentId': student._id,
          ...(subject && { subject: subject })
        });
        
        // Calculate attendance for this student
        let classesAttended = 0;
        const totalClasses = attendanceRecords.length;
        
        // Count classes attended
        attendanceRecords.forEach(record => {
          const studentRecord = record.records.find(
            r => r.studentId.toString() === student._id.toString()
          );
          if (studentRecord && studentRecord.present) {
            classesAttended++;
          }
        });
        
        // If a subject is selected, create one record per student
        if (subject) {
          attendanceSummaries.push({
            studentId: student._id,
            studentName: student.fullName,
            rollNumber: student.rollNumber,
            subject: subject,
            classesAttended: classesAttended,
            totalClasses: totalClasses
          });
        } 
        // If no subject selected, find all subjects for this student
        else {
          // Get unique subjects for this student
          const subjectsQuery = await Attendance.distinct('subject', {
            semester: semester,
            'records.studentId': student._id
          });
          
          // For each subject, calculate attendance
          for (const subj of subjectsQuery) {
            const subjectRecords = await Attendance.find({
              semester: semester,
              subject: subj,
              'records.studentId': student._id
            });
            
            let subjClassesAttended = 0;
            const subjTotalClasses = subjectRecords.length;
            
            subjectRecords.forEach(record => {
              const studentRecord = record.records.find(
                r => r.studentId.toString() === student._id.toString()
              );
              if (studentRecord && studentRecord.present) {
                subjClassesAttended++;
              }
            });
            
            attendanceSummaries.push({
              studentId: student._id,
              studentName: student.fullName,
              rollNumber: student.rollNumber,
              subject: subj,
              classesAttended: subjClassesAttended,
              totalClasses: subjTotalClasses
            });
          }
        }
      }
      
      return res.status(200).json(attendanceSummaries);
    } catch (error) {
      console.error('Error fetching attendance by course and subject:', error);
      return res.status(500).json({ message: 'Server error' });
    }
  };

// Get detailed attendance for a student by subject, semester and academic year
exports.getStudentAttendanceDetail = async (req, res) => {
    try {
      const { studentId, subject, semester, academicYear } = req.params;
      
      console.log('Query params:', { studentId, subject, semester, academicYear });
      
      // Build query without academicYear initially
      const query = {
        semester,
        subject,
        'records.studentId': studentId
      };
      
      console.log('MongoDB query:', JSON.stringify(query));
      
      // Find attendance records matching the query
      const attendanceRecords = await Attendance.find(query).sort({ date: 1 });
      
      console.log('Records found:', attendanceRecords.length);
      
      if (!attendanceRecords || attendanceRecords.length === 0) {
        return res.status(404).json({ 
          message: 'No attendance records found',
          query: query
        });
      }
      
      // Format the records to show date and present/absent status
      const formattedRecords = attendanceRecords.map(record => {
        // Find the specific record for this student in the records array
        const studentRecord = record.records.find(
          r => r.studentId.toString() === studentId
        );
        
        return {
          date: record.date,
          present: studentRecord ? studentRecord.present : false
        };
      });
      
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