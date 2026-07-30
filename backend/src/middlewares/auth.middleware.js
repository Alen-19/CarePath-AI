const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authenticateJWT = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'carepath_ai_super_secret_jwt_key_2026');
      
      const user = await User.findById(decoded.id).select('-passwordHash');
      if (!user) {
        return res.status(401).json({ message: 'User not found. Authorization denied.' });
      }

      if (!user.isActive) {
        return res.status(403).json({ message: 'Account is deactivated. Contact admin.' });
      }

      req.user = user;
      next();
    } catch (err) {
      return res.status(401).json({ message: 'Token is invalid or expired. Authorization denied.' });
    }
  } else {
    return res.status(401).json({ message: 'No token provided. Authorization denied.' });
  }
};

const Doctor = require('../models/Doctor');

const authorizeRoles = (roles = []) => {
  if (typeof roles === 'string') {
    roles = [roles];
  }
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized.' });
    }
    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden. Access denied for this user role.' });
    }

    if (req.user.role === 'doctor') {
      const doctor = await Doctor.findOne({ userId: req.user._id });
      if (!doctor) {
        return res.status(403).json({ message: 'Doctor profile not found.' });
      }
      if (doctor.status === 'suspended') {
        return res.status(403).json({ 
          message: `Access denied. Your account is suspended. Reason: ${doctor.suspensionReason || 'Administrative suspension'}`,
          isSuspended: true,
          suspensionReason: doctor.suspensionReason
        });
      }
      if (!doctor.isVerified) {
        return res.status(403).json({ 
          message: 'Access denied. Your doctor account is pending administrator verification.' 
        });
      }
    }

    next();
  };
};

module.exports = {
  authenticateJWT,
  authorizeRoles
};
