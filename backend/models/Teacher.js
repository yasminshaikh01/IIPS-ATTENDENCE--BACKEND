const mongoose = require("mongoose");

const teacherSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    mobileNumber: { type: String },
    faculty_id: { type: String, unique: true, sparse: true, default: null },

    otp: { type: String },
    otpExpiry: { type: Date },
    photo: { 
      type: String, 
      default: "http://res.cloudinary.com/duxvbwdf3/image/upload/v1731004725/question/xnykk7ixq6bk2qdrppty.png" 
    },

    sessions: [
      {
        sessionId: { type: String },
        createdAt: { type: Date, default: Date.now },
        expiresAt: { type: Date },
      },
    ],

    resetPasswordToken: { type: String },
    resetPasswordExpiry: { type: Date },

    subjectAccess: [
      {
        subjectCode: { type: String, required: true }
      }
    ]
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Teacher", teacherSchema);
