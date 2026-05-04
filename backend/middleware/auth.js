const jwt = require('jsonwebtoken');

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided.' });
    }

    const token = authHeader.split(' ')[1];
    
    // Decode Firebase JWT token
    const decoded = jwt.decode(token);
    
    if (!decoded || !decoded.sub) {
      return res.status(401).json({ message: 'Invalid token.' });
    }

    // Firebase puts user ID in 'sub' or 'uid' field
    req.user = {
      uid: decoded.uid || decoded.sub,
      email: decoded.email || '',
      username: decoded.name || 
                decoded.email?.split('@')[0] || 
                'User'
    };

    console.log('Auth user:', req.user.username, req.user.uid);
    next();

  } catch (error) {
    console.error('Auth error:', error.message);
    res.status(401).json({ message: 'Authentication failed.' });
  }
};

module.exports = authMiddleware;
